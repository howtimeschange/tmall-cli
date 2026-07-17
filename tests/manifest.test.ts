import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../src/manifest.js';

describe('manifest', () => {
  it('exposes only the guarded executor as an online write surface', () => {
    expect(MANIFEST.filter((entry) => entry.access === 'blocked-write').map((entry) => entry.name)).toEqual(['executor.plan']);
    expect(MANIFEST.some((entry) => entry.name === 'recon.export' && entry.access === 'local-write')).toBe(true);
  });

  it('has unique command names', () => {
    const names = MANIFEST.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
