const SENSITIVE_QUERY_KEYS = [
  'access_token',
  'accesstoken',
  'callback',
  'cna',
  'cookie',
  'csrf',
  'data',
  'gokey',
  'sign',
  'spm',
  'token',
  'uid',
  'uidaplus',
  '_tb_token_'
];

export function redactText(value: string): string {
  return value
    .replace(/([?&](?:access_?token|token|sign|_tb_token_|csrf|cna|uidaplus|uid)=)[^&#]+/gi, '$1<redacted>')
    .replace(/(accessToken["']?\s*[:=]\s*["'])[^"']+/gi, '$1<redacted>')
    .replace(/\b\d{10,}\b/g, '<id>');
}

export function redactValue<T>(value: T): T {
  return redactAny(value) as T;
}

function redactAny(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactAny(item));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = '<redacted>';
    } else {
      result[key] = redactAny(item);
    }
  }
  return result;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  if (['data', 'callback', 'spm'].includes(normalized)) return false;
  return normalized.includes('token')
    || normalized.includes('cookie')
    || normalized.includes('csrf')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('session')
    || normalized.includes('credential')
    || normalized.includes('uidaplus')
    || normalized === 'sign'
    || normalized === 'signature'
    || normalized.endsWith('signurl');
}

export function safeUrlSummary(rawUrl: string): {
  origin: string;
  path: string;
  queryKeys: string[];
  api?: string;
  version?: string;
  dataKeys?: string[];
  dataShape?: Record<string, string>;
} {
  const url = new URL(rawUrl);
  const queryKeys = Array.from(url.searchParams.keys())
    .filter((key) => !SENSITIVE_QUERY_KEYS.includes(key.toLowerCase()))
    .sort();
  const api = url.searchParams.get('api') || url.pathname.match(/\/h5\/([^/]+)/)?.[1] || undefined;
  const version = url.searchParams.get('v') || url.pathname.match(/\/h5\/[^/]+\/([^/]+)/)?.[1] || undefined;
  const { dataKeys, dataShape } = summarizeDataParam(url.searchParams.get('data'));
  return {
    origin: url.origin,
    path: url.pathname,
    queryKeys,
    api: api || undefined,
    version: version || undefined,
    dataKeys,
    dataShape
  };
}

export function summarizeDataParam(raw: string | null): { dataKeys?: string[]; dataShape?: Record<string, string> } {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const dataKeys = Object.keys(parsed).sort();
    const dataShape = Object.fromEntries(
      dataKeys.map((key) => {
        const value = parsed[key];
        return [key, Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value];
      })
    );
    return { dataKeys, dataShape };
  } catch {
    return {};
  }
}
