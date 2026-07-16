import { DEFAULT_CDP_URL, withTmallPage } from '../cdp.js';
import { callMtop, type MtopSpec } from '../mtop.js';
import { asRecord, firstText, text, type BrowserOptions } from './common.js';

export const REVIEWS_TARGET = 'myseller.taobao.com';

const reviewSpec = (key: string, api: string, description: string): MtopSpec => ({
  adapter: 'reviews',
  key,
  api,
  version: '6.0',
  appKey: '12574478',
  method: 'GET',
  dataType: 'jsonp',
  valueType: 'string',
  target: REVIEWS_TARGET,
  description
});

export const REVIEW_SPECS = {
  detailList: reviewSpec('detailList', 'mtop.taobao.rate.detaillist.get', '天猫商品买家评价列表')
} satisfies Record<string, MtopSpec>;

export interface ReviewItem {
  itemId: string;
  skuId: string;
  url: string;
}

export interface ReviewListOptions extends BrowserOptions {
  itemId?: string;
  itemUrl?: string;
  skuId?: string;
  pageNum?: number;
  pageSize?: number;
  maxPages?: number;
  limit?: number;
}

export function parseReviewLinks(value: string): ReviewItem[] {
  const seen = new Set<string>();
  return extractLinksFromText(value)
    .map(parseReviewLink)
    .filter((item): item is ReviewItem => Boolean(item))
    .filter((item) => {
      const key = `${item.itemId}:${item.skuId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function readReviews(options: ReviewListOptions): Promise<Record<string, unknown>[]> {
  const explicit = parseReviewLink(options.itemUrl || options.itemId || '');
  const item: ReviewItem | null = explicit
    ? { ...explicit, skuId: text(options.skuId) || explicit.skuId }
    : options.itemId
      ? { itemId: normalizeId(options.itemId), skuId: text(options.skuId), url: '' }
      : null;
  if (!item?.itemId) {
    return [{
      itemId: '',
      page: '',
      reviewId: '',
      result: 'failed',
      note: '请提供 --item-id 或 --item-url'
    }];
  }

  const pageSize = positiveInt(options.pageSize, 20, 100);
  const maxPages = positiveInt(options.maxPages ?? options.pageNum, 1, 20);
  const startPage = positiveInt(options.pageNum, 1, 200);
  const limit = positiveInt(options.limit, 100, 1000);
  const rows: Record<string, unknown>[] = [];
  let visibility: Record<string, unknown> | null = null;

  for (let page = startPage; page < startPage + maxPages; page += 1) {
    const response = await callMtop<unknown>(REVIEW_SPECS.detailList, {
      ...options,
      data: buildReviewRequestData(item, page, pageSize),
      timeoutMs: 20_000
    });
    let payload = parsePayload(response.data);
    let source = 'mtop';
    let capturedAt = response.capturedAt;
    let reviews = extractReviewItems(payload);
    let fallbackError = '';
    if (!reviews.length) {
      const fallback = await fetchReviewFallback(item, page, pageSize, options);
      if (fallback.ok) {
        payload = parsePayload(fallback.data);
        source = fallback.source;
        capturedAt = fallback.capturedAt;
        reviews = extractReviewItems(payload);
      } else {
        fallbackError = fallback.error || '';
      }
    }
    visibility = mergeVisibility(visibility, extractReviewVisibility(payload, item));
    if (!reviews.length) {
      if (!rows.length) {
        return [{
          itemId: item.itemId,
          skuId: item.skuId,
          page,
          reviewId: '',
          buyerNick: '',
          content: '',
          result: 'no_data',
          note: fallbackError
            ? `接口未返回评价列表；rate 兜底提示：${fallbackError}`
            : '接口未返回评价列表，可能暂无评价或评价数据需要详情页/验证态。',
          capturedAt
        }];
      }
      break;
    }
    rows.push(...reviews.map((review, index) => normalizeReview(review, {
      ...item,
      page,
      index: rows.length + index + 1,
      source,
      capturedAt
    })));
    const paginator = extractPaginator(payload);
    if (rows.length >= limit) break;
    if (paginator.lastPage && page >= paginator.lastPage) break;
    if (reviews.length < pageSize) break;
  }

  const output = dedupeReviews(rows).slice(0, limit);
  if (visibility) {
    output.push({
      itemId: item.itemId,
      skuId: item.skuId,
      page: 'summary',
      reviewId: '',
      buyerNick: '',
      content: '',
      result: 'visibility',
      note: JSON.stringify({ ...visibility, collectedReviews: output.length })
    });
  }
  return output;
}

export function buildReviewRequestData(item: ReviewItem, pageNo: number, pageSize: number): Record<string, unknown> {
  return {
    showTrueCount: false,
    auctionNumId: item.itemId,
    pageNo,
    pageSize,
    orderType: '',
    searchImpr: '-8',
    expression: '',
    skuVids: '',
    rateSrc: 'pc_rate_list',
    rateType: '',
    foldFlag: '0'
  };
}

async function fetchReviewFallback(
  item: ReviewItem,
  page: number,
  pageSize: number,
  options: BrowserOptions
): Promise<{ ok: boolean; data: unknown; source: string; capturedAt: string; error?: string }> {
  const result = await withTmallPage(
    { cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL, match: options.target ?? REVIEWS_TARGET, openIfMissing: false },
    async (cdpPage) => cdpPage.evaluateJson<{ ok: boolean; data?: unknown; source?: string; error?: string }>(reviewFallbackExpression(item, page, pageSize))
  );
  return {
    ok: result.ok,
    data: result.data,
    source: result.source || 'rate-api',
    capturedAt: new Date().toISOString(),
    error: result.error
  };
}

function reviewFallbackExpression(item: ReviewItem, page: number, pageSize: number): string {
  const urls = JSON.stringify(buildReviewApiUrls(item, page, pageSize));
  return `((async () => {
    const urls = ${urls};
    const safeJsonParse = (value) => {
      if (value == null || value === '') return null;
      if (typeof value === 'object') return value;
      const text = String(value).trim();
      try { return JSON.parse(text); } catch {}
      const match = text.match(/^[\\w$.]+\\(([\\s\\S]*)\\)\\s*;?$/);
      if (match) {
        try { return JSON.parse(match[1]); } catch {}
      }
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch {}
      }
      return null;
    };
    const riskMessage = (payload) => {
      const summary = JSON.stringify(payload || {}).slice(0, 500);
      if (/FAIL_SYS_USER_VALIDATE|RGV587|验证|风控|login|登录|x5sec/i.test(summary)) return summary;
      const ret = Array.isArray(payload?.ret) ? payload.ret.join(';') : String(payload?.ret || '');
      if (/FAIL|ERROR|DENY|LOGIN/i.test(ret)) return ret || summary;
      return '';
    };
    const errors = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json,text/javascript,*/*;q=0.01' }
        });
        const text = await response.text();
        const payload = safeJsonParse(text);
        const risk = riskMessage(payload);
        if (response.ok && payload && !risk) return JSON.stringify({ ok: true, source: 'rate-api', data: payload });
        errors.push('HTTP ' + response.status + ': ' + (risk || text.replace(/\\s+/g, ' ').slice(0, 160)));
        if (risk) break;
      } catch (error) {
        errors.push(String(error && (error.message || error)).slice(0, 240));
      }
    }
    const requestJsonp = (rawUrl, timeoutMs = 12000) => new Promise((resolve, reject) => {
      if (!document?.createElement || !(document.head || document.documentElement || document.body)) {
        reject(new Error('JSONP unavailable'));
        return;
      }
      const callbackName = '__tmall_cli_reviews_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const jsonpUrl = new URL(rawUrl);
      jsonpUrl.searchParams.set('callback', callbackName);
      jsonpUrl.searchParams.set('_ksTS', Date.now() + '_' + Math.floor(Math.random() * 100));
      const script = document.createElement('script');
      const cleanup = () => {
        clearTimeout(timer);
        try { delete window[callbackName]; } catch { window[callbackName] = undefined; }
        try { script.remove(); } catch {}
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, timeoutMs);
      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('JSONP failed'));
      };
      script.src = jsonpUrl.href;
      (document.head || document.documentElement || document.body).appendChild(script);
    });
    for (const url of urls) {
      try {
        const payload = await requestJsonp(url);
        const risk = riskMessage(payload);
        if (payload && !risk) return JSON.stringify({ ok: true, source: 'rate-jsonp', data: payload });
        errors.push('JSONP risk: ' + risk);
        if (risk) break;
      } catch (error) {
        errors.push(String(error && (error.message || error)).slice(0, 240));
      }
    }
    return JSON.stringify({ ok: false, source: 'rate-api', error: errors.filter(Boolean).join('; ') || 'rate API unavailable' });
  })())`;
}

function buildReviewApiUrls(item: ReviewItem, page: number, pageSize: number): string[] {
  const query = new URLSearchParams({
    itemId: item.itemId,
    itemNumId: item.itemId,
    currentPage: String(page),
    pageSize: String(pageSize),
    order: '3',
    append: '0',
    content: '1'
  });
  return [
    `https://rate.tmall.com/list_detail_rate.htm?${query.toString()}`,
    `https://rate.tmall.com/list_detail_rate.htm?itemId=${encodeURIComponent(item.itemId)}&currentPage=${page}&pageSize=${pageSize}&order=3`
  ];
}

function parseReviewLink(rawUrl: string): ReviewItem | null {
  const raw = text(rawUrl).replace(/[、，,;；]+$/g, '');
  if (!raw) return null;
  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(raw, 'https://detail.tmall.com/item.htm');
    } catch {
      url = null;
    }
  }
  const itemId = readSearchParam(url, ['id', 'itemId', 'item_id', 'itemNumId', 'item_num_id'])
    || normalizeId(raw);
  const skuId = readSearchParam(url, ['skuId', 'sku_id']);
  if (!/^\d{6,}$/.test(itemId)) return null;
  return {
    itemId,
    skuId,
    url: url?.href ?? raw
  };
}

function extractLinksFromText(value: string): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const urls = raw.match(/https?:\/\/[\s\S]*?(?=https?:\/\/|$)/gi);
  if (urls?.length) return urls.map((item) => item.replace(/[、，,;；]+$/g, '').trim()).filter(Boolean);
  return raw.split(/[\n\r\t 、，,;；]+/).map((item) => item.trim()).filter(Boolean);
}

function readSearchParam(url: URL | null, keys: string[]): string {
  if (!url) return '';
  for (const key of keys) {
    const value = text(url.searchParams.get(key));
    if (value) return value;
  }
  return '';
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const match = raw.match(/^[\w$.]+\(([\s\S]*)\)\s*;?$/);
    if (!match) return {};
    try {
      return JSON.parse(match[1]) as unknown;
    } catch {
      return {};
    }
  }
}

function extractReviewItems(payload: unknown): Record<string, unknown>[] {
  return firstArray(payload, [
    'rateDetail.rateList',
    'rateDetail.list',
    'data.rateDetail.rateList',
    'data.rateList',
    'data.list',
    'data.items',
    'data.comments',
    'data.feedbacks',
    'result.rateList',
    'result.list',
    'model.rateDetail.rateList',
    'rateList',
    'list',
    'items',
    'comments'
  ]);
}

function normalizeReview(review: Record<string, unknown>, context: ReviewItem & { page: number; index: number; source: string; capturedAt: string }): Record<string, unknown> {
  const append = appendComment(review);
  const images = normalizeImageList(review.pics || review.images || review.photos || review.pictures || review.imageList || review.ratePicList || review.feedPicPathList || review.feedPicList);
  return {
    itemId: context.itemId,
    skuId: context.skuId,
    itemUrl: context.url,
    page: context.page,
    index: context.index,
    reviewId: text(review.id ?? review.rateId ?? review.commentId ?? review.feedbackId ?? review.idStr),
    buyerNick: text(review.reduceUserNick ?? review.displayUserNick ?? review.userNick ?? review.nick ?? review.buyerNick ?? asRecord(review.user).nick),
    reviewTime: text(review.rateDate ?? review.feedbackDate ?? review.commentTime ?? review.date ?? review.createTime ?? review.gmtCreate),
    score: text(review.rateStar ?? review.serviceRate ?? review.star ?? review.score ?? review.grade),
    sku: normalizeSku(review.auctionSku ?? review.skuInfo ?? review.skuMap ?? review.sku ?? review.skuValueStr ?? review.itemSku),
    content: firstText(review, ['rateContent', 'feedback', 'content', 'comment', 'commentContent', 'reviewContent', 'text']),
    appendContent: append.content,
    appendTime: append.time,
    imageCount: images.length,
    images: images.join('\n'),
    source: context.source,
    result: 'success',
    capturedAt: context.capturedAt
  };
}

function extractPaginator(payload: unknown): { total: number; lastPage: number } {
  return {
    total: numberAt(payload, [
      'rateDetail.paginator.items',
      'rateDetail.paginator.total',
      'data.rateDetail.paginator.items',
      'data.total',
      'data.totalCount',
      'result.total',
      'paginator.items',
      'total',
      'totalCount'
    ]),
    lastPage: numberAt(payload, [
      'rateDetail.paginator.lastPage',
      'data.rateDetail.paginator.lastPage',
      'data.lastPage',
      'paginator.lastPage',
      'lastPage'
    ])
  };
}

function extractReviewVisibility(payload: unknown, item: ReviewItem): Record<string, unknown> | null {
  const summary = {
    itemId: item.itemId,
    feedAllCount: valueAt(payload, ['feedAllCount', 'data.feedAllCount', 'rateDetail.feedAllCount', 'data.rateDetail.feedAllCount']),
    feedAllCountFuzzy: valueAt(payload, ['feedAllCountFuzzy', 'data.feedAllCountFuzzy', 'rateDetail.feedAllCountFuzzy']),
    foldCount: valueAt(payload, ['foldCount', 'foldFlagCount', 'data.foldCount', 'rateDetail.foldCount']),
    firstPageTips: valueAt(payload, ['firstPageTips', 'data.firstPageTips', 'rateDetail.firstPageTips'])
  };
  return Object.values(summary).some(Boolean) ? summary : null;
}

function mergeVisibility(current: Record<string, unknown> | null, next: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!next) return current;
  if (!current) return next;
  return { ...next, ...Object.fromEntries(Object.entries(current).filter(([, value]) => value)) };
}

function firstArray(payload: unknown, paths: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.map(asRecord);
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((target, part) => asRecord(target)[part], payload);
    if (Array.isArray(value)) return value.map(asRecord);
  }
  return [];
}

function numberAt(payload: unknown, paths: string[]): number {
  for (const path of paths) {
    const value = valueAt(payload, [path]);
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function valueAt(payload: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((target, part) => asRecord(target)[part], payload);
    if (value != null && value !== '') return value;
  }
  return '';
}

function normalizeSku(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return text(value);
  if (Array.isArray(value)) return value.map(normalizeSku).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, val]) => `${text(key)}:${text(val)}`).filter((item) => !/:$/.test(item)).join('; ');
  }
  return text(value);
}

function appendComment(review: Record<string, unknown>): { content: string; time: string } {
  const raw = review.appendComment || review.append || review.appendRate || review.additionalComment;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const record = asRecord(first);
  if (!Object.keys(record).length) return { content: typeof first === 'string' ? text(first) : '', time: '' };
  return {
    content: firstText(record, ['content', 'rateContent', 'comment', 'feedback', 'text']),
    time: firstText(record, ['commentTime', 'rateDate', 'date', 'createTime', 'gmtCreate'])
  };
}

function normalizeImageList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => {
    if (typeof item === 'string') return normalizeUrl(item);
    const record = asRecord(item);
    return normalizeUrl(record.url || record.picUrl || record.imgUrl || record.imageUrl || record.thumbnail || record.src);
  }).filter(Boolean);
}

function normalizeUrl(value: unknown): string {
  const url = text(value);
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}

function dedupeReviews(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.reviewId
      ? `${row.itemId}|${row.reviewId}`
      : `${row.itemId}|${row.buyerNick}|${row.reviewTime}|${row.sku}|${row.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeId(value: unknown): string {
  const match = text(value).match(/\d{6,}/);
  return match ? match[0] : '';
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}
