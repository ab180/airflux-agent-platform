/**
 * Skill usage tracker (GSD-2 skill telemetry pattern).
 * Tracks which skills are used per agent, success rates, and staleness.
 */

import { logger } from '../lib/logger.js';

interface SkillUsageEntry {
  skillName: string;
  agentName: string;
  timestamp: string;
  success: boolean;
}

interface SkillStats {
  skillName: string;
  totalUses: number;
  successCount: number;
  successRate: number;
  lastUsed: string;
  agents: string[];
}

const usageLog: SkillUsageEntry[] = [];

/** Record a skill being used in an agent execution. */
export function recordSkillUsage(skillName: string, agentName: string, success: boolean): void {
  usageLog.push({
    skillName,
    agentName,
    timestamp: new Date().toISOString(),
    success,
  });
}

/** Get aggregated stats for all skills. */
export function getSkillStats(): SkillStats[] {
  const statsMap = new Map<string, { total: number; success: number; lastUsed: string; agents: Set<string> }>();

  for (const entry of usageLog) {
    let stat = statsMap.get(entry.skillName);
    if (!stat) {
      stat = { total: 0, success: 0, lastUsed: '', agents: new Set() };
      statsMap.set(entry.skillName, stat);
    }
    stat.total++;
    if (entry.success) stat.success++;
    stat.lastUsed = entry.timestamp;
    stat.agents.add(entry.agentName);
  }

  return Array.from(statsMap.entries()).map(([name, s]) => ({
    skillName: name,
    totalUses: s.total,
    successCount: s.success,
    successRate: s.total > 0 ? Math.round((s.success / s.total) * 100) : 0,
    lastUsed: s.lastUsed,
    agents: Array.from(s.agents),
  }));
}

/** Detect skills that haven't been used in N days (staleness check). */
export function getStalenessReport(stalenessDays: number = 7): { skillName: string; daysSinceLastUse: number }[] {
  const now = Date.now();
  const stats = getSkillStats();
  const stale: { skillName: string; daysSinceLastUse: number }[] = [];

  for (const s of stats) {
    const lastUsedMs = new Date(s.lastUsed).getTime();
    const daysSince = Math.floor((now - lastUsedMs) / (1000 * 60 * 60 * 24));
    if (daysSince >= stalenessDays) {
      stale.push({ skillName: s.skillName, daysSinceLastUse: daysSince });
    }
  }

  return stale;
}
