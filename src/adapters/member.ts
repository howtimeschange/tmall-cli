import { text } from './common.js';

export const MEMBER_BASE_URL = 'https://market.m.taobao.com/app/sj/member-center-rax/pages/pages_index_index?wh_weex=true&source=ShopSelfUse&sellerId=';

export interface MemberRow {
  shopName: string;
  sellerId: string;
  url: string;
  status: string;
  note: string;
}

export function normalizeMemberUrls(input: string): MemberRow[] {
  const rows: MemberRow[] = [];
  const seen = new Set<string>();
  for (const line of String(input || '').split(/\r?\n|,|，|;|；/)) {
    const raw = text(line);
    if (!raw) continue;
    const urlMatch = raw.match(/https?:\/\/\S+/i);
    const rawUrl = urlMatch ? urlMatch[0].replace(/[，,;；]+$/g, '') : '';
    const sellerId = parseSellerId(rawUrl, raw);
    const prefix = rawUrl
      ? text(raw.slice(0, raw.indexOf(rawUrl)))
      : text(sellerId ? raw.replace(sellerId, '') : raw);
    const url = normalizeMemberUrl(rawUrl, sellerId);
    const key = `${sellerId}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      shopName: prefix || (sellerId ? `seller_${sellerId}` : '会员中心'),
      sellerId,
      url,
      status: sellerId && url ? 'valid' : 'invalid',
      note: sellerId && url ? '' : '缺少有效 sellerId 或会员中心链接'
    });
  }
  return rows;
}

export function normalizeMemberUrl(rawUrl: string, sellerId = ''): string {
  const source = text(rawUrl);
  const resolvedSellerId = parseSellerId(sellerId, source);
  if (source && /^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      if (!/market\.m\.taobao\.com$/i.test(url.hostname)) return '';
      if (!/member-center-rax\/pages\/pages_index_index/.test(url.pathname)) return '';
      if (resolvedSellerId && !url.searchParams.get('sellerId')) url.searchParams.set('sellerId', resolvedSellerId);
      return url.href;
    } catch {
      return '';
    }
  }
  return resolvedSellerId ? `${MEMBER_BASE_URL}${encodeURIComponent(resolvedSellerId)}` : '';
}

export function parseSellerId(...values: string[]): string {
  for (const value of values) {
    const raw = text(value);
    if (!raw) continue;
    const direct = raw.match(/^\d{5,}$/);
    if (direct) return direct[0];
    const fromQuery = raw.match(/[?&]sellerId=(\d{5,})/i);
    if (fromQuery) return fromQuery[1];
    const loose = raw.match(/\b(\d{5,})\b/);
    if (loose) return loose[1];
  }
  return '';
}
