import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { promotionsRoute } from '../routes/promotions.js';
import {
  SqliteOrgStore,
  SqliteMembershipStore,
  SqliteProjectStore,
  SqlitePromotionStore,
} from '../store/collab/index.js';
import { getDb } from '../store/db.js';
import { resetEnvironmentCache } from '../runtime/environment.js';

const orgStore = new SqliteOrgStore();
const membershipStore = new SqliteMembershipStore();
const projectStore = new SqliteProjectStore();
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
  } catch {}
}

function makeApp(): Hono {
  const app = new Hono();
  app.route('/api', promotionsRoute);
  return app;
}

async function seed() {
  const org = await orgStore.createOrg({ slug: 'o', name: 'O' });
  // Make 'local' (the local-mode user) an org member
  await membershipStore.addOrgMember({
    orgId: org.id, userId: 'local', role: 'admin',
  });
  const project = await projectStore.createProject({
    orgId: org.id, slug: 'p', name: 'P', type: 'docs', visibility: 'internal',
  });
  return { org, project };
}

describe('POST /api/promotions/request', () => {
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

  it('creates an under-review record', async () => {
    const { project } = await seed();
    const res = await makeApp().request('/api/promotions/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'agent',
        assetId: 'my-agent',
        toProjectId: project.id,
        notes: 'ready for review',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { state: string; requestedBy: string };
    expect(body.state).toBe('under-review');
    expect(body.requestedBy).toBe('local');
  });

  it('400 when assetKind invalid', async () => {
    const { project } = await seed();
    const res = await makeApp().request('/api/promotions/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'nope',
        assetId: 'x',
        toProjectId: project.id,
      }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when target project missing', async () => {
    const res = await makeApp().request('/api/promotions/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'agent',
        assetId: 'x',
        toProjectId: 'no-such-project',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('403 when caller not in the target project org', async () => {
    const unrelatedOrg = await orgStore.createOrg({ slug: 'other', name: 'Other' });
    const unrelatedProject = await projectStore.createProject({
      orgId: unrelatedOrg.id, slug: 'p', name: 'P', type: 'docs', visibility: 'private',
    });
    // 'local' is not a member of unrelatedOrg
    const res = await makeApp().request('/api/promotions/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetKind: 'agent',
        assetId: 'x',
        toProjectId: unrelatedProject.id,
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/promotions/mine', () => {
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

  it('lists every state the caller requested, newest first', async () => {
    const { project } = await seed();

    const first = await promotionStore.request({
      assetKind: 'agent', assetId: 'a',
      fromScope: { kind: 'drawer', userId: 'local' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'local',
    });
    const second = await promotionStore.request({
      assetKind: 'skill', assetId: 's',
      fromScope: { kind: 'drawer', userId: 'local' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'local',
    });
    // Approve the first — still in mine list but state changed.
    await promotionStore.approve(first.id, 'reviewer');

    const res = await makeApp().request('/api/promotions/mine');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      promotions: Array<{ id: string; state: string }>;
    };
    expect(body.promotions).toHaveLength(2);
    // Newest first — second (still under-review) comes before first (published)
    expect(body.promotions[0].id).toBe(second.id);
    expect(body.promotions[0].state).toBe('under-review');
    expect(body.promotions[1].id).toBe(first.id);
    expect(body.promotions[1].state).toBe('published');
  });

  it('returns empty list when caller has requested nothing', async () => {
    const res = await makeApp().request('/api/promotions/mine');
    const body = (await res.json()) as { promotions: unknown[] };
    expect(body.promotions).toEqual([]);
  });
});

describe('GET /api/promotions?projectId=', () => {
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

  it('returns pending promotions for a project the caller is a member of', async () => {
    const { project } = await seed();
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'local', role: 'maintainer',
    });
    await promotionStore.request({
      assetKind: 'agent',
      assetId: 'a',
      fromScope: { kind: 'drawer', userId: 'local' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'local',
    });

    const res = await makeApp().request(`/api/promotions?projectId=${project.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { promotions: Array<{ id: string }> };
    expect(body.promotions).toHaveLength(1);
  });

  it('403 when caller is not a project member', async () => {
    const { project } = await seed();
    // 'local' is an org admin but NOT a project member
    const res = await makeApp().request(`/api/promotions?projectId=${project.id}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/promotions/:id/approve|reject', () => {
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

  it('maintainer can approve; transitions to published', async () => {
    const { project } = await seed();
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'local', role: 'maintainer',
    });
    const rec = await promotionStore.request({
      assetKind: 'agent',
      assetId: 'a',
      fromScope: { kind: 'drawer', userId: 'local' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'local',
    });

    const res = await makeApp().request(`/api/promotions/${rec.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'LGTM' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; reviewedBy: string };
    expect(body.state).toBe('published');
    expect(body.reviewedBy).toBe('local');
  });

  it('403 when caller is not maintainer (e.g. only runner)', async () => {
    const { project } = await seed();
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'local', role: 'runner',
    });
    const rec = await promotionStore.request({
      assetKind: 'agent',
      assetId: 'a',
      fromScope: { kind: 'drawer', userId: 'local' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'local',
    });
    const res = await makeApp().request(`/api/promotions/${rec.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('reject transitions to deprecated', async () => {
    const { project } = await seed();
    await membershipStore.addProjectMember({
      projectId: project.id, userId: 'local', role: 'maintainer',
    });
    const rec = await promotionStore.request({
      assetKind: 'agent',
      assetId: 'a',
      fromScope: { kind: 'drawer', userId: 'local' },
      toScope: { kind: 'project', projectId: project.id },
      requestedBy: 'local',
    });
    const res = await makeApp().request(`/api/promotions/${rec.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'too risky' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe('deprecated');
  });

  it('404 when promotion id unknown', async () => {
    const res = await makeApp().request(`/api/promotions/does-not-exist/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
