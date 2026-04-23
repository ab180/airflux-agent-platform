import type {
  MembershipStore,
  OrgMembership,
  OrgRole,
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

interface OrgMembershipRow {
  org_id: string;
  user_id: string;
  role: OrgRole;
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

function rowToOrgMembership(row: OrgMembershipRow): OrgMembership {
  return {
    orgId: row.org_id,
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

  async updateOrgMemberRole(
    orgId: string,
    userId: string,
    role: OrgRole,
  ): Promise<boolean> {
    ensureCollabTables();
    const result = getDb()
      .prepare(
        `UPDATE org_memberships SET role = ?
         WHERE org_id = ? AND user_id = ?`,
      )
      .run(role, orgId, userId);
    return result.changes > 0;
  }

  async removeOrgMember(orgId: string, userId: string): Promise<boolean> {
    ensureCollabTables();
    const result = getDb()
      .prepare(
        `DELETE FROM org_memberships
         WHERE org_id = ? AND user_id = ?`,
      )
      .run(orgId, userId);
    return result.changes > 0;
  }

  async listOrgMembers(orgId: string): Promise<OrgMembership[]> {
    ensureCollabTables();
    const rows = getDb()
      .prepare(
        `SELECT org_id, user_id, role, joined_at
         FROM org_memberships
         WHERE org_id = ?
         ORDER BY joined_at ASC`,
      )
      .all(orgId) as OrgMembershipRow[];
    return rows.map(rowToOrgMembership);
  }

  async userRoleInOrg(
    userId: string,
    orgId: string,
  ): Promise<OrgRole | null> {
    ensureCollabTables();
    const row = getDb()
      .prepare(
        `SELECT role FROM org_memberships
         WHERE user_id = ? AND org_id = ?`,
      )
      .get(userId, orgId) as { role: OrgRole } | undefined;
    return row ? row.role : null;
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

  async updateProjectMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<boolean> {
    ensureCollabTables();
    const result = getDb()
      .prepare(
        `UPDATE project_memberships SET role = ?
         WHERE project_id = ? AND user_id = ?`,
      )
      .run(role, projectId, userId);
    return result.changes > 0;
  }

  async removeProjectMember(
    projectId: string,
    userId: string,
  ): Promise<boolean> {
    ensureCollabTables();
    const result = getDb()
      .prepare(
        `DELETE FROM project_memberships
         WHERE project_id = ? AND user_id = ?`,
      )
      .run(projectId, userId);
    return result.changes > 0;
  }
}
