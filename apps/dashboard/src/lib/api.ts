import { API_BASE } from "./config";

export async function fetchAPI<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
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
