export type OutputFormat = 'json' | 'ndjson' | 'csv' | 'md' | 'table';

export function render(data: unknown, format: OutputFormat): string {
  if (format === 'json') return `${JSON.stringify(data, null, 2)}\n`;
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [data as Record<string, unknown>];
  if (format === 'ndjson') return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  if (format === 'csv') return renderCsv(rows);
  if (format === 'md') return renderMarkdown(rows);
  return renderTable(rows);
}

export function pickFields<T extends object>(rows: T[], fields: string[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return Object.fromEntries(fields.map((field) => [field, record[field] ?? null]));
  });
}

function renderCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  return `${[
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))
  ].join('\n')}\n`;
}

function renderMarkdown(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const lines = [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column) => mdCell(row[column])).join(' | ')} |`)
  ];
  return `${lines.join('\n')}\n`;
}

function renderTable(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '(no data)\n';
  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) => Math.min(80, Math.max(column.length, ...rows.map((row) => visibleText(row[column]).length))));
  const line = (values: unknown[]) => values.map((value, index) => visibleText(value).slice(0, widths[index]).padEnd(widths[index])).join('  ');
  return `${line(columns)}\n${line(widths.map((width) => '-'.repeat(width)))}\n${rows.map((row) => line(columns.map((column) => row[column]))).join('\n')}\n`;
}

function csvCell(value: unknown): string {
  const text = visibleText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function mdCell(value: unknown): string {
  return visibleText(value).replace(/\|/g, '\\|');
}

function visibleText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
