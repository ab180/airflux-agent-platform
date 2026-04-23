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
