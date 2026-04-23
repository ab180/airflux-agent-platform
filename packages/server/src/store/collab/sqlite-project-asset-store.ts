import type { ProjectAsset, ProjectAssetStore } from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

interface Row {
  project_id: string;
  asset_kind: ProjectAsset['assetKind'];
  asset_id: string;
  promoted_from_drawer: string;
  promotion_id: string;
  published_at: string;
}

function rowTo(row: Row): ProjectAsset {
  return {
    projectId: row.project_id,
    assetKind: row.asset_kind,
    assetId: row.asset_id,
    promotedFromDrawer: row.promoted_from_drawer,
    promotionId: row.promotion_id,
    publishedAt: row.published_at,
  };
}

export class SqliteProjectAssetStore implements ProjectAssetStore {
  async publish(
    input: Omit<ProjectAsset, 'publishedAt'>,
  ): Promise<ProjectAsset> {
    ensureCollabTables();
    const publishedAt = new Date().toISOString();
    // REPLACE-on-conflict so re-promoting an existing asset_id bumps the
    // published_at + promotion_id + drawer pointer. The project_assets
    // table's PK is (project_id, asset_kind, asset_id) so a collision
    // means "this asset was already here".
    getDb()
      .prepare(
        `INSERT INTO project_assets
           (project_id, asset_kind, asset_id, promoted_from_drawer, promotion_id, published_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, asset_kind, asset_id)
         DO UPDATE SET
           promoted_from_drawer = excluded.promoted_from_drawer,
           promotion_id         = excluded.promotion_id,
           published_at         = excluded.published_at`,
      )
      .run(
        input.projectId,
        input.assetKind,
        input.assetId,
        input.promotedFromDrawer,
        input.promotionId,
        publishedAt,
      );
    return { ...input, publishedAt };
  }

  async list(projectId: string): Promise<ProjectAsset[]> {
    ensureCollabTables();
    const rows = getDb()
      .prepare(
        `SELECT project_id, asset_kind, asset_id, promoted_from_drawer,
                promotion_id, published_at
         FROM project_assets
         WHERE project_id = ?
         ORDER BY published_at DESC`,
      )
      .all(projectId) as Row[];
    return rows.map(rowTo);
  }

  async unpublish(
    projectId: string,
    assetKind: ProjectAsset['assetKind'],
    assetId: string,
  ): Promise<boolean> {
    ensureCollabTables();
    const result = getDb()
      .prepare(
        `DELETE FROM project_assets
         WHERE project_id = ? AND asset_kind = ? AND asset_id = ?`,
      )
      .run(projectId, assetKind, assetId);
    return result.changes > 0;
  }
}
