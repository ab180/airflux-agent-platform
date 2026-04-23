import type { DrawerStore, PersonalDrawer } from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

export class SqliteDrawerStore implements DrawerStore {
  async ensureDrawer(userId: string): Promise<PersonalDrawer> {
    ensureCollabTables();
    const db = getDb();
    const existing = db
      .prepare(`SELECT user_id, created_at FROM personal_drawers WHERE user_id = ?`)
      .get(userId) as { user_id: string; created_at: string } | undefined;
    if (existing) {
      return { userId: existing.user_id, createdAt: existing.created_at };
    }
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO personal_drawers (user_id, created_at) VALUES (?, ?)`,
    ).run(userId, createdAt);
    return { userId, createdAt };
  }
}
