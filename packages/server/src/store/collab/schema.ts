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

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('code-repo','docs','objective')),
      visibility TEXT NOT NULL CHECK (visibility IN ('private','internal','public')),
      external_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (org_id, slug),
      FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_memberships (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('maintainer','contributor','runner','viewer')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_memberships_user
      ON project_memberships(user_id);

    CREATE TABLE IF NOT EXISTS personal_drawers (
      user_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS asset_promotions (
      id TEXT PRIMARY KEY,
      asset_kind TEXT NOT NULL CHECK (asset_kind IN ('agent','skill','tool','prompt')),
      asset_id TEXT NOT NULL,
      from_scope_kind TEXT NOT NULL CHECK (from_scope_kind IN ('drawer','project')),
      from_scope_ref TEXT NOT NULL,
      to_scope_kind TEXT NOT NULL CHECK (to_scope_kind IN ('drawer','project')),
      to_scope_ref TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN (
        'personal-draft','under-review','published','deprecated','archived'
      )),
      requested_by TEXT NOT NULL,
      reviewed_by TEXT,
      decided_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_promotions_target
      ON asset_promotions(to_scope_kind, to_scope_ref, state);
    CREATE INDEX IF NOT EXISTS idx_promotions_requester
      ON asset_promotions(requested_by, created_at DESC);

    CREATE TABLE IF NOT EXISTS project_assets (
      project_id TEXT NOT NULL,
      asset_kind TEXT NOT NULL CHECK (asset_kind IN ('agent','skill','tool','prompt')),
      asset_id TEXT NOT NULL,
      promoted_from_drawer TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, asset_kind, asset_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (promotion_id) REFERENCES asset_promotions(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_project_assets_project
      ON project_assets(project_id);
  `);
  initialized = true;
}

/** Test-only hook to reset the lazy init guard (so DELETE-in-beforeEach
 *  re-creates tables if they were dropped). */
export function resetCollabInitForTests(): void {
  initialized = false;
}
