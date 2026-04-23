import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { workspacesRoute } from '../routes/workspaces.js';
import {
  SqliteOrgStore,
  SqliteMembershipStore,
  SqliteProjectStore,
} from '../store/collab/index.js';
import { getDb } from '../store/db.js';
import { resetEnvironmentCache } from '../runtime/environment.js';

const orgStore = new SqliteOrgStore();
const membershipStore = new SqliteMembershipStore();
const projectStore = new SqliteProjectStore();

function cleanAll(): void {
  try {
    const db = getDb();
    db.exec('DELETE FROM drawer_assets');
    db.exec('DELETE FROM project_assets');
    db.exec('DELETE FROM asset_promotions');
    db.exec('DELETE FROM project_memberships');
    db.exec('DELETE FROM personal_drawers');
    db.exec('DELETE FROM projects');
    db.exec('DELETE FROM org_memberships');
    db.exec('DELETE FROM orgs');
  } catch {}
}

function makeApp(): Hono {
  const app = new Hono();
  app.route('/api', workspacesRoute);
  return app;
}

describe('GET /api/workspaces (local mode)', () => {
  beforeEach(() => {
    cleanAll();
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    vi.stubEnv('AIROPS_MODE', 'local');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
  });

  it('returns empty orgs + auto-created drawer for new local user', async () => {
    const res = await makeApp().request('/api/workspaces');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      userId: string;
      runMode: string;
      drawer: { userId: string; createdAt: string };
      orgs: unknown[];
    };
    expect(body.userId).toBe('local');
    expect(body.runMode).toBe('local');
    expect(body.drawer.userId).toBe('local');
    expect(body.orgs).toEqual([]);
  });

  it('includes orgs + projects the user is a member of', async () => {
    const org = await orgStore.createOrg({ slug: 'myorg', name: 'My Org' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'local', role: 'admin' });
    const project = await projectStore.createProject({
      orgId: org.id,
      slug: 'p1',
      name: 'P1',
      type: 'docs',
      visibility: 'internal',
    });

    const res = await makeApp().request('/api/workspaces');
    const body = (await res.json()) as {
      orgs: Array<{ id: string; projects: Array<{ id: string; slug: string }> }>;
    };
    expect(body.orgs).toHaveLength(1);
    expect(body.orgs[0].id).toBe(org.id);
    expect(body.orgs[0].projects).toHaveLength(1);
    expect(body.orgs[0].projects[0].id).toBe(project.id);
  });
});

describe('GET /api/projects/:projectId', () => {
  beforeEach(() => {
    cleanAll();
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    vi.stubEnv('AIROPS_MODE', 'local');
  });

  it('returns project + caller role + members for a member', async () => {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'local', role: 'admin' });
    const p = await projectStore.createProject({
      orgId: org.id, slug: 'p', name: 'P', type: 'docs', visibility: 'internal',
    });
    await membershipStore.addProjectMember({
      projectId: p.id, userId: 'local', role: 'maintainer',
    });

    const res = await makeApp().request(`/api/projects/${p.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { id: string };
      callerRole: string;
      members: Array<{ userId: string; role: string }>;
    };
    expect(body.project.id).toBe(p.id);
    expect(body.callerRole).toBe('maintainer');
    expect(body.members).toHaveLength(1);
    expect(body.members[0].userId).toBe('local');
  });

  it('404 when project does not exist', async () => {
    const res = await makeApp().request('/api/projects/no-such');
    expect(res.status).toBe(404);
  });

  it('403 when caller is not a project member', async () => {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    const p = await projectStore.createProject({
      orgId: org.id, slug: 'p', name: 'P', type: 'docs', visibility: 'private',
    });
    // no project membership added for 'local'
    const res = await makeApp().request(`/api/projects/${p.id}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/orgs', () => {
  beforeEach(() => {
    cleanAll();
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    vi.stubEnv('AIROPS_MODE', 'local');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
  });

  it('creates org and makes caller admin', async () => {
    const res = await makeApp().request('/api/orgs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'new-org', name: 'New Org' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; slug: string };
    expect(body.slug).toBe('new-org');

    const orgs = await orgStore.listOrgsForUser('local');
    expect(orgs).toHaveLength(1);
  });

  it('400 on invalid slug', async () => {
    const res = await makeApp().request('/api/orgs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'Has Spaces', name: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('409 on duplicate slug', async () => {
    const app = makeApp();
    await app.request('/api/orgs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'dup', name: 'one' }),
    });
    const res = await app.request('/api/orgs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'dup', name: 'two' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('drawer assets', () => {
  beforeEach(() => {
    cleanAll();
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    vi.stubEnv('AIROPS_MODE', 'local');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
  });

  it('POST registers an asset, GET lists it', async () => {
    const app = makeApp();
    const post = await app.request('/api/drawer/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'agent',
        assetId: 'my-sql-agent',
        displayName: 'My SQL Agent',
        notes: 'drafted this week',
      }),
    });
    expect(post.status).toBe(201);

    const list = await app.request('/api/drawer/assets');
    const body = (await list.json()) as {
      assets: Array<{ assetId: string; displayName: string }>;
    };
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0].assetId).toBe('my-sql-agent');
    expect(body.assets[0].displayName).toBe('My SQL Agent');
  });

  it('POST with same kind+id updates existing (upsert)', async () => {
    const app = makeApp();
    await app.request('/api/drawer/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'skill', assetId: 's1', displayName: 'first',
      }),
    });
    await app.request('/api/drawer/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'skill', assetId: 's1', displayName: 'second',
      }),
    });
    const list = await app.request('/api/drawer/assets');
    const body = (await list.json()) as {
      assets: Array<{ displayName: string }>;
    };
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0].displayName).toBe('second');
  });

  it('DELETE removes the asset', async () => {
    const app = makeApp();
    await app.request('/api/drawer/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'tool', assetId: 't1', displayName: 'T',
      }),
    });
    const del = await app.request('/api/drawer/assets/tool/t1', {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);

    const list = await app.request('/api/drawer/assets');
    const body = (await list.json()) as { assets: unknown[] };
    expect(body.assets).toEqual([]);
  });

  it('400 on invalid assetKind', async () => {
    const res = await makeApp().request('/api/drawer/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetKind: 'bogus', assetId: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('org member management', () => {
  beforeEach(() => {
    cleanAll();
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    vi.stubEnv('AIROPS_MODE', 'local');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
  });

  async function seedOrgWithLocalAdmin() {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'local', role: 'admin' });
    return org;
  }

  it('GET lists members for admin', async () => {
    const org = await seedOrgWithLocalAdmin();
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'alice', role: 'member' });
    const res = await makeApp().request(`/api/orgs/${org.id}/members`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { members: Array<{ userId: string }> };
    expect(body.members).toHaveLength(2);
  });

  it('POST adds a member', async () => {
    const org = await seedOrgWithLocalAdmin();
    const res = await makeApp().request(`/api/orgs/${org.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'bob', role: 'member' }),
    });
    expect(res.status).toBe(201);
    const members = await membershipStore.listOrgMembers(org.id);
    expect(members).toHaveLength(2);
  });

  it('PATCH updates a member role', async () => {
    const org = await seedOrgWithLocalAdmin();
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'alice', role: 'viewer' });
    const res = await makeApp().request(`/api/orgs/${org.id}/members/alice`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(200);
    expect(await membershipStore.userRoleInOrg('alice', org.id)).toBe('admin');
  });

  it('DELETE refuses to remove the last admin', async () => {
    const org = await seedOrgWithLocalAdmin();
    const res = await makeApp().request(`/api/orgs/${org.id}/members/local`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(409);
  });

  it('403 when caller is not an org admin', async () => {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'local', role: 'member' });
    const res = await makeApp().request(`/api/orgs/${org.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'x', role: 'member' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('project member management', () => {
  beforeEach(() => {
    cleanAll();
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    vi.stubEnv('AIROPS_MODE', 'local');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
  });

  async function seedProjectWithLocalMaintainer() {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'local', role: 'admin' });
    const project = await projectStore.createProject({
      orgId: org.id, slug: 'p', name: 'P', type: 'docs', visibility: 'internal',
    });
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'local', role: 'maintainer',
    });
    return { org, project };
  }

  it('POST adds a member', async () => {
    const { project } = await seedProjectWithLocalMaintainer();
    const res = await makeApp().request(
      `/api/projects/${project.id}/members`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'alice', role: 'contributor' }),
      },
    );
    expect(res.status).toBe(201);
    const members = await membershipStore.listProjectMembers(project.id);
    expect(members).toHaveLength(2);
    expect(members.find(m => m.userId === 'alice')?.role).toBe('contributor');
  });

  it('PATCH updates a member role', async () => {
    const { project } = await seedProjectWithLocalMaintainer();
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'alice', role: 'viewer',
    });
    const res = await makeApp().request(
      `/api/projects/${project.id}/members/alice`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'maintainer' }),
      },
    );
    expect(res.status).toBe(200);
    expect(
      await membershipStore.userRoleInProject('alice', project.id),
    ).toBe('maintainer');
  });

  it('DELETE removes a member', async () => {
    const { project } = await seedProjectWithLocalMaintainer();
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'alice', role: 'runner',
    });
    const res = await makeApp().request(
      `/api/projects/${project.id}/members/alice`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(200);
    expect(
      await membershipStore.userRoleInProject('alice', project.id),
    ).toBeNull();
  });

  it('DELETE refuses to remove the last maintainer', async () => {
    const { project } = await seedProjectWithLocalMaintainer();
    const res = await makeApp().request(
      `/api/projects/${project.id}/members/local`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(409);
    expect(
      await membershipStore.userRoleInProject('local', project.id),
    ).toBe('maintainer');
  });

  it('403 when caller is not a maintainer', async () => {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    const project = await projectStore.createProject({
      orgId: org.id, slug: 'p', name: 'P', type: 'docs', visibility: 'internal',
    });
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'local', role: 'viewer',
    });
    const res = await makeApp().request(
      `/api/projects/${project.id}/members`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: 'x', role: 'runner' }),
      },
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/orgs/:orgId/projects', () => {
  beforeEach(() => {
    cleanAll();
    vi.unstubAllEnvs();
    resetEnvironmentCache();
    vi.stubEnv('AIROPS_MODE', 'local');
    vi.stubEnv('AGENT_API_URL', '');
    vi.stubEnv('AWS_LAMBDA_FUNCTION_NAME', '');
  });

  it('creates project and makes caller maintainer', async () => {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'local', role: 'admin' });
    const res = await makeApp().request(`/api/orgs/${org.id}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: 'my-proj',
        name: 'My Project',
        type: 'docs',
        visibility: 'internal',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; type: string };
    expect(body.type).toBe('docs');
  });

  it('403 when caller is not a member of the org', async () => {
    const org = await orgStore.createOrg({ slug: 'other', name: 'Other' });
    // no membership added — local user is not in this org
    const res = await makeApp().request(`/api/orgs/${org.id}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 's', name: 'S', type: 'docs' }),
    });
    expect(res.status).toBe(403);
  });

  it('400 on invalid type', async () => {
    const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
    await membershipStore.addOrgMember({ orgId: org.id, userId: 'local', role: 'admin' });
    const res = await makeApp().request(`/api/orgs/${org.id}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'x', name: 'X', type: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });
});
