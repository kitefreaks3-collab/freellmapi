import fs from 'node:fs';
import path from 'node:path';

export interface ClaudeCodeConnectionResult {
  settingsPath: string;
  backupPath: string | null;
}

/**
 * Configure Claude Code to use this machine's local FreeLLMAPI gateway.
 * Existing Claude settings are retained and backed up before the atomic write.
 */
export function configureClaudeCode(input: {
  homeDir: string;
  port: number;
  apiKey: string;
}): ClaudeCodeConnectionResult {
  if (!input.apiKey) throw new Error('FreeLLMAPI unified API key is not available yet.');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error('FreeLLMAPI local server port is invalid.');
  }

  const settingsDir = path.join(input.homeDir, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(settingsDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    if (raw.trim()) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Settings root must be a JSON object.');
        }
        settings = parsed as Record<string, unknown>;
      } catch {
        throw new Error('Claude Code settings.json contains invalid JSON. No changes were made.');
      }
    }
  }

  const envValue = settings.env;
  if (envValue !== undefined && (!envValue || typeof envValue !== 'object' || Array.isArray(envValue))) {
    throw new Error('Claude Code settings.json has an invalid env object. No changes were made.');
  }
  const env = (envValue ?? {}) as Record<string, unknown>;
  settings.env = {
    ...env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${input.port}`,
    ANTHROPIC_AUTH_TOKEN: input.apiKey,
  };

  const backupPath = fs.existsSync(settingsPath)
    ? settingsPath + `.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
    : null;
  if (backupPath) fs.copyFileSync(settingsPath, backupPath);

  const tempPath = settingsPath + `.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, settingsPath);
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best effort cleanup */ }
    throw error;
  }

  return { settingsPath, backupPath };
}
