import { randomUUID } from 'node:crypto';
import type { Org, OrgStore } from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

function rowToOrg(row: OrgRow): Org {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
  };
}

export class SqliteOrgStore implements OrgStore {
  async createOrg(input: Omit<Org, 'id' | 'createdAt'>): Promise<Org> {
    ensureCollabTables();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      getDb()
        .prepare(
          `INSERT INTO orgs (id, slug, name, created_at) VALUES (?, ?, ?, ?)`,
        )
        .run(id, input.slug, input.name, createdAt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') && msg.includes('orgs.slug')) {
        throw new Error(`Org slug '${input.slug}' already exists`);
      }
      throw err;
    }
    return { id, slug: input.slug, name: input.name, createdAt };
  }

  async getOrg(id: string): Promise<Org | null> {
    ensureCollabTables();
    const row = getDb()
      .prepare(`SELECT id, slug, name, created_at FROM orgs WHERE id = ?`)
      .get(id) as OrgRow | undefined;
    return row ? rowToOrg(row) : null;
  }

  async listOrgsForUser(userId: string): Promise<Org[]> {
    ensureCollabTables();
    const rows = getDb()
      .prepare(
        `SELECT DISTINCT o.id, o.slug, o.name, o.created_at
         FROM orgs o
         JOIN org_memberships m ON m.org_id = o.id
         WHERE m.user_id = ?
         ORDER BY o.created_at ASC`,
      )
      .all(userId) as OrgRow[];
    return rows.map(rowToOrg);
  }
}
