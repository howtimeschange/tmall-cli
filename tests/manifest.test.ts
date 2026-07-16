import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../src/manifest.js';

describe('manifest', () => {
  it('does not expose online write commands', () => {
    expect(MANIFEST.filter((entry) => entry.access === 'blocked-write')).toEqual([]);
    expect(MANIFEST.some((entry) => entry.name === 'recon.export' && entry.access === 'local-write')).toBe(true);
  });

  it('has unique command names', () => {
    const names = MANIFEST.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
