import { getDb } from '../db/index.js';
import { encrypt } from '../lib/crypto.js';
import { getAllProviders } from '../providers/index.js';

/**
 * Seed only providers whose adapters explicitly declare keyless support.
 * Existing rows (including disabled rows or user-supplied credentials) are
 * left untouched so a desktop restart never changes the user's choices.
 *
 * This runs only in the embedded desktop host, after database initialization.
 */
export function initializeDesktopKeylessProviders(): string[] {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES (?, '', ?, ?, ?, 'unknown', 1)
  `);
  const exists = db.prepare('SELECT 1 AS present FROM api_keys WHERE platform = ? LIMIT 1');

  const initialized: string[] = [];
  const seed = db.transaction(() => {
    for (const provider of getAllProviders()) {
      if (!provider.keyless) continue;
      // These two adapters expose a separate decision endpoint rather than
      // general chat inference; keep them opt-in instead of adding them to the
      // default chat-provider pool.
      if (provider.platform === 'halx' || provider.platform === 'aisense') continue;
      if (exists.get(provider.platform)) continue;

      const secret = encrypt('no-key');
      insert.run(provider.platform, secret.encrypted, secret.iv, secret.authTag);
      initialized.push(provider.platform);
    }
  });

  seed();
  if (initialized.length > 0) {
    console.log(`[desktop] enabled anonymous providers: ${initialized.join(', ')}`);
  }
  return initialized;
}
