import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configureClaudeCode } from '../claude-code.js';

const roots: string[] = [];
function home(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freellmapi-claude-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('configureClaudeCode', () => {
  it('creates Claude settings with the local gateway and unified key', () => {
    const root = home();
    const result = configureClaudeCode({ homeDir: root, port: 31415, apiKey: 'local-secret' });
    const saved = JSON.parse(fs.readFileSync(result.settingsPath, 'utf8'));
    expect(saved.env).toEqual({
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:31415',
      ANTHROPIC_AUTH_TOKEN: 'local-secret',
    });
    expect(result.backupPath).toBeNull();
  });

  it('preserves other settings and backs up the original file', () => {
    const root = home();
    const dir = path.join(root, '.claude');
    fs.mkdirSync(dir);
    const settingsPath = path.join(dir, 'settings.json');
    const original = {
      theme: 'dark',
      permissions: { allow: ['Read(*)'] },
      env: { OTHER_SETTING: 'keep-me', ANTHROPIC_BASE_URL: 'https://old.example' },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(original));
    const result = configureClaudeCode({ homeDir: root, port: 32000, apiKey: 'local-secret' });
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(saved.theme).toBe('dark');
    expect(saved.permissions).toEqual(original.permissions);
    expect(saved.env.OTHER_SETTING).toBe('keep-me');
    expect(saved.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:32000');
    expect(result.backupPath).not.toBeNull();
    expect(JSON.parse(fs.readFileSync(result.backupPath!, 'utf8'))).toEqual(original);
  });

  it('refuses malformed JSON without overwriting it', () => {
    const root = home();
    const dir = path.join(root, '.claude');
    fs.mkdirSync(dir);
    const settingsPath = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsPath, '{not json');
    expect(() => configureClaudeCode({ homeDir: root, port: 31415, apiKey: 'key' }))
      .toThrow('invalid JSON');
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{not json');
  });

  it('rejects invalid ports and missing keys', () => {
    const root = home();
    expect(() => configureClaudeCode({ homeDir: root, port: 0, apiKey: 'key' })).toThrow('port is invalid');
    expect(() => configureClaudeCode({ homeDir: root, port: 31415, apiKey: '' })).toThrow('key is not available');
  });
});
