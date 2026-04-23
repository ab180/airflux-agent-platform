import type {
  MembershipStore,
  OrgMembership,
  ProjectMembership,
  ProjectRole,
} from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

interface ProjectMembershipRow {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
}

function rowToProjectMembership(row: ProjectMembershipRow): ProjectMembership {
  return {
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
  };
}

export class SqliteMembershipStore implements MembershipStore {
  async addOrgMember(m: Omit<OrgMembership, 'joinedAt'>): Promise<void> {
    ensureCollabTables();
    const joinedAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, joined_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(m.orgId, m.userId, m.role, joinedAt);
  }

  async addProjectMember(m: Omit<ProjectMembership, 'joinedAt'>): Promise<void> {
    ensureCollabTables();
    const joinedAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO project_memberships
           (project_id, user_id, role, joined_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(m.projectId, m.userId, m.role, joinedAt);
  }

  async listProjectMembers(projectId: string): Promise<ProjectMembership[]> {
    ensureCollabTables();
    const rows = getDb()
      .prepare(
        `SELECT project_id, user_id, role, joined_at
         FROM project_memberships
         WHERE project_id = ?
         ORDER BY joined_at ASC`,
      )
      .all(projectId) as ProjectMembershipRow[];
    return rows.map(rowToProjectMembership);
  }

  async userRoleInProject(
    userId: string,
    projectId: string,
  ): Promise<ProjectRole | null> {
    ensureCollabTables();
    const row = getDb()
      .prepare(
        `SELECT role FROM project_memberships
         WHERE user_id = ? AND project_id = ?`,
      )
      .get(userId, projectId) as { role: ProjectRole } | undefined;
    return row ? row.role : null;
  }
}
