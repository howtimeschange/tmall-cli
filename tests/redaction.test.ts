import { describe, expect, it } from 'vitest';
import { redactText, redactValue, safeUrlSummary } from '../src/redaction.js';

describe('redaction', () => {
  it('redacts signed URL material and long ids', () => {
    const text = redactText('https://h5api.m.taobao.com/h5/x/1.0/?sign=abc&uidaplus=1234567890123&token=secret');
    expect(text).toContain('sign=<redacted>');
    expect(text).toContain('uidaplus=<redacted>');
    expect(text).toContain('token=<redacted>');
    expect(text).not.toContain('1234567890123');
  });

  it('summarizes URL shape without sensitive params', () => {
    const summary = safeUrlSummary('https://h5api.m.taobao.com/h5/mtop.taobao.seller.calendar.query/1.0/?api=mtop.taobao.seller.calendar.query&v=1.0&sign=abc&data=%7B%22dateStart%22%3A%2220260716%22%7D');
    expect(summary.api).toBe('mtop.taobao.seller.calendar.query');
    expect(summary.version).toBe('1.0');
    expect(summary.queryKeys).not.toContain('sign');
    expect(summary.queryKeys).not.toContain('data');
    expect(summary.dataKeys).toEqual(['dateStart']);
    expect(summary.dataShape).toEqual({ dateStart: 'string' });
  });

  it('keeps normal business data fields while redacting sensitive object keys', () => {
    const value = redactValue({
      data: { balance: 2700 },
      isSignUp: true,
      signUrl: 'https://example.com/?sign=abc',
      csrfId: 'secret'
    });
    expect(value.data).toEqual({ balance: 2700 });
    expect(value.isSignUp).toBe(true);
    expect(value.signUrl).toBe('<redacted>');
    expect(value.csrfId).toBe('<redacted>');
  });
});
