export interface MenuRow {
  id: number | null;
  parentId: number | null;
  depth: number;
  name: string;
  label: string;
  top: string;
  category: number | null;
  menuType: number | null;
  openType: number | null;
  hidden: number;
  visible: number | null;
  hasSub: boolean;
  hotMenu: number;
  newMenu: number;
  appId: string;
  microKey: string;
  microPath: string;
  path: string;
  link: string;
  pcUrl: string;
}

export interface MenuSnapshot {
  capturedAt: string;
  title: string;
  href: string;
  count: number;
  byTop: Record<string, { total: number; visible: number; hidden: number; leaves: number }>;
  rows: MenuRow[];
}

export interface EndpointSummary {
  capturedAt: string;
  title: string;
  href: string;
  count: number;
  byCategory: Record<string, number>;
  byHost: Record<string, number>;
  urls: UrlSummaryRow[];
  mtopApis: MtopApiRow[];
}

export interface UrlSummaryRow {
  origin: string;
  path: string;
  queryKeys: string[];
  sources: string[];
  category: string;
  duration?: number;
  transferSize?: number;
  api?: string;
  version?: string;
  dataKeys?: string[];
  dataShape?: Record<string, string>;
  risk: 'read_candidate' | 'write_or_mutation_risk';
}

export interface MtopApiRow {
  api: string;
  version: string;
  dataKeys: string[];
  dataShape: Record<string, string>;
  risk: 'read_candidate' | 'write_or_mutation_risk';
  resourceTypes: string[];
  count: number;
}

export interface PageSnapshot {
  capturedAt: string;
  title: string;
  href: string;
  loggedInLikely: boolean;
  menuCount: number;
  textHead: string;
  anchors: Array<{ text: string; href: string; target: string; visible: boolean }>;
  buttons: Array<{ text: string; type: string; disabled: boolean; visible: boolean }>;
  globalKeys: string[];
}

export function menuExpression(): string {
  return `(() => {
    const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
    const menus = Array.isArray(window.$qnMenus) ? window.$qnMenus : [];
    const rows = [];
    const parsePcLink = (pcLink) => {
      if (!pcLink || typeof pcLink !== 'object') return '';
      try { return JSON.parse(pcLink.parameters || '{}').url || ''; } catch { return ''; }
    };
    const walk = (items, trail = [], depth = 0) => {
      for (const item of items || []) {
        const label = [...trail, item.name].filter(Boolean).join('/');
        rows.push({
          id: item.id ?? null,
          parentId: item.parentId ?? null,
          depth,
          name: clean(item.name),
          label: item.aemLabel || label,
          top: trail[0] || clean(item.name),
          category: item.category ?? null,
          menuType: item.menuType ?? null,
          openType: item.openType ?? null,
          hidden: item.hidden ?? 0,
          visible: item.visible ?? null,
          hasSub: Boolean(item.hasSub),
          hotMenu: item.hotMenu ?? 0,
          newMenu: item.newMenu ?? 0,
          appId: item.appId || '',
          microKey: item.microKey || item.configUrl?.microKey || '',
          microPath: item.microPath || '',
          path: item.path || '',
          link: item.link || '',
          pcUrl: parsePcLink(item.pcLink)
        });
        if (Array.isArray(item.subMenus)) walk(item.subMenus, [...trail, clean(item.name)].filter(Boolean), depth + 1);
      }
    };
    walk(menus);
    const byTop = {};
    for (const row of rows) {
      const top = row.top || '(root)';
      byTop[top] = byTop[top] || { total: 0, visible: 0, hidden: 0, leaves: 0 };
      byTop[top].total++;
      if (row.hidden) byTop[top].hidden++;
      if (row.visible !== 0) byTop[top].visible++;
      if (!row.hasSub) byTop[top].leaves++;
    }
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      title: document.title,
      href: location.href,
      count: rows.length,
      byTop,
      rows
    });
  })()`;
}

export function endpointExpression(): string {
  return `(() => {
    const mutationRe = /(^|[._/-])(add|apply|approve|bind|cancel|change|close|commit|confirm|create|delete|edit|modify|operate|open|patch|pay|post|publish|refund|remove|save|set|sign|submit|update|upload|write)($|[._/-])/i;
    const classifyRisk = (name) => mutationRe.test(String(name || '')) ? 'write_or_mutation_risk' : 'read_candidate';
    const summarizeData = (raw) => {
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        const keys = Object.keys(parsed).sort();
        const shape = {};
        for (const key of keys) {
          const value = parsed[key];
          shape[key] = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
        }
        return { dataKeys: keys, dataShape: shape };
      } catch {
        return {};
      }
    };
    const classify = (url) => {
      let u;
      try { u = new URL(url, location.href); } catch { return 'invalid'; }
      const full = u.href;
      if (/h5api|mtop|\\/h5\\/|\\/gw\\//i.test(full)) return 'mtop_or_h5api';
      if (/\\.(json|jsonp)(\\?|$)/i.test(u.pathname)) return 'json_asset';
      if (/ajax|api|rest|gateway|service|query|list|detail|search|get|fetch|rpc/i.test(full)) return 'api_like';
      if (/g\\.alicdn\\.com|o\\.alicdn\\.com|alicdn\\.com|mmstat|log\\./i.test(u.hostname)) return 'static_or_analytics';
      if (/taobao\\.com|tmall\\.com|1688\\.com|alipayobjects\\.com|aliyun/i.test(u.hostname)) return 'business_page_or_resource';
      return 'other';
    };
    const sensitive = new Set(['access_token','accesstoken','callback','cna','cookie','csrf','data','gokey','sign','spm','token','uid','uidaplus','_tb_token_']);
    const rowsByKey = new Map();
    const add = (rawUrl, source, extra = {}) => {
      if (!rawUrl) return;
      let u;
      try { u = new URL(rawUrl, location.href); } catch { return; }
      const queryKeys = Array.from(u.searchParams.keys()).filter((key) => !sensitive.has(key.toLowerCase())).sort();
      const api = u.searchParams.get('api') || (u.pathname.match(/\\/h5\\/([^/]+)/)?.[1] || '');
      const version = u.searchParams.get('v') || (u.pathname.match(/\\/h5\\/[^/]+\\/([^/]+)/)?.[1] || '');
      const data = summarizeData(u.searchParams.get('data'));
      const key = [u.origin, u.pathname, api, version, queryKeys.join(',')].join('|');
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          origin: u.origin,
          path: u.pathname,
          queryKeys,
          sources: [],
          category: classify(rawUrl),
          api: api || undefined,
          version: version || undefined,
          ...data,
          risk: classifyRisk(api || u.pathname),
          ...extra
        });
      }
      const row = rowsByKey.get(key);
      if (!row.sources.includes(source)) row.sources.push(source);
    };
    for (const r of performance.getEntriesByType('resource')) {
      add(r.name, 'resource:' + r.initiatorType, { duration: Math.round(r.duration || 0), transferSize: r.transferSize || 0 });
    }
    for (const anchor of Array.from(document.querySelectorAll('a[href]'))) add(anchor.href, 'anchor');
    for (const script of Array.from(document.scripts)) add(script.src, 'script');
    const urls = Array.from(rowsByKey.values()).sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.origin + a.path).localeCompare(String(b.origin + b.path)));
    const byCategory = {};
    const byHost = {};
    for (const row of urls) {
      byCategory[row.category] = (byCategory[row.category] || 0) + 1;
      try { const host = new URL(row.origin).hostname; byHost[host] = (byHost[host] || 0) + 1; } catch {}
    }
    const apiMap = new Map();
    for (const row of urls) {
      if (row.category !== 'mtop_or_h5api' || !row.api) continue;
      const key = [row.api, row.version || '', (row.dataKeys || []).join(',')].join('|');
      if (!apiMap.has(key)) {
        apiMap.set(key, {
          api: row.api,
          version: row.version || '',
          dataKeys: row.dataKeys || [],
          dataShape: row.dataShape || {},
          risk: row.risk,
          resourceTypes: [],
          count: 0
        });
      }
      const apiRow = apiMap.get(key);
      apiRow.count++;
      for (const source of row.sources) if (source.startsWith('resource:') && !apiRow.resourceTypes.includes(source)) apiRow.resourceTypes.push(source);
    }
    const mtopApis = Array.from(apiMap.values()).sort((a, b) => a.api.localeCompare(b.api));
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      title: document.title,
      href: location.href,
      count: urls.length,
      byCategory,
      byHost,
      urls,
      mtopApis
    });
  })()`;
}

export function snapshotExpression(maxAnchors = 120, maxButtons = 80): string {
  return `(() => {
    const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
    const anchors = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      text: clean(a.innerText || a.getAttribute('aria-label') || a.title),
      href: a.href,
      target: a.target || '',
      visible: Boolean(a.offsetWidth || a.offsetHeight || a.getClientRects().length)
    })).filter((a) => a.text || a.href).slice(0, ${Number(maxAnchors)});
    const buttons = Array.from(document.querySelectorAll('button,[role="button"],.next-btn')).map((b) => ({
      text: clean(b.innerText || b.getAttribute('aria-label') || b.title),
      type: b.tagName.toLowerCase(),
      disabled: Boolean(b.disabled || b.getAttribute('aria-disabled') === 'true'),
      visible: Boolean(b.offsetWidth || b.offsetHeight || b.getClientRects().length)
    })).filter((b) => b.text).slice(0, ${Number(maxButtons)});
    const globalKeys = Object.keys(window).filter((k) => /menu|route|seller|qn|tb|taobao|mtop|redux|state|app|config/i.test(k)).slice(0, 200);
    const textHead = clean(document.body?.innerText || '').slice(0, 4000);
    const menuCount = Array.isArray(window.$qnMenus) ? window.$qnMenus.length : 0;
    const loggedInLikely = menuCount > 0 && !/登录|扫码登录|验证码/.test(textHead.slice(0, 400));
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      title: document.title,
      href: location.href,
      loggedInLikely,
      menuCount,
      textHead,
      anchors,
      buttons,
      globalKeys
    });
  })()`;
}
