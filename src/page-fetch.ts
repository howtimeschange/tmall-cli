import { DEFAULT_CDP_URL, withTmallPage } from './cdp.js';
import { CommandExecutionError, MutationBlockedError } from './errors.js';
import { redactValue } from './redaction.js';
import { classifyEndpointRisk } from './risk.js';

export interface PageGetSpec {
  adapter: string;
  key: string;
  path: string;
  target: string;
  description: string;
  origin?: string;
  fallbackQuery?: Record<string, string | number | boolean>;
  requireLoadedUrl?: boolean;
}

export interface PageGetOptions {
  cdpUrl?: string;
  target?: string;
}

export interface PageGetResult<T = unknown> {
  adapter: string;
  key: string;
  path: string;
  status: number;
  ok: boolean;
  usedLoadedUrl: boolean;
  data: T;
  title: string;
  href: string;
  capturedAt: string;
}

interface PageFetchResult {
  ok: boolean;
  status?: number;
  usedLoadedUrl?: boolean;
  title: string;
  href: string;
  data?: unknown;
  error?: string;
}

export async function callPageGet<T = unknown>(spec: PageGetSpec, options: PageGetOptions = {}): Promise<PageGetResult<T>> {
  if (classifyEndpointRisk(spec.path) === 'write_or_mutation_risk') {
    throw new MutationBlockedError(spec.path);
  }
  const result = await withTmallPage(
    { cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL, match: options.target ?? spec.target, openIfMissing: false },
    async (page) => page.evaluateJson<PageFetchResult>(pageGetExpression(spec))
  );

  if (!result.ok) {
    throw new CommandExecutionError(`${spec.key} 页面 GET 调用失败: ${result.error ?? `HTTP ${result.status ?? 'unknown'}`}`);
  }
  return {
    adapter: spec.adapter,
    key: spec.key,
    path: spec.path,
    status: result.status ?? 0,
    ok: true,
    usedLoadedUrl: Boolean(result.usedLoadedUrl),
    data: redactValue(result.data) as T,
    title: result.title,
    href: result.href,
    capturedAt: new Date().toISOString()
  };
}

function pageGetExpression(spec: PageGetSpec): string {
  const payload = JSON.stringify({
    path: spec.path,
    origin: spec.origin,
    fallbackQuery: spec.fallbackQuery ?? {},
    requireLoadedUrl: spec.requireLoadedUrl ?? false
  });
  return `((async () => {
    const spec = ${payload};
    const buildFallback = () => {
      if (!spec.origin) return '';
      const url = new URL(spec.path, spec.origin);
      for (const [key, value] of Object.entries(spec.fallbackQuery || {})) url.searchParams.set(key, String(value));
      return url.href;
    };
    const matches = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter(Boolean)
      .filter((raw) => {
        try {
          const url = new URL(raw, location.href);
          return url.pathname === spec.path && (!spec.origin || url.origin === spec.origin);
        } catch {
          return false;
        }
      });
    const loadedUrl = matches[matches.length - 1] || '';
    const url = loadedUrl || buildFallback();
    if (!url || (spec.requireLoadedUrl && !loadedUrl)) {
      return JSON.stringify({ ok: false, title: document.title, href: location.href, error: '页面尚未加载该只读接口，无法安全复用请求参数' });
    }
    try {
      const response = await fetch(url, { credentials: 'include', method: 'GET' });
      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = text.slice(0, 1000); }
      }
      return JSON.stringify({
        ok: response.ok,
        status: response.status,
        usedLoadedUrl: Boolean(loadedUrl),
        title: document.title,
        href: location.href,
        data,
        error: response.ok ? undefined : String(data && (data.message || data.msg || data.error) || '')
      });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        title: document.title,
        href: location.href,
        usedLoadedUrl: Boolean(loadedUrl),
        error: String(error && (error.message || error)).slice(0, 500)
      });
    }
  })())`;
}
