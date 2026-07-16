import { DMP_TARGET } from './adapters/dmp.js';
import { QUICK_VIDEO_TARGET } from './adapters/quick-video.js';
import { SELLER_HOME_TARGET } from './adapters/seller-home.js';
import { DEFAULT_CDP_URL, withTmallPage } from './cdp.js';
import { CommandExecutionError } from './errors.js';
import { redactText, redactValue } from './redaction.js';

export type OperationDomain = 'home' | 'quick' | 'dmp';

export interface OperationCatalogOptions {
  cdpUrl?: string;
  domains?: OperationDomain[];
  includeSourceUrls?: boolean;
}

export interface OperationRow {
  domain: OperationDomain;
  title: string;
  href: string;
  name: string;
  requestFamily: 'mtop-h5' | 'page-rest' | 'upload' | 'navigation' | 'unknown';
  api?: string;
  version?: string;
  origin: string;
  path: string;
  methodHint: string;
  dataType?: string;
  dataKeys: string[];
  dataShape: Record<string, string>;
  queryKeys: string[];
  sources: string[];
  risk: string;
  riskWords: string[];
  execution: 'blocked';
  note: string;
}

export interface OperationCatalog {
  capturedAt: string;
  rows: OperationRow[];
  sourceUrls: Array<{ domain: OperationDomain; url: string }>;
}

export interface SourceHint {
  domain: OperationDomain;
  pattern: string;
  script: string;
  occurrences: number;
  snippets: string[];
}

const DOMAIN_TARGETS: Record<OperationDomain, string> = {
  home: SELLER_HOME_TARGET,
  quick: QUICK_VIDEO_TARGET,
  dmp: DMP_TARGET
};

const OPERATION_WORDS = [
  'add',
  'apply',
  'approve',
  'bind',
  'cancel',
  'change',
  'close',
  'commit',
  'confirm',
  'create',
  'delete',
  'edit',
  'launch',
  'modify',
  'operate',
  'pay',
  'post',
  'publish',
  'refund',
  'remove',
  'save',
  'set',
  'sign',
  'submit',
  'update',
  'upload'
];

export function parseOperationDomains(value?: string): OperationDomain[] {
  if (!value || value === 'all') return ['home', 'quick', 'dmp'];
  const domains = value.split(',').map((item) => item.trim()).filter(Boolean);
  for (const domain of domains) {
    if (!isOperationDomain(domain)) throw new CommandExecutionError(`未知功能域: ${domain}. 可选: home, quick, dmp, all`);
  }
  return domains as OperationDomain[];
}

export async function readOperationCatalog(options: OperationCatalogOptions = {}): Promise<OperationCatalog> {
  const domains = options.domains?.length ? options.domains : parseOperationDomains();
  const catalogs = await Promise.all(domains.map(async (domain) => {
    const result = await withTmallPage(
      { cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL, match: DOMAIN_TARGETS[domain], openIfMissing: false },
      async (page) => page.evaluateJson<Omit<OperationCatalog, 'capturedAt'> & { rows: Omit<OperationRow, 'domain'>[] }>(operationCatalogExpression())
    );
    return {
      rows: result.rows.map((row) => ({ ...row, domain })),
      sourceUrls: (options.includeSourceUrls ? result.sourceUrls : []).map((item) => ({ domain, url: item.url }))
    };
  }));
  return {
    capturedAt: new Date().toISOString(),
    rows: catalogs.flatMap((catalog) => catalog.rows).sort((a, b) => `${a.domain}:${a.name}`.localeCompare(`${b.domain}:${b.name}`)),
    sourceUrls: dedupeSourceUrls(catalogs.flatMap((catalog) => catalog.sourceUrls))
  };
}

export async function getOperationRows(pattern: string, options: OperationCatalogOptions = {}): Promise<OperationRow[]> {
  const catalog = await readOperationCatalog(options);
  const needle = pattern.toLowerCase();
  return catalog.rows.filter((row) => {
    return row.name.toLowerCase().includes(needle)
      || (row.api ?? '').toLowerCase().includes(needle)
      || row.path.toLowerCase().includes(needle);
  });
}

export async function scanOperationSources(pattern: string, options: OperationCatalogOptions & { maxScripts?: number; maxSnippets?: number } = {}): Promise<SourceHint[]> {
  const catalog = await readOperationCatalog({ ...options, includeSourceUrls: true });
  const sourceUrls = dedupeSourceUrls(catalog.sourceUrls)
    .filter((item) => isStaticScriptUrl(item.url))
    .slice(0, options.maxScripts ?? 80);
  const needles = buildNeedles(pattern, catalog.rows);
  const hints: SourceHint[] = [];
  for (const item of sourceUrls) {
    let body = '';
    try {
      const response = await fetch(item.url);
      if (!response.ok) continue;
      body = await response.text();
    } catch {
      continue;
    }
    for (const needle of needles) {
      const found = findSnippets(body, needle, options.maxSnippets ?? 2);
      if (found.occurrences > 0) {
        hints.push({
          domain: item.domain,
          pattern: needle,
          script: safeScriptLabel(item.url),
          occurrences: found.occurrences,
          snippets: found.snippets
        });
      }
    }
  }
  return hints.sort((a, b) => b.occurrences - a.occurrences || a.script.localeCompare(b.script));
}

function operationCatalogExpression(): string {
  const words = JSON.stringify(OPERATION_WORDS);
  return `(() => {
    const words = ${words};
    const sensitive = new Set(['access_token','accesstoken','callback','cna','cookie','csrf','data','gokey','sign','spm','token','uid','uidaplus','_tb_token_','signature','ossaccesskeyid','expires']);
    const mutationRe = new RegExp('(^|[._/-])(' + words.join('|') + ')($|[._/-])', 'i');
    const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
    const redact = (s) => clean(s).replace(/([?&](?:access_?token|token|sign|_tb_token_|csrf|cna|uidaplus|uid|signature|ossaccesskeyid|expires)=)[^&#]+/gi, '$1<redacted>').replace(/\\b\\d{10,}\\b/g, '<id>');
    const dataSummary = (raw) => {
      if (!raw) return { dataKeys: [], dataShape: {} };
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
        return { dataKeys: [], dataShape: {} };
      }
    };
    const riskWords = (name) => words.filter((word) => new RegExp('(^|[._/-])' + word + '($|[._/-])', 'i').test(String(name || '')));
    const family = (url, api, path) => {
      const full = String(url || '');
      if (/stream-upload|\\/upload/i.test(full)) return 'upload';
      if (/h5api|mtop|\\/h5\\//i.test(full) || /^mtop\\./i.test(String(api || ''))) return 'mtop-h5';
      if (/^javascript:|^#/.test(full)) return 'navigation';
      if (/\\/api(_\\d+)?\\//i.test(path)) return 'page-rest';
      return 'unknown';
    };
    const rowsByKey = new Map();
    const add = (rawUrl, source) => {
      if (!rawUrl) return;
      let url;
      try { url = new URL(rawUrl, location.href); } catch { return; }
      const api = url.searchParams.get('api') || (url.pathname.match(/\\/h5\\/([^/]+)/)?.[1] || '');
      const version = url.searchParams.get('v') || (url.pathname.match(/\\/h5\\/[^/]+\\/([^/]+)/)?.[1] || '');
      const name = api || url.pathname;
      const wordsHit = riskWords(name);
      if (!wordsHit.length && !mutationRe.test(url.pathname)) return;
      const summary = dataSummary(url.searchParams.get('data'));
      const queryKeys = Array.from(url.searchParams.keys()).filter((key) => !sensitive.has(key.toLowerCase())).sort();
      const key = [url.origin, url.pathname, api, version, summary.dataKeys.join(',')].join('|');
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          title: document.title,
          href: location.href,
          name,
          requestFamily: family(rawUrl, api, url.pathname),
          api: api || undefined,
          version: version || undefined,
          origin: url.origin,
          path: url.pathname,
          methodHint: url.searchParams.get('type') || (source.includes('xmlhttprequest') ? 'xhr/fetch' : ''),
          dataType: url.searchParams.get('dataType') || undefined,
          dataKeys: summary.dataKeys,
          dataShape: summary.dataShape,
          queryKeys,
          sources: [],
          risk: 'operation_shape_observed',
          riskWords: wordsHit.length ? wordsHit : riskWords(url.pathname),
          execution: 'blocked',
          note: '仅记录请求形状和来源；CLI 不会执行该操作类请求。'
        });
      }
      const row = rowsByKey.get(key);
      if (!row.sources.includes(source)) row.sources.push(source);
    };
    for (const entry of performance.getEntriesByType('resource')) add(entry.name, 'resource:' + entry.initiatorType);
    for (const anchor of Array.from(document.querySelectorAll('a[href]'))) add(anchor.href, 'anchor');
    const sourceUrls = Array.from(new Set([
      ...performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script').map((entry) => entry.name),
      ...Array.from(document.scripts).map((script) => script.src)
    ].filter(Boolean))).map((url) => ({ url: redact(url) }));
    return JSON.stringify({ rows: Array.from(rowsByKey.values()), sourceUrls });
  })()`;
}

function isOperationDomain(value: string): value is OperationDomain {
  return value === 'home' || value === 'quick' || value === 'dmp';
}

function dedupeSourceUrls(items: Array<{ domain: OperationDomain; url: string }>): Array<{ domain: OperationDomain; url: string }> {
  const seen = new Set<string>();
  const result: Array<{ domain: OperationDomain; url: string }> = [];
  for (const item of items) {
    const key = `${item.domain}|${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildNeedles(pattern: string, rows: OperationRow[]): string[] {
  const trimmed = pattern.trim();
  if (trimmed && trimmed !== '*') return [trimmed];
  return Array.from(new Set(rows.flatMap((row) => [row.api, row.path.split('/').filter(Boolean).pop()].filter(Boolean) as string[]))).slice(0, 40);
}

function findSnippets(body: string, needle: string, maxSnippets: number): { occurrences: number; snippets: string[] } {
  const lowerBody = body.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let index = lowerBody.indexOf(lowerNeedle);
  let occurrences = 0;
  const snippets: string[] = [];
  while (index >= 0) {
    occurrences++;
    if (snippets.length < maxSnippets) {
      const start = Math.max(0, index - 180);
      const end = Math.min(body.length, index + needle.length + 220);
      snippets.push(redactText(body.slice(start, end).replace(/\s+/g, ' ').trim()));
    }
    index = lowerBody.indexOf(lowerNeedle, index + Math.max(needle.length, 1));
  }
  return { occurrences, snippets };
}

function isStaticScriptUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return /(^|\.)alicdn\.com$/.test(url.hostname) && /\.(js|mjs)(\?|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function safeScriptLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return redactText(`${url.hostname}${url.pathname}`);
  } catch {
    return redactText(rawUrl);
  }
}

export function operationRowsForOutput(rows: OperationRow[]): Record<string, unknown>[] {
  return rows.map((row) => redactValue({
    domain: row.domain,
    name: row.name,
    family: row.requestFamily,
    api: row.api ?? '',
    version: row.version ?? '',
    path: row.path,
    methodHint: row.methodHint,
    dataKeys: row.dataKeys,
    riskWords: row.riskWords,
    sources: row.sources,
    execution: row.execution
  }));
}
