import { randomUUID } from 'node:crypto';
import type { Project, ProjectStore, ProjectType, ProjectVisibility } from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

interface ProjectRow {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  type: ProjectType;
  visibility: ProjectVisibility;
  external_ref: string | null;
  created_at: string;
}

function rowToProject(row: ProjectRow): Project {
  const p: Project = {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    visibility: row.visibility,
    createdAt: row.created_at,
  };
  if (row.external_ref) p.externalRef = row.external_ref;
  return p;
}

export class SqliteProjectStore implements ProjectStore {
  async createProject(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    ensureCollabTables();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      getDb()
        .prepare(
          `INSERT INTO projects
             (id, org_id, slug, name, type, visibility, external_ref, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.orgId,
          input.slug,
          input.name,
          input.type,
          input.visibility,
          input.externalRef ?? null,
          createdAt,
        );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') && msg.includes('projects.org_id, projects.slug')) {
        throw new Error(`Project slug '${input.slug}' already exists in this org`);
      }
      throw err;
    }
    return {
      id,
      orgId: input.orgId,
      slug: input.slug,
      name: input.name,
      type: input.type,
      visibility: input.visibility,
      createdAt,
      ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
    };
  }

  async getProject(id: string): Promise<Project | null> {
    ensureCollabTables();
    const row = getDb()
      .prepare(
        `SELECT id, org_id, slug, name, type, visibility, external_ref, created_at
         FROM projects WHERE id = ?`,
      )
      .get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  async listProjects(orgId: string): Promise<Project[]> {
    ensureCollabTables();
    const rows = getDb()
      .prepare(
        `SELECT id, org_id, slug, name, type, visibility, external_ref, created_at
         FROM projects WHERE org_id = ?
         ORDER BY created_at ASC`,
      )
      .all(orgId) as ProjectRow[];
    return rows.map(rowToProject);
  }
}
