import type { DrawerAsset, DrawerAssetStore } from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

interface Row {
  user_id: string;
  asset_kind: DrawerAsset['assetKind'];
  asset_id: string;
  display_name: string;
  notes: string | null;
  created_at: string;
}

function rowTo(row: Row): DrawerAsset {
  const a: DrawerAsset = {
    userId: row.user_id,
    assetKind: row.asset_kind,
    assetId: row.asset_id,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
  if (row.notes) a.notes = row.notes;
  return a;
}

export class SqliteDrawerAssetStore implements DrawerAssetStore {
  async register(input: Omit<DrawerAsset, 'createdAt'>): Promise<DrawerAsset> {
    ensureCollabTables();
    const createdAt = new Date().toISOString();
    // Upsert: editing display_name or notes on an existing entry is
    // idempotent. PK collisions come from same (user, kind, id).
    getDb()
      .prepare(
        `INSERT INTO drawer_assets
           (user_id, asset_kind, asset_id, display_name, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, asset_kind, asset_id)
         DO UPDATE SET
           display_name = excluded.display_name,
           notes        = excluded.notes`,
      )
      .run(
        input.userId,
        input.assetKind,
        input.assetId,
        input.displayName,
        input.notes ?? null,
        createdAt,
      );
    return { ...input, createdAt };
  }

  async list(userId: string): Promise<DrawerAsset[]> {
    ensureCollabTables();
    const rows = getDb()
      .prepare(
        `SELECT user_id, asset_kind, asset_id, display_name, notes, created_at
         FROM drawer_assets
         WHERE user_id = ?
         ORDER BY created_at DESC`,
      )
      .all(userId) as Row[];
    return rows.map(rowTo);
  }

  async remove(
    userId: string,
    assetKind: DrawerAsset['assetKind'],
    assetId: string,
  ): Promise<boolean> {
    ensureCollabTables();
    const result = getDb()
      .prepare(
        `DELETE FROM drawer_assets
         WHERE user_id = ? AND asset_kind = ? AND asset_id = ?`,
      )
      .run(userId, assetKind, assetId);
    return result.changes > 0;
  }
}
