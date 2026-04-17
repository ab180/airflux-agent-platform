import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getDb } from './db.js';

interface StoredConnectionRow {
  user_id: string;
  server_name: string;
  encrypted_blob: string;
  updated_at: string;
}

const SECRET_PATH = resolve(process.cwd(), '../../data/.mcp-credentials.key');

function initTable(): void {
  getDb().prepare(`
    CREATE TABLE IF NOT EXISTS user_mcp_connections (
      user_id TEXT NOT NULL,
      server_name TEXT NOT NULL,
      encrypted_blob TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, server_name)
    )
  `).run();
}

function getSecretKey(): Buffer {
  if (process.env.MCP_CREDENTIALS_SECRET) {
    return createHash('sha256').update(process.env.MCP_CREDENTIALS_SECRET).digest();
  }

  if (!existsSync(SECRET_PATH)) {
    mkdirSync(resolve(SECRET_PATH, '..'), { recursive: true });
    const secret = randomBytes(32).toString('hex');
    writeFileSync(SECRET_PATH, secret, { encoding: 'utf-8', mode: 0o600 });
    try { chmodSync(SECRET_PATH, 0o600); } catch { /* ignore */ }
  }

  return createHash('sha256').update(readFileSync(SECRET_PATH, 'utf-8')).digest();
}

function encrypt(payload: Record<string, string>): string {
  const key = getSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decrypt(blob: string): Record<string, string> {
  const parsed = JSON.parse(blob) as { iv: string; tag: string; data: string };
  const key = getSecretKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf-8')) as Record<string, string>;
}

export function upsertUserMCPConnection(
  userId: string,
  serverName: string,
  values: Record<string, string>,
): void {
  initTable();
  const sanitized = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value.trim()]),
  );
  const encryptedBlob = encrypt(sanitized);
  getDb().prepare(`
    INSERT INTO user_mcp_connections (user_id, server_name, encrypted_blob, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, server_name)
    DO UPDATE SET encrypted_blob = excluded.encrypted_blob, updated_at = excluded.updated_at
  `).run(userId, serverName, encryptedBlob, new Date().toISOString());
}

export function getUserMCPConnection(
  userId: string,
  serverName: string,
): Record<string, string> | null {
  initTable();
  const row = getDb().prepare(`
    SELECT user_id, server_name, encrypted_blob, updated_at
    FROM user_mcp_connections
    WHERE user_id = ? AND server_name = ?
  `).get(userId, serverName) as StoredConnectionRow | undefined;

  if (!row) return null;
  return decrypt(row.encrypted_blob);
}

export function listUserMCPConnections(userId: string): { serverName: string; updatedAt: string }[] {
  initTable();
  return getDb().prepare(`
    SELECT server_name as serverName, updated_at as updatedAt
    FROM user_mcp_connections
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId) as { serverName: string; updatedAt: string }[];
}

export function deleteUserMCPConnection(userId: string, serverName: string): boolean {
  initTable();
  const result = getDb().prepare(`
    DELETE FROM user_mcp_connections
    WHERE user_id = ? AND server_name = ?
  `).run(userId, serverName);
  return result.changes > 0;
}
