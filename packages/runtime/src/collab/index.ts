/**
 * Collaboration primitives — team-operated agent workspace model.
 *
 * This module owns the type shape only. Storage adapters (SQLite for
 * local, Postgres for team) live under ../storage/adapters/ and must
 * satisfy the interfaces below.
 *
 * See docs/superpowers/specs/2026-04-23-airops-platform-vision.md for
 * the full v2 design (Rounds 26-34 covering project types, promotion,
 * RBAC, mode split).
 */

export type ProjectType = 'code-repo' | 'docs' | 'objective';

export type ProjectVisibility = 'private' | 'internal' | 'public';

/**
 * Five-role model per Round 29. `runner` can execute but not edit;
 * `contributor` can propose changes that `maintainer` must approve.
 */
export type ProjectRole =
  | 'maintainer'
  | 'contributor'
  | 'runner'
  | 'viewer';

export type OrgRole = 'admin' | 'member' | 'viewer';

export interface Org {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface OrgMembership {
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: string;
}

export interface Project {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  type: ProjectType;
  visibility: ProjectVisibility;
  createdAt: string;
  /** Optional external binding — GitHub repo URL, Notion space id, Linear project id, etc. */
  externalRef?: string;
}

export interface ProjectMembership {
  projectId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: string;
}

/**
 * Personal drawer — every user gets one on first login. Assets can be
 * promoted from drawer → project under-review → project published.
 */
export interface PersonalDrawer {
  userId: string;
  createdAt: string;
}

export type PromotionState =
  | 'personal-draft'
  | 'under-review'
  | 'published'
  | 'deprecated'
  | 'archived';

/**
 * Generic metadata envelope for any promotable asset (agent, skill, tool,
 * prompt). The concrete asset kind + id is referenced by the adapter.
 */
export interface AssetPromotionRecord {
  id: string;
  assetKind: 'agent' | 'skill' | 'tool' | 'prompt';
  assetId: string;
  fromScope: { kind: 'drawer'; userId: string } | { kind: 'project'; projectId: string };
  toScope: { kind: 'drawer'; userId: string } | { kind: 'project'; projectId: string };
  state: PromotionState;
  requestedBy: string;
  reviewedBy?: string;
  decidedAt?: string;
  notes?: string;
}

/**
 * Per-resource ACL override — attaches to a specific agent/skill/tool/prompt
 * and overrides the project-level role default.
 */
export interface ResourceACL {
  resourceKind: 'agent' | 'skill' | 'tool' | 'prompt';
  resourceId: string;
  userId: string;
  role: ProjectRole;
}

// ---- Store interfaces ----

export interface OrgStore {
  createOrg(input: Omit<Org, 'id' | 'createdAt'>): Promise<Org>;
  getOrg(id: string): Promise<Org | null>;
  listOrgsForUser(userId: string): Promise<Org[]>;
}

export interface ProjectStore {
  createProject(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(orgId: string): Promise<Project[]>;
}

export interface MembershipStore {
  addOrgMember(m: Omit<OrgMembership, 'joinedAt'>): Promise<void>;
  updateOrgMemberRole(
    orgId: string,
    userId: string,
    role: OrgRole,
  ): Promise<boolean>;
  removeOrgMember(orgId: string, userId: string): Promise<boolean>;
  listOrgMembers(orgId: string): Promise<OrgMembership[]>;
  userRoleInOrg(userId: string, orgId: string): Promise<OrgRole | null>;

  addProjectMember(m: Omit<ProjectMembership, 'joinedAt'>): Promise<void>;
  updateProjectMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<boolean>;
  removeProjectMember(projectId: string, userId: string): Promise<boolean>;
  listProjectMembers(projectId: string): Promise<ProjectMembership[]>;
  userRoleInProject(userId: string, projectId: string): Promise<ProjectRole | null>;
}

export interface DrawerStore {
  ensureDrawer(userId: string): Promise<PersonalDrawer>;
}

export interface PromotionStore {
  request(
    input: Omit<AssetPromotionRecord, 'id' | 'state' | 'decidedAt' | 'reviewedBy'>,
  ): Promise<AssetPromotionRecord>;
  approve(id: string, reviewer: string, notes?: string): Promise<AssetPromotionRecord>;
  reject(id: string, reviewer: string, notes?: string): Promise<AssetPromotionRecord>;
  listPending(projectId: string): Promise<AssetPromotionRecord[]>;
}

/**
 * Project-scoped asset registry — tracks which agents/skills/tools/prompts
 * have been published into each project via promotion approval. The actual
 * asset config still lives wherever its kind-specific loader reads from
 * (markdown, YAML, registry). This table records the *membership* so the
 * dashboard can render "which assets is this project running?" and later
 * enforcement can gate scoped execution.
 */
export interface ProjectAsset {
  projectId: string;
  assetKind: 'agent' | 'skill' | 'tool' | 'prompt';
  assetId: string;
  promotedFromDrawer: string;
  promotionId: string;
  publishedAt: string;
}

export interface ProjectAssetStore {
  publish(input: Omit<ProjectAsset, 'publishedAt'>): Promise<ProjectAsset>;
  list(projectId: string): Promise<ProjectAsset[]>;
  unpublish(projectId: string, assetKind: ProjectAsset['assetKind'], assetId: string): Promise<boolean>;
}

export interface ACLStore {
  set(acl: ResourceACL): Promise<void>;
  remove(acl: Omit<ResourceACL, 'role'>): Promise<void>;
  listForResource(
    kind: ResourceACL['resourceKind'],
    id: string,
  ): Promise<ResourceACL[]>;
}
