import { randomUUID } from 'node:crypto';
import type {
  AssetPromotionRecord,
  PromotionState,
  PromotionStore,
} from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

interface PromotionRow {
  id: string;
  asset_kind: AssetPromotionRecord['assetKind'];
  asset_id: string;
  from_scope_kind: 'drawer' | 'project';
  from_scope_ref: string;
  to_scope_kind: 'drawer' | 'project';
  to_scope_ref: string;
  state: PromotionState;
  requested_by: string;
  reviewed_by: string | null;
  decided_at: string | null;
  notes: string | null;
}

function buildScope(
  kind: 'drawer' | 'project',
  ref: string,
): AssetPromotionRecord['fromScope'] {
  return kind === 'drawer' ? { kind: 'drawer', userId: ref } : { kind: 'project', projectId: ref };
}

function rowToRecord(row: PromotionRow): AssetPromotionRecord {
  const record: AssetPromotionRecord = {
    id: row.id,
    assetKind: row.asset_kind,
    assetId: row.asset_id,
    fromScope: buildScope(row.from_scope_kind, row.from_scope_ref),
    toScope: buildScope(row.to_scope_kind, row.to_scope_ref),
    state: row.state,
    requestedBy: row.requested_by,
  };
  if (row.reviewed_by) record.reviewedBy = row.reviewed_by;
  if (row.decided_at) record.decidedAt = row.decided_at;
  if (row.notes) record.notes = row.notes;
  return record;
}

function scopeRef(scope: AssetPromotionRecord['fromScope']): {
  kind: 'drawer' | 'project';
  ref: string;
} {
  if (scope.kind === 'drawer') return { kind: 'drawer', ref: scope.userId };
  return { kind: 'project', ref: scope.projectId };
}

export class SqlitePromotionStore implements PromotionStore {
  async request(
    input: Omit<AssetPromotionRecord, 'id' | 'state' | 'decidedAt' | 'reviewedBy'>,
  ): Promise<AssetPromotionRecord> {
    ensureCollabTables();
    const id = randomUUID();
    const from = scopeRef(input.fromScope);
    const to = scopeRef(input.toScope);
    getDb()
      .prepare(
        `INSERT INTO asset_promotions
           (id, asset_kind, asset_id, from_scope_kind, from_scope_ref,
            to_scope_kind, to_scope_ref, state, requested_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'under-review', ?, ?)`,
      )
      .run(
        id,
        input.assetKind,
        input.assetId,
        from.kind,
        from.ref,
        to.kind,
        to.ref,
        input.requestedBy,
        input.notes ?? null,
      );
    const fetched = await this.getRecord(id);
    if (!fetched) {
      throw new Error('promotion row vanished immediately after insert');
    }
    return fetched;
  }

  async approve(id: string, reviewer: string, notes?: string): Promise<AssetPromotionRecord> {
    return this.transition(id, reviewer, notes, 'published');
  }

  async reject(id: string, reviewer: string, notes?: string): Promise<AssetPromotionRecord> {
    return this.transition(id, reviewer, notes, 'deprecated');
  }

  async listPending(projectId: string): Promise<AssetPromotionRecord[]> {
    ensureCollabTables();
    const rows = getDb()
      .prepare(
        `SELECT id, asset_kind, asset_id, from_scope_kind, from_scope_ref,
                to_scope_kind, to_scope_ref, state, requested_by,
                reviewed_by, decided_at, notes
         FROM asset_promotions
         WHERE to_scope_kind = 'project'
           AND to_scope_ref = ?
           AND state = 'under-review'
         ORDER BY created_at ASC`,
      )
      .all(projectId) as PromotionRow[];
    return rows.map(rowToRecord);
  }

  private async getRecord(id: string): Promise<AssetPromotionRecord | null> {
    const row = getDb()
      .prepare(
        `SELECT id, asset_kind, asset_id, from_scope_kind, from_scope_ref,
                to_scope_kind, to_scope_ref, state, requested_by,
                reviewed_by, decided_at, notes
         FROM asset_promotions WHERE id = ?`,
      )
      .get(id) as PromotionRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  private async transition(
    id: string,
    reviewer: string,
    notes: string | undefined,
    nextState: PromotionState,
  ): Promise<AssetPromotionRecord> {
    ensureCollabTables();
    const decidedAt = new Date().toISOString();
    const result = getDb()
      .prepare(
        `UPDATE asset_promotions
         SET state = ?, reviewed_by = ?, decided_at = ?, notes = COALESCE(?, notes)
         WHERE id = ? AND state = 'under-review'`,
      )
      .run(nextState, reviewer, decidedAt, notes ?? null, id);
    if (result.changes === 0) {
      const existing = await this.getRecord(id);
      if (!existing) throw new Error(`promotion ${id} not found`);
      throw new Error(
        `promotion ${id} is in state '${existing.state}', cannot transition to '${nextState}'`,
      );
    }
    const updated = await this.getRecord(id);
    if (!updated) throw new Error(`promotion ${id} vanished`);
    return updated;
  }
}
