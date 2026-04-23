import { beforeEach, describe, expect, it } from 'vitest';
import {
  SqliteOrgStore,
  SqliteMembershipStore,
  SqliteProjectStore,
  SqliteDrawerStore,
  SqlitePromotionStore,
} from '../store/collab/index.js';
import { getDb } from '../store/db.js';

const orgStore = new SqliteOrgStore();
const membershipStore = new SqliteMembershipStore();
const projectStore = new SqliteProjectStore();
const drawerStore = new SqliteDrawerStore();
const promotionStore = new SqlitePromotionStore();

function cleanAll(): void {
  try {
    const db = getDb();
    db.exec('DELETE FROM asset_promotions');
    db.exec('DELETE FROM project_memberships');
    db.exec('DELETE FROM personal_drawers');
    db.exec('DELETE FROM projects');
    db.exec('DELETE FROM org_memberships');
    db.exec('DELETE FROM orgs');
  } catch {
    // tables will be created lazily by adapters on first use
  }
}

async function freshOrg() {
  const slug = `org-${Math.random().toString(36).slice(2, 8)}`;
  return orgStore.createOrg({ slug, name: slug });
}

describe('SqliteOrgStore', () => {
  beforeEach(cleanAll);

  it('creates and retrieves an org by id', async () => {
    const org = await orgStore.createOrg({
      slug: 'acme',
      name: 'Acme Inc.',
    });
    expect(org.id).toMatch(/.+/);
    expect(org.slug).toBe('acme');
    expect(org.name).toBe('Acme Inc.');
    expect(org.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    const fetched = await orgStore.getOrg(org.id);
    expect(fetched).toEqual(org);
  });

  it('returns null for unknown org id', async () => {
    const fetched = await orgStore.getOrg('does-not-exist');
    expect(fetched).toBeNull();
  });

  it('rejects duplicate slugs', async () => {
    await orgStore.createOrg({ slug: 'same', name: 'First' });
    await expect(
      orgStore.createOrg({ slug: 'same', name: 'Second' }),
    ).rejects.toThrow(/slug|already|unique/i);
  });
});

describe('SqliteMembershipStore — org membership', () => {
  beforeEach(cleanAll);

  it('adds a member and lists that org for the user', async () => {
    const org = await orgStore.createOrg({ slug: 'co', name: 'Co' });
    await membershipStore.addOrgMember({
      orgId: org.id,
      userId: 'alice',
      role: 'admin',
    });

    const orgs = await orgStore.listOrgsForUser('alice');
    expect(orgs).toHaveLength(1);
    expect(orgs[0].id).toBe(org.id);
  });

  it('returns empty list when user has no memberships', async () => {
    const orgs = await orgStore.listOrgsForUser('nobody');
    expect(orgs).toEqual([]);
  });

  it('dedupes duplicate membership inserts', async () => {
    const org = await orgStore.createOrg({ slug: 'dup', name: 'Dup' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'bob', role: 'member' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'bob', role: 'member' });

    const orgs = await orgStore.listOrgsForUser('bob');
    expect(orgs).toHaveLength(1);
  });
});

describe('SqliteProjectStore', () => {
  beforeEach(cleanAll);

  it('creates and retrieves a project', async () => {
    const org = await freshOrg();
    const p = await projectStore.createProject({
      orgId: org.id,
      slug: 'data',
      name: 'Data Project',
      type: 'code-repo',
      visibility: 'internal',
    });
    expect(p.id).toMatch(/.+/);
    expect(p.type).toBe('code-repo');
    expect(p.visibility).toBe('internal');

    const fetched = await projectStore.getProject(p.id);
    expect(fetched).toEqual(p);
  });

  it('lists projects by org', async () => {
    const org = await freshOrg();
    await projectStore.createProject({
      orgId: org.id, slug: 'a', name: 'A', type: 'code-repo', visibility: 'private',
    });
    await projectStore.createProject({
      orgId: org.id, slug: 'b', name: 'B', type: 'docs', visibility: 'internal',
    });
    const list = await projectStore.listProjects(org.id);
    expect(list).toHaveLength(2);
    expect(list.map(p => p.slug).sort()).toEqual(['a', 'b']);
  });

  it('rejects duplicate slug within the same org', async () => {
    const org = await freshOrg();
    await projectStore.createProject({
      orgId: org.id, slug: 'dup', name: 'x', type: 'docs', visibility: 'private',
    });
    await expect(
      projectStore.createProject({
        orgId: org.id, slug: 'dup', name: 'y', type: 'docs', visibility: 'private',
      }),
    ).rejects.toThrow(/slug|unique|already/i);
  });

  it('allows same slug across different orgs', async () => {
    const o1 = await freshOrg();
    const o2 = await freshOrg();
    await projectStore.createProject({
      orgId: o1.id, slug: 'same', name: 'in org 1', type: 'docs', visibility: 'private',
    });
    const p2 = await projectStore.createProject({
      orgId: o2.id, slug: 'same', name: 'in org 2', type: 'docs', visibility: 'private',
    });
    expect(p2.orgId).toBe(o2.id);
  });
});

describe('SqliteMembershipStore — project membership', () => {
  beforeEach(cleanAll);

  it('adds + lists project members', async () => {
    const org = await freshOrg();
    const p = await projectStore.createProject({
      orgId: org.id, slug: 'x', name: 'X', type: 'code-repo', visibility: 'private',
    });
    await membershipStore.addProjectMember({
      projectId: p.id, userId: 'alice', role: 'maintainer',
    });
    await membershipStore.addProjectMember({
      projectId: p.id, userId: 'bob', role: 'viewer',
    });

    const members = await membershipStore.listProjectMembers(p.id);
    expect(members).toHaveLength(2);

    expect(await membershipStore.userRoleInProject('alice', p.id)).toBe('maintainer');
    expect(await membershipStore.userRoleInProject('bob', p.id)).toBe('viewer');
    expect(await membershipStore.userRoleInProject('carol', p.id)).toBeNull();
  });

  it('dedupes duplicate addProjectMember', async () => {
    const org = await freshOrg();
    const p = await projectStore.createProject({
      orgId: org.id, slug: 'd', name: 'D', type: 'docs', visibility: 'private',
    });
    await membershipStore.addProjectMember({ projectId: p.id, userId: 'u', role: 'runner' });
    await membershipStore.addProjectMember({ projectId: p.id, userId: 'u', role: 'runner' });
    const members = await membershipStore.listProjectMembers(p.id);
    expect(members).toHaveLength(1);
  });
});

describe('SqliteDrawerStore', () => {
  beforeEach(cleanAll);

  it('creates a drawer on first ensure + returns existing on second', async () => {
    const d1 = await drawerStore.ensureDrawer('alice');
    expect(d1.userId).toBe('alice');
    expect(d1.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    const d2 = await drawerStore.ensureDrawer('alice');
    expect(d2.createdAt).toBe(d1.createdAt);
  });
});

describe('SqlitePromotionStore', () => {
  beforeEach(cleanAll);

  async function seed() {
    const org = await freshOrg();
    const project = await projectStore.createProject({
      orgId: org.id, slug: 'p', name: 'P', type: 'docs', visibility: 'internal',
    });
    return { org, project };
  }

  it('creates a promotion request in under-review state', async () => {
    const { project } = await seed();
    const rec = await promotionStore.request({
      assetKind: 'agent',
      assetId: 'my-agent',
      fromScope: { kind: 'drawer', userId: 'alice' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'alice',
    });
    expect(rec.state).toBe('under-review');
    expect(rec.assetKind).toBe('agent');
    expect(rec.fromScope).toEqual({ kind: 'drawer', userId: 'alice' });
    expect(rec.toScope).toEqual({ kind: 'project', projectId: project.id });
    expect(rec.requestedBy).toBe('alice');
    expect(rec.reviewedBy).toBeUndefined();
    expect(rec.decidedAt).toBeUndefined();
  });

  it('approves transitions to published and stamps reviewer/decidedAt', async () => {
    const { project } = await seed();
    const rec = await promotionStore.request({
      assetKind: 'skill',
      assetId: 'sql-analyst',
      fromScope: { kind: 'drawer', userId: 'alice' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'alice',
    });
    const approved = await promotionStore.approve(rec.id, 'bob', 'LGTM');
    expect(approved.state).toBe('published');
    expect(approved.reviewedBy).toBe('bob');
    expect(approved.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(approved.notes).toBe('LGTM');
  });

  it('rejects transitions to deprecated', async () => {
    const { project } = await seed();
    const rec = await promotionStore.request({
      assetKind: 'tool',
      assetId: 't',
      fromScope: { kind: 'drawer', userId: 'alice' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'alice',
    });
    const rejected = await promotionStore.reject(rec.id, 'bob', 'insufficient coverage');
    expect(rejected.state).toBe('deprecated');
    expect(rejected.reviewedBy).toBe('bob');
  });

  it('refuses to transition a non-under-review record', async () => {
    const { project } = await seed();
    const rec = await promotionStore.request({
      assetKind: 'agent',
      assetId: 'a',
      fromScope: { kind: 'drawer', userId: 'alice' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'alice',
    });
    await promotionStore.approve(rec.id, 'bob');
    await expect(promotionStore.approve(rec.id, 'bob')).rejects.toThrow(/state/i);
  });

  it('listPending returns only under-review records for the given project', async () => {
    const { project } = await seed();
    const openRec = await promotionStore.request({
      assetKind: 'agent',
      assetId: 'open',
      fromScope: { kind: 'drawer', userId: 'alice' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'alice',
    });
    const closedRec = await promotionStore.request({
      assetKind: 'agent',
      assetId: 'closed',
      fromScope: { kind: 'drawer', userId: 'alice' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'alice',
    });
    await promotionStore.approve(closedRec.id, 'bob');

    const pending = await promotionStore.listPending(project.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(openRec.id);
  });
});
