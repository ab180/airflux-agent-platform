import { beforeEach, describe, expect, it } from 'vitest';
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
    resetEnvironmentCache();
    process.env.AIROPS_MODE = 'local';
    delete process.env.AGENT_API_URL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
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
