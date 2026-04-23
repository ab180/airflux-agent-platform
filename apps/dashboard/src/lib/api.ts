import { API_BASE } from "./config";

// In Docker, SSR runs inside the dashboard container where localhost:3000 is unreachable.
// API_URL (no NEXT_PUBLIC_ prefix) is only available server-side and points to the
// internal Docker service name (e.g. http://server:3000).
const SERVER_API_BASE =
  typeof window === "undefined"
    ? (process.env.API_URL ?? API_BASE)
    : API_BASE;

// Server-side SSR can read ADMIN_API_KEY (non-public) at runtime.
const SSR_ADMIN_KEY =
  typeof window === "undefined"
    ? (process.env.ADMIN_API_KEY ?? "airflux-local")
    : "airflux-local";

function adminHeaders(path: string): HeadersInit {
  if (!path.includes("/api/admin/")) return {};
  return { "x-admin-key": SSR_ADMIN_KEY };
}

export async function fetchAPI<T>(path: string): Promise<T> {
  const res = await fetch(`${SERVER_API_BASE}${path}`, {
    cache: "no-store",
    headers: adminHeaders(path),
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchAPISafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await fetchAPI<T>(path);
  } catch {
    return fallback;
  }
}

// ─── Types ────────────────────────────────────────────────────────

export interface AgentInfo {
  name: string;
  enabled: boolean;
  description?: string;
  model: string;
  skills: string[];
  tools: string[];
  schedule?: ScheduleInfo[];
  advisor?: { model: string; maxUses?: number } | null;
}

export interface ScheduleInfo {
  name: string;
  cron: string;
  question: string;
  channels: string[];
}

export interface SkillInfo {
  name: string;
  description: string;
  requiredTools: string[];
  guardrails: string[];
  usedBy: string[];
}

export interface ToolInfo {
  name: string;
  description: string;
  status: "active" | "planned";
}

export interface OverviewResponse {
  agents: {
    total: number;
    enabled: number;
    list: { name: string; requestsToday: number }[];
  };
  skills: { total: number };
  tools: { total: number };
  metrics: {
    requestsToday: number;
    errorRate: number;
    costToday: number;
    evalScore: number | null;
    latency: { p50: number; p95: number; p99: number };
  };
  feedback: { total: number; positiveRate: number };
  llm: { available: boolean; hint?: string };
  alerts: { type: string; message: string; time: string }[];
}

// ─── Collaboration primitives (v2) ────────────────────────────────

export type ProjectType = "code-repo" | "docs" | "objective";
export type ProjectVisibility = "private" | "internal" | "public";
export type ProjectRole = "maintainer" | "contributor" | "runner" | "viewer";
export type OrgRole = "admin" | "member" | "viewer";
export type PromotionState =
  | "personal-draft"
  | "under-review"
  | "published"
  | "deprecated"
  | "archived";

export interface WorkspaceProject {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  type: ProjectType;
  visibility: ProjectVisibility;
  createdAt: string;
  externalRef?: string;
}

export interface WorkspaceOrg {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  projects: WorkspaceProject[];
}

export interface WorkspaceDrawer {
  userId: string;
  createdAt: string;
}

export interface WorkspaceResponse {
  userId: string;
  runMode: "local" | "team";
  drawer: WorkspaceDrawer;
  orgs: WorkspaceOrg[];
}

export interface PromotionScope {
  kind: "drawer" | "project";
  userId?: string;
  projectId?: string;
}

export interface PromotionRecord {
  id: string;
  assetKind: "agent" | "skill" | "tool" | "prompt";
  assetId: string;
  fromScope: PromotionScope;
  toScope: PromotionScope;
  state: PromotionState;
  requestedBy: string;
  reviewedBy?: string;
  decidedAt?: string;
  notes?: string;
}
