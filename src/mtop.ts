import { DEFAULT_CDP_URL, withTmallPage } from './cdp.js';
import { CommandExecutionError, MutationBlockedError } from './errors.js';
import { redactValue } from './redaction.js';
import { classifyEndpointRisk } from './risk.js';

export interface MtopSpec {
  adapter: string;
  key: string;
  api: string;
  version?: string;
  appKey?: string;
  data?: Record<string, unknown>;
  method?: 'GET' | 'POST' | 'get' | 'post';
  dataType?: 'json' | 'jsonp';
  valueType?: 'original' | 'string';
  preventFallback?: boolean;
  target: string;
  description: string;
  allowMutationName?: boolean;
}

export interface MtopCallOptions {
  cdpUrl?: string;
  target?: string;
  data?: Record<string, unknown>;
  timeoutMs?: number;
  redact?: boolean;
}

export interface MtopCallResult<T = unknown> {
  adapter: string;
  key: string;
  api: string;
  version: string;
  ret: string[];
  data: T;
  title: string;
  href: string;
  capturedAt: string;
}

interface PageMtopResult {
  ok: boolean;
  title: string;
  href: string;
  ret?: string[];
  data?: unknown;
  error?: { message: string; ret?: string[] };
}

export async function callMtop<T = unknown>(spec: MtopSpec, options: MtopCallOptions = {}): Promise<MtopCallResult<T>> {
  if (!spec.allowMutationName && classifyEndpointRisk(spec.api) === 'write_or_mutation_risk') {
    throw new MutationBlockedError(spec.api);
  }

  const payload = {
    H5Request: true,
    api: spec.api,
    v: spec.version ?? '1.0',
    ...(spec.appKey ? { appKey: spec.appKey } : {}),
    data: { ...(spec.data ?? {}), ...(options.data ?? {}) },
    type: spec.method ?? 'get',
    dataType: spec.dataType ?? 'json',
    valueType: spec.valueType ?? 'original',
    ...(spec.preventFallback == null ? {} : { preventFallback: spec.preventFallback }),
    timeout: options.timeoutMs ?? 20_000
  };

  const result = await withTmallPage(
    { cdpUrl: options.cdpUrl ?? DEFAULT_CDP_URL, match: options.target ?? spec.target, openIfMissing: false },
    async (page) => page.evaluateJson<PageMtopResult>(mtopExpression(payload))
  );

  if (!result.ok) {
    const ret = result.error?.ret?.join('; ') || '';
    throw new CommandExecutionError(`${spec.key} MTOP 调用失败: ${result.error?.message ?? 'unknown error'}${ret ? ` (${ret})` : ''}`);
  }
  const ret = result.ret ?? [];
  if (ret.length && !ret.some((item) => /^SUCCESS::/i.test(item))) {
    throw new CommandExecutionError(`${spec.key} MTOP 返回失败: ${ret.join('; ')}`);
  }

  return {
    adapter: spec.adapter,
    key: spec.key,
    api: spec.api,
    version: spec.version ?? '1.0',
    ret,
    data: (options.redact === false ? result.data : redactValue(result.data)) as T,
    title: result.title,
    href: result.href,
    capturedAt: new Date().toISOString()
  };
}

function mtopExpression(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return `((async () => {
    const payload = ${json};
    const unwrap = (res) => {
      const root = res && typeof res === 'object' ? res : {};
      const data = root.data && typeof root.data === 'object' && Object.prototype.hasOwnProperty.call(root.data, 'data')
        ? root.data.data
        : root.data;
      return {
        ret: Array.isArray(root.ret) ? root.ret : (Array.isArray(root.data?.ret) ? root.data.ret : []),
        data
      };
    };
    try {
      const mtop = window.lib?.mtop || window.mtop;
      if (!mtop?.request) {
        return JSON.stringify({ ok: false, title: document.title, href: location.href, error: { message: 'window.lib.mtop/window.mtop.request 不可用' } });
      }
      const response = await mtop.request(payload);
      const unwrapped = unwrap(response);
      return JSON.stringify({
        ok: true,
        title: document.title,
        href: location.href,
        ret: unwrapped.ret,
        data: unwrapped.data
      });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        title: document.title,
        href: location.href,
        error: {
          message: String(error && (error.message || error)).slice(0, 500),
          ret: Array.isArray(error?.ret) ? error.ret : undefined
        }
      });
    }
  })())`;
}
