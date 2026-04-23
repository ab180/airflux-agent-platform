import { describe, it, expect } from 'vitest';
import type {
  ProjectType,
  ProjectRole,
  OrgRole,
  Project,
  PromotionState,
  AssetPromotionRecord,
  ResourceACL,
} from '../index.js';

describe('collab type shape', () => {
  it('allows the three project types', () => {
    const ts: ProjectType[] = ['code-repo', 'docs', 'objective'];
    expect(ts).toHaveLength(3);
  });

  it('defines 4 project roles and 3 org roles', () => {
    const pr: ProjectRole[] = ['maintainer', 'contributor', 'runner', 'viewer'];
    const or: OrgRole[] = ['admin', 'member', 'viewer'];
    expect(pr).toHaveLength(4);
    expect(or).toHaveLength(3);
  });

  it('Project carries visibility + optional externalRef', () => {
    const p: Project = {
      id: 'p1',
      orgId: 'o1',
      slug: 'my-project',
      name: 'My Project',
      type: 'code-repo',
      visibility: 'internal',
      createdAt: '2026-04-23T00:00:00Z',
      externalRef: 'https://github.com/ab180/airflux',
    };
    expect(p.visibility).toBe('internal');
    expect(p.externalRef).toMatch(/github\.com/);
  });

  it('PromotionState has the 5-state lifecycle', () => {
    const s: PromotionState[] = [
      'personal-draft',
      'under-review',
      'published',
      'deprecated',
      'archived',
    ];
    expect(s).toHaveLength(5);
  });

  it('AssetPromotionRecord tags kind + both scopes', () => {
    const r: AssetPromotionRecord = {
      id: 'r1',
      assetKind: 'agent',
      assetId: 'a1',
      fromScope: { kind: 'drawer', userId: 'u1' },
      toScope: { kind: 'project', projectId: 'p1' },
      state: 'under-review',
      requestedBy: 'u1',
    };
    expect(r.fromScope.kind).toBe('drawer');
    expect(r.toScope.kind).toBe('project');
  });

  it('ResourceACL narrows to resourceKind', () => {
    const acl: ResourceACL = {
      resourceKind: 'agent',
      resourceId: 'a1',
      userId: 'u2',
      role: 'runner',
    };
    expect(acl.role).toBe('runner');
  });
});
