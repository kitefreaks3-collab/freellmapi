import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: new Set<string>(),
  inserts: [] as string[],
  providers: [
    { platform: 'kilo', keyless: true },
    { platform: 'ovh', keyless: true },
    { platform: 'aihorde', keyless: true },
    { platform: 'parallel', keyless: true },
    { platform: 'keenable', keyless: true },
    { platform: 'halx', keyless: true },
    { platform: 'aisense', keyless: true },
    { platform: 'groq', keyless: false },
  ],
}));

vi.mock('../../db/index.js', () => ({
  getDb: () => ({
    prepare: (sql: string) => sql.startsWith('SELECT')
      ? { get: (platform: string) => state.rows.has(platform) ? { present: 1 } : undefined }
      : { run: (platform: string) => {
          state.rows.add(platform);
          state.inserts.push(platform);
          return { changes: 1 };
        } },
    transaction: (fn: () => unknown) => fn,
  }),
}));

vi.mock('../../lib/crypto.js', () => ({
  encrypt: (value: string) => ({
    encrypted: `encrypted:${value}`,
    iv: 'iv',
    authTag: 'tag',
  }),
}));

vi.mock('../../providers/index.js', () => ({
  getAllProviders: () => state.providers,
}));

import { initializeDesktopKeylessProviders } from '../desktop-keyless-setup.js';

describe('initializeDesktopKeylessProviders', () => {
  beforeEach(() => {
    state.rows.clear();
    state.inserts.length = 0;
  });

  it('seeds supported anonymous inference providers without creating credentials', () => {
    expect(initializeDesktopKeylessProviders()).toEqual(['kilo', 'ovh', 'aihorde', 'parallel', 'keenable']);
    expect(state.inserts).toEqual(['kilo', 'ovh', 'aihorde', 'parallel', 'keenable']);
  });

  it('is idempotent across restarts and leaves existing rows untouched', () => {
    state.rows.add('kilo');
    expect(initializeDesktopKeylessProviders()).toEqual(['ovh', 'aihorde', 'parallel', 'keenable']);
    expect(initializeDesktopKeylessProviders()).toEqual([]);
    expect(state.inserts).toEqual(['ovh', 'aihorde']);
  });

  it('does not enable decision-only or credential-required providers', () => {
    initializeDesktopKeylessProviders();
    expect(state.rows.has('halx')).toBe(false);
    expect(state.rows.has('aisense')).toBe(false);
    expect(state.rows.has('groq')).toBe(false);
  });
});
