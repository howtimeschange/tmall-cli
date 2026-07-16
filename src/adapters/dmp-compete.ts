import { DEFAULT_CDP_URL, withTmallPage } from '../cdp.js';
import { CommandExecutionError } from '../errors.js';
import { DMP_TARGET } from './dmp.js';
import { type BrowserOptions } from './common.js';

export interface DmpCompeteOptions extends BrowserOptions {
  shopList?: string;
  beginDate?: string;
  endDate?: string;
  peerBeginDate?: string;
  peerEndDate?: string;
  maxCompetitors?: number;
}

interface PageRowsResult {
  ok: boolean;
  title: string;
  href: string;
  rows?: Record<string, unknown>[];
  error?: string;
}

export async function readDmpCompeteShops(options: DmpCompeteOptions = {}): Promise<Record<string, unknown>[]> {
  const result = await withTmallPage(
    { cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL, match: options.target ?? DMP_TARGET, openIfMissing: false },
    async (page) => page.evaluateJson<PageRowsResult>(dmpCompeteExpression('shops', options))
  );
  if (!result.ok) throw new CommandExecutionError(`DMP 竞品店铺解析失败: ${result.error ?? 'unknown error'}`);
  return result.rows ?? [];
}

export async function readDmpCompetePaidProbe(options: DmpCompeteOptions = {}): Promise<Record<string, unknown>[]> {
  const result = await withTmallPage(
    { cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL, match: options.target ?? DMP_TARGET, openIfMissing: false },
    async (page) => page.evaluateJson<PageRowsResult>(dmpCompeteExpression('probe', options))
  );
  if (!result.ok) throw new CommandExecutionError(`DMP 竞品付费分析探针失败: ${result.error ?? 'unknown error'}`);
  return result.rows ?? [];
}

export function buildDmpCompetePaidPlan(options: DmpCompeteOptions = {}): Record<string, unknown>[] {
  const dates = normalizeDates(options);
  const competitorIds = ['<competitorToken>'];
  const base = {
    competitorIds,
    beginDate: dates.beginDate,
    endDate: dates.endDate,
    peerBeginDate: dates.peerBeginDate,
    peerEndDate: dates.peerEndDate,
    competitionType: '1'
  };
  return [
    endpointPlan('/api/competition/monitor/list', 'GET', { competitionType: '1', pageSize: 100 }),
    endpointPlan('/api/shop/benchmark/shoplist', 'GET', { keyword: '<shopName>', type: 3 }),
    endpointPlan('/api/competition/analysis/base/control/ratio', 'POST', base),
    endpointPlan('/api/competition/analysis/base/shop/indicator', 'POST', base),
    endpointPlan('/api/competition/analysis/base/indicator', 'POST', base),
    endpointPlan('/api/competition/analysis/flow/indicator', 'POST', { ...base, attributionScale: '2', attributionMode: 1 }),
    endpointPlan('/api/competition/analysis/crowd/structural', 'POST', { ...base, crowdBuyType: 1 }),
    endpointPlan('/api/competition/analysis/crowd/structural', 'POST', { ...base, crowdBuyType: 2 }),
    endpointPlan('/api/competition/analysis/flow/paid_free/structural', 'POST', base),
    endpointPlan('/api/competition/analysis/flow/investor/structural', 'POST', base)
  ];
}

function endpointPlan(path: string, method: string, data: Record<string, unknown>): Record<string, unknown> {
  return {
    path,
    method,
    origin: 'https://dmp.advgateway.taobao.com',
    access: 'read',
    execution: 'not_executed_by_plan',
    data
  };
}

function normalizeDates(options: DmpCompeteOptions): { beginDate: string; endDate: string; peerBeginDate: string; peerEndDate: string } {
  if (isDate(options.beginDate) && isDate(options.endDate) && isDate(options.peerBeginDate) && isDate(options.peerEndDate)) {
    return {
      beginDate: String(options.beginDate),
      endDate: String(options.endDate),
      peerBeginDate: String(options.peerBeginDate),
      peerEndDate: String(options.peerEndDate)
    };
  }
  const now = new Date();
  const monday = mondayOfWeek(now);
  const previous = addDays(monday, -7);
  return {
    beginDate: formatDate(previous),
    endDate: formatDate(addDays(previous, 2)),
    peerBeginDate: formatDate(addDays(previous, 3)),
    peerEndDate: formatDate(addDays(previous, 6))
  };
}

function dmpCompeteExpression(mode: 'shops' | 'probe', options: DmpCompeteOptions): string {
  const payload = JSON.stringify({
    mode,
    shopList: options.shopList ?? '',
    beginDate: options.beginDate ?? '',
    endDate: options.endDate ?? '',
    peerBeginDate: options.peerBeginDate ?? '',
    peerEndDate: options.peerEndDate ?? '',
    maxCompetitors: options.maxCompetitors ?? 3
  });
  return `((async () => {
    const input = ${payload};
    const GATEWAY_ORIGIN = 'https://dmp.advgateway.taobao.com';
    const SELF_SHOP_NAME = '巴拉巴拉官方旗舰';
    const DEFAULT_MONITOR_SHOPS = [
      { shopName: SELF_SHOP_NAME, position: '本品', isSelf: true },
      { shopName: 'davebella旗舰店', position: '常规竞争', aliases: ['戴维贝拉旗舰店'] },
      { shopName: '左西旗舰店', position: '常规竞争' },
      { shopName: 'moodytiger旗舰店', position: '常规竞争' },
      { shopName: 'anta安踏童装旗舰店', position: '销售头部', aliases: ['安踏童装旗舰店'] },
      { shopName: 'FILA童装旗舰店', position: '销售头部', aliases: ['fila童装旗舰店'] },
      { shopName: '泰兰尼斯童鞋旗舰店', position: '销售头部' },
      { shopName: '贝肽斯官方旗舰店', position: '同比高增' },
      { shopName: '班喜迪旗舰店', position: '同比高增' },
      { shopName: '子瑞巴巴旗舰店', position: '同比高增' }
    ];
    const compact = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
    const normalizeShopName = (value) => compact(value).toLowerCase().replace(/[（）()【】\\[\\]\\s_./\\\\\\-：:·]/g, '').replace(/官方/g, '');
    const parseMonitorShopRows = (value) => {
      if (!compact(value)) return DEFAULT_MONITOR_SHOPS.map((item) => ({ ...item }));
      const rows = [];
      for (const line of String(value).split(/\\r?\\n/)) {
        const raw = String(line || '').trim();
        const label = compact(raw);
        if (!label || /店铺名称/.test(label) || /监控名单/.test(label)) continue;
        const parts = raw.split(/\\t|,|，|;|；|\\s+/).map(compact).filter(Boolean);
        const shopName = parts[0];
        if (!shopName) continue;
        const position = parts[1] || '';
        rows.push({ shopName, position, isSelf: normalizeShopName(shopName) === normalizeShopName(SELF_SHOP_NAME) || position === '本品' });
      }
      return rows.length ? rows : DEFAULT_MONITOR_SHOPS.map((item) => ({ ...item }));
    };
    const extractArray = (payload, paths = []) => {
      if (Array.isArray(payload)) return payload;
      for (const path of paths) {
        const value = path.split('.').reduce((target, part) => target && target[part], payload);
        if (Array.isArray(value)) return value;
      }
      return [];
    };
    const gatewayQueryParams = (extra = {}) => {
      const entries = performance?.getEntriesByType ? performance.getEntriesByType('resource') : [];
      const resource = Array.from(entries).reverse().map((item) => item?.name || '').find((url) => /^https:\\/\\/dmp\\.advgateway\\.taobao\\.com\\/api\\//.test(url));
      const query = new URLSearchParams();
      if (resource) {
        const parsed = new URL(resource);
        for (const key of ['bizCode', '_tb_token_', '_csrf', 'csrfId']) {
          const val = parsed.searchParams.get(key);
          if (val) query.set(key, val);
        }
      }
      if (!query.has('bizCode')) query.set('bizCode', 'dmp');
      for (const [key, val] of Object.entries(extra || {})) {
        if (val !== undefined && val !== null && val !== '') query.set(key, String(val));
      }
      return query;
    };
    const buildGatewayUrl = (path, query = {}) => {
      const url = new URL(path, GATEWAY_ORIGIN);
      url.search = gatewayQueryParams(query).toString();
      return url.toString();
    };
    const callGateway = async (path, data = {}, options = {}) => {
      const method = options.method || 'POST';
      const url = buildGatewayUrl(path, options.query);
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
        },
        ...(method === 'POST' ? { body: JSON.stringify(data || {}) } : {})
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(path + ' 返回非 JSON: ' + text.slice(0, 120)); }
      if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
      if (payload?.info && payload.info.ok === false) throw new Error(payload.info.message || path + ' 返回失败');
      return payload;
    };
    const shopAliases = (shop) => [shop.shopName, ...(Array.isArray(shop.aliases) ? shop.aliases : [])].filter(Boolean);
    const findBestShopMatch = (list, shop, options = {}) => {
      const wanted = new Set(shopAliases(shop).map(normalizeShopName));
      const candidates = (Array.isArray(list) ? list : []).map((item) => {
        const info = item?.competitorInfo || item || {};
        return {
          raw: item,
          shopName: compact(info.shop_name || info.shopName || item?.competitorName || item?.shopName),
          shopId: compact(info.shop_id || info.shopId || item?.shopId),
          token: compact(info.token || item?.token || item?.competitorId)
        };
      }).filter((item) => item.shopName && item.token);
      let match = candidates.find((item) => wanted.has(normalizeShopName(item.shopName)));
      if (match) return match;
      match = candidates.find((item) => {
        const normalized = normalizeShopName(item.shopName);
        return Array.from(wanted).some((name) => normalized.includes(name) || name.includes(normalized));
      });
      return match || (options.allowFirstFallback ? candidates[0] : null) || null;
    };
    const fetchMonitorList = async () => extractArray(await callGateway('/api/competition/monitor/list', {}, { method: 'GET', query: { competitionType: '1', pageSize: 100 } }), ['data.list', 'list']);
    const searchShop = async (shop) => {
      for (const keyword of shopAliases(shop)) {
        const payload = await callGateway('/api/shop/benchmark/shoplist', {}, { method: 'GET', query: { keyword, type: 3 } });
        const match = findBestShopMatch(extractArray(payload, ['data.list', 'list']), shop, { allowFirstFallback: true });
        if (match) return { ...match, source: '搜索接口', keyword };
      }
      return null;
    };
    const resolveMonitorShops = async (monitorShops) => {
      let monitorList = [];
      try { monitorList = await fetchMonitorList(); } catch { monitorList = []; }
      const resolved = [];
      for (const shop of monitorShops) {
        if (shop.isSelf) {
          resolved.push({ ...shop, resolvedName: shop.shopName, source: '本店', status: '已解析' });
          continue;
        }
        try {
          const monitorMatch = findBestShopMatch(monitorList, shop);
          const match = monitorMatch ? { ...monitorMatch, source: '已关注列表' } : await searchShop(shop);
          if (!match?.token) {
            resolved.push({ ...shop, status: '未找到', source: '', note: '店铺搜索接口未返回可用 token' });
            continue;
          }
          resolved.push({ ...shop, token: match.token, shopId: match.shopId, resolvedName: match.shopName, source: match.source, status: '已解析', note: match.keyword ? 'keyword=' + match.keyword : '' });
        } catch (error) {
          resolved.push({ ...shop, status: '解析失败', source: '', note: String(error && (error.message || error)).slice(0, 240) });
        }
      }
      return resolved;
    };
    const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
    const fmt = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const validDate = (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(compact(value));
    const defaultDates = () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monday = addDays(start, -((start.getDay() + 6) % 7));
      const previous = addDays(monday, -7);
      return { beginDate: fmt(previous), endDate: fmt(addDays(previous, 2)), peerBeginDate: fmt(addDays(previous, 3)), peerEndDate: fmt(addDays(previous, 6)) };
    };
    const dates = validDate(input.beginDate) && validDate(input.endDate) && validDate(input.peerBeginDate) && validDate(input.peerEndDate)
      ? { beginDate: input.beginDate, endDate: input.endDate, peerBeginDate: input.peerBeginDate, peerEndDate: input.peerEndDate }
      : defaultDates();
    const keySummary = (value) => value && typeof value === 'object' ? Object.keys(value).slice(0, 24).join(',') : '';
    const listCount = (value) => extractArray(value, ['data.list', 'list', 'data.rows', 'rows']).length;
    try {
      const monitorShops = parseMonitorShopRows(input.shopList);
      const resolved = await resolveMonitorShops(monitorShops);
      if (input.mode === 'shops') {
        return JSON.stringify({ ok: true, title: document.title, href: location.href, rows: resolved.map((shop) => ({
          shopName: shop.shopName,
          position: shop.position || '',
          resolvedName: shop.resolvedName || '',
          shopId: shop.shopId || '',
          tokenPresent: Boolean(shop.token),
          source: shop.source || '',
          status: shop.status || '',
          note: shop.note || ''
        })) });
      }
      const competitors = resolved.filter((shop) => !shop.isSelf && shop.token).slice(0, Math.max(1, Number(input.maxCompetitors || 3)));
      const competitorIds = competitors.map((shop) => shop.token);
      const base = { competitorIds, ...dates, competitionType: '1' };
      const endpoints = [
        ['/api/competition/analysis/base/control/ratio', base],
        ['/api/competition/analysis/base/shop/indicator', base],
        ['/api/competition/analysis/base/indicator', base],
        ['/api/competition/analysis/flow/indicator', { ...base, attributionScale: '2', attributionMode: 1 }],
        ['/api/competition/analysis/crowd/structural', { ...base, crowdBuyType: 1 }],
        ['/api/competition/analysis/crowd/structural', { ...base, crowdBuyType: 2 }],
        ['/api/competition/analysis/flow/paid_free/structural', base],
        ['/api/competition/analysis/flow/investor/structural', base]
      ];
      const rows = [{
        endpoint: 'resolve_shops',
        method: 'GET',
        status: 'ok',
        competitorCount: competitorIds.length,
        dataKeys: competitors.map((shop) => shop.shopName).join(','),
        listCount: resolved.length,
        beginDate: dates.beginDate,
        endDate: dates.endDate,
        peerBeginDate: dates.peerBeginDate,
        peerEndDate: dates.peerEndDate
      }];
      for (const [path, data] of endpoints) {
        try {
          const response = await callGateway(path, data);
          rows.push({
            endpoint: path,
            method: 'POST',
            status: 'ok',
            competitorCount: competitorIds.length,
            dataKeys: keySummary(response.data || response),
            listCount: listCount(response),
            beginDate: dates.beginDate,
            endDate: dates.endDate,
            peerBeginDate: dates.peerBeginDate,
            peerEndDate: dates.peerEndDate
          });
        } catch (error) {
          rows.push({
            endpoint: path,
            method: 'POST',
            status: 'failed',
            competitorCount: competitorIds.length,
            dataKeys: '',
            listCount: 0,
            beginDate: dates.beginDate,
            endDate: dates.endDate,
            peerBeginDate: dates.peerBeginDate,
            peerEndDate: dates.peerEndDate,
            note: String(error && (error.message || error)).slice(0, 240)
          });
        }
      }
      return JSON.stringify({ ok: true, title: document.title, href: location.href, rows });
    } catch (error) {
      return JSON.stringify({ ok: false, title: document.title, href: location.href, error: String(error && (error.message || error)).slice(0, 500) });
    }
  })())`;
}

function isDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function mondayOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(start, -((start.getDay() + 6) % 7));
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
