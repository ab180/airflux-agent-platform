import { describe, it, expect } from "vitest";
import { calculateCost, getDailyCostStats, recordCost, checkBudget } from "../llm/cost-tracker.js";
import { runVerificationGate, buildVerificationFeedback } from "../agents/verification.js";
import { getExecutionStats, startExecution, completeExecution, failExecution, getStaleExecutions } from "../store/execution-state.js";
import { recordSkillUsage, getSkillStats } from "../skills/skill-tracker.js";
import { extractAdvisorUsage, buildAdvisorToolDef, buildAdvisorSystemPrompt } from "../llm/advisor.js";

describe("Cost tracker (GSD-2 metrics ledger)", () => {
  it("calculates cost for default tier", () => {
    const cost = calculateCost("default", { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.1);
  });

  it("records cost and accumulates daily stats", () => {
    recordCost({ timestamp: new Date().toISOString(), agent: "test", model: "fast", inputTokens: 100, outputTokens: 50, durationMs: 10 });
    const stats = getDailyCostStats();
    expect(stats.inputTokens).toBeGreaterThan(0);
    expect(stats.costUsd).toBeGreaterThanOrEqual(0);
  });

  it("checkBudget returns null when under budget", () => {
    expect(checkBudget(1000)).toBeNull();
  });

  it("calculates different costs per tier", () => {
    const fast = calculateCost("fast", { inputTokens: 1000000, outputTokens: 0 });
    const powerful = calculateCost("powerful", { inputTokens: 1000000, outputTokens: 0 });
    expect(powerful).toBeGreaterThan(fast);
  });
});

describe("Advisor pattern (Claude Advisor tool)", () => {
  it("builds advisor tool definition", () => {
    const def = buildAdvisorToolDef({ model: "powerful", maxUses: 3, caching: true });
    expect(def.type).toBe("advisor_20260301");
    expect(def.name).toBe("advisor");
    expect(def.max_uses).toBe(3);
    expect(def.caching).toBeDefined();
  });

  it("builds advisor system prompt in Korean", () => {
    const prompt = buildAdvisorSystemPrompt();
    expect(prompt).toContain("advisor");
    expect(prompt).toContain("조언");
  });

  it("extracts advisor usage from iterations", () => {
    const usage = extractAdvisorUsage([
      { type: "message", input_tokens: 100, output_tokens: 50 },
      { type: "advisor_message", model: "claude-opus-4-6", input_tokens: 800, output_tokens: 1500 },
      { type: "message", input_tokens: 200, output_tokens: 300 },
    ]);
    expect(usage.advisorCalls).toBe(1);
    expect(usage.advisorTokens.input).toBe(800);
    expect(usage.advisorTokens.output).toBe(1500);
    expect(usage.executorTokens.input).toBe(300);
    expect(usage.executorTokens.output).toBe(350);
  });

  it("handles empty iterations", () => {
    const usage = extractAdvisorUsage([]);
    expect(usage.advisorCalls).toBe(0);
    expect(usage.advisorModel).toBeNull();
  });
});

describe("Verification gate (GSD-2 pattern)", () => {
  it("passes with echo", () => {
    const r = runVerificationGate(["echo ok"]);
    expect(r.allPassed).toBe(true);
    expect(r.results[0].passed).toBe(true);
  });

  it("fails with false command", () => {
    const r = runVerificationGate(["false"]);
    expect(r.allPassed).toBe(false);
  });

  it("empty commands = pass", () => {
    expect(runVerificationGate([]).allPassed).toBe(true);
  });

  it("builds feedback from failures", () => {
    const fb = buildVerificationFeedback([
      { passed: false, command: "npm test", output: "FAIL: 3 tests", durationMs: 100 },
      { passed: true, command: "npm lint", output: "ok", durationMs: 50 },
    ]);
    expect(fb).toContain("npm test");
    expect(fb).not.toContain("npm lint");
  });
});

describe("Execution state machine (GSD-2 pattern)", () => {
  it("tracks execution lifecycle", () => {
    const id = "test-exec-" + Date.now();
    startExecution(id, "echo-agent", "hello", "test-user", "api");
    completeExecution(id, 42);
    const stats = getExecutionStats();
    expect(stats.completed).toBeGreaterThan(0);
  });

  it("tracks failed executions", () => {
    const id = "test-fail-" + Date.now();
    startExecution(id, "echo-agent", "fail query", "test-user", "api");
    failExecution(id, "test error", 100);
    const stats = getExecutionStats();
    expect(stats.failed).toBeGreaterThan(0);
  });

  it("detects stale executions", () => {
    const stale = getStaleExecutions(10);
    expect(Array.isArray(stale)).toBe(true);
  });
});

describe("Crash recovery (GSD-2 pattern)", () => {
  it("recovers stale executions", async () => {
    const { recoverStaleExecutions } = await import("../store/execution-state.js");
    const recovered = recoverStaleExecutions(10);
    expect(typeof recovered).toBe("number");
  });
});

describe("Skill tracker (GSD-2 telemetry)", () => {
  it("records and retrieves skill stats", () => {
    recordSkillUsage("text-to-sql", "assistant-agent", true);
    recordSkillUsage("text-to-sql", "assistant-agent", false);
    const stats = getSkillStats();
    const sqlSkill = stats.find(s => s.skillName === "text-to-sql");
    expect(sqlSkill).toBeDefined();
    expect(sqlSkill!.totalUses).toBe(2);
    expect(sqlSkill!.successRate).toBe(50);
  });

  it("detects stale skills", async () => {
    const { getStalenessReport } = await import("../skills/skill-tracker.js");
    const stale = getStalenessReport(0);
    expect(Array.isArray(stale)).toBe(true);
  });
});
