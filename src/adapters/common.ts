export interface BrowserOptions {
  cdpUrl?: string;
  target?: string;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function resultOf(value: unknown): unknown {
  const record = asRecord(value);
  return Object.prototype.hasOwnProperty.call(record, 'result') ? record.result : value;
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
}

export function text(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

const LIST_SEPARATOR = /[\n\r,，、;；]+/;
const LIST_CONTAINER_KEYS = ['paths', 'urls', 'files', 'images', 'items', 'values'];
const LIST_VALUE_KEYS = ['path', 'url', 'fullUrl', 'imageUrl', 'src', 'href', 'filePath', 'itemCode', 'code', 'id'];

export function normalizeTextList(value: unknown): string[] {
  return listValues(value)
    .map((item) => text(item))
    .filter(Boolean);
}

function listValues(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => listValues(item));
  if (typeof value === 'string') return value.split(LIST_SEPARATOR);
  if (typeof value !== 'object') return [value];

  const record = value as Record<string, unknown>;
  for (const key of LIST_CONTAINER_KEYS) {
    if (record[key] != null) return listValues(record[key]);
  }
  for (const key of LIST_VALUE_KEYS) {
    if (text(record[key])) return [record[key]];
  }
  return [];
}

export function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return Boolean(value);
  return null;
}

export function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return '';
}

export function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = num(record[key]);
    if (value != null) return value;
  }
  return null;
}

export function formatTimestamp(value: unknown): string {
  const raw = num(value);
  if (raw == null) return text(value);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? String(raw) : date.toISOString();
}
