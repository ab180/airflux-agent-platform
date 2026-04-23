import type {
  MembershipStore,
  OrgMembership,
  ProjectMembership,
  ProjectRole,
} from '@airflux/runtime';
import { getDb } from '../db.js';
import { ensureCollabTables } from './schema.js';

/**
 * Phase 1 implements the Org-level membership half of MembershipStore.
 * Project membership methods will be added alongside SqliteProjectStore
 * in Phase 2. They're stubbed here so the interface check passes.
 */
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

  async addProjectMember(_m: Omit<ProjectMembership, 'joinedAt'>): Promise<void> {
    throw new Error('addProjectMember not implemented until Phase 2');
  }

  async listProjectMembers(_projectId: string): Promise<ProjectMembership[]> {
    throw new Error('listProjectMembers not implemented until Phase 2');
  }

  async userRoleInProject(
    _userId: string,
    _projectId: string,
  ): Promise<ProjectRole | null> {
    throw new Error('userRoleInProject not implemented until Phase 2');
  }
}
