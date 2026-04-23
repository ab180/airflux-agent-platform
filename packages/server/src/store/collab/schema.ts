import { getDb } from '../db.js';

/**
 * Collab tables (Org/Project/Memberships/etc.) — all created together
 * via a single lazy init. Matches the pattern used by audit-log and the
 * other stores.
 */

let initialized = false;

export function ensureCollabTables(): void {
  if (initialized) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS org_memberships (
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','member','viewer')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (org_id, user_id),
      FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_org_memberships_user
      ON org_memberships(user_id);
  `);
  initialized = true;
}

/** Test-only hook to reset the lazy init guard (so DELETE-in-beforeEach
 *  re-creates tables if they were dropped). */
export function resetCollabInitForTests(): void {
  initialized = false;
}
