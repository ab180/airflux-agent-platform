import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteOrgStore, SqliteMembershipStore } from '../store/collab/index.js';
import { getDb } from '../store/db.js';

const orgStore = new SqliteOrgStore();
const membershipStore = new SqliteMembershipStore();

describe('SqliteOrgStore', () => {
  beforeEach(() => {
    try {
      const db = getDb();
      db.exec('DELETE FROM org_memberships');
      db.exec('DELETE FROM orgs');
    } catch {
      // tables will be created lazily
    }
  });

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
    await expect(orgStore.createOrg({ slug: 'same', name: 'Second' })).rejects.toThrow(
      /slug|already|unique/i,
    );
  });
});

describe('SqliteMembershipStore + listOrgsForUser', () => {
  beforeEach(() => {
    try {
      const db = getDb();
      db.exec('DELETE FROM org_memberships');
      db.exec('DELETE FROM orgs');
    } catch {
      // tables will be created lazily
    }
  });

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
