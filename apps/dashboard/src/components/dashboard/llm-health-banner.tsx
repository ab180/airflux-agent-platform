"use client";

import { useEffect, useState } from "react";
import { formatTimeRemaining } from "@/lib/format";
import { SyncCopyButton } from "@/components/dashboard/sync-copy-button";

interface RateLimitWindow {
  status?: string;
  utilization?: number;
  resetAt?: number;
}
interface RateLimitState {
  fiveHour?: RateLimitWindow;
  sevenDay?: RateLimitWindow;
  observedAt?: number;
}
interface CodexAuth {
  available: boolean;
  source: string;
  accountId?: string;
  daysSinceRefresh?: number;
  hint?: string;
}
interface ClaudeThrottleState {
  reason: string;
  throttledAt: number;
  retryUntil: number;
  window?: "5h" | "7d";
}
interface LLMHealth {
  available: boolean;
  healthy: boolean;
  source: string;
  verified: boolean;
  expired: boolean;
  hoursExpired?: number;
  hint?: string;
  rateLimit?: RateLimitState | null;
  oauthUtilizationThreshold?: number;
  claudeUtilizationThreshold?: number;
  apiKeyFallbackAvailable?: boolean;
  codex?: CodexAuth;
  claudeThrottle?: ClaudeThrottleState | null;
}

interface HealthResponse {
  mode?: "local" | "production";
  llm?: LLMHealth;
}

/**
 * Banner that surfaces LLM credential problems at the top of every dashboard
 * page. Claude (Anthropic) and Codex (OpenAI/ChatGPT) are INDEPENDENT
 * providers — one being unhealthy doesn't mean the platform can't serve
 * requests, because the router steers away from the broken one. Render
 * each provider's state in its own row so the user never sees
 * "LLM 크레덴셜 문제" when only one side is broken.
 */
export function LLMHealthBanner() {
  const [state, setState] = useState<LLMHealth | null>(null);
  const [mode, setMode] = useState<"local" | "production" | undefined>(undefined);
  // `now` is captured by the same 30s tick that refreshes health, so all
  // time-dependent renders below stay pure (no Date.now() during render).
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/proxy/health", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as HealthResponse;
        if (cancelled) return;
        if (body.llm) setState(body.llm);
        if (body.mode) setMode(body.mode);
        setNow(Date.now());
      } catch {
        /* silent — banner is best-effort */
      }
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!state) return null;
  const fh = state.rateLimit?.fiveHour;
  const sd = state.rateLimit?.sevenDay;
  const observedAt = state.rateLimit?.observedAt ?? now;
  const codex = state.codex;
  const hasCodex = !!codex;
  const claudeThrottle = state.claudeThrottle;
  const claudeThrottleActive =
    !!claudeThrottle && claudeThrottle.retryUntil > now;
  const isLocal = mode === "local";

  // Per-provider health — independent evaluation.
  const claudeUnhealthy = !state.healthy;
  const claudeVerifiedHint = state.healthy && !state.verified && !!state.hint;
  const claudeIssue = claudeUnhealthy || claudeVerifiedHint;
  const codexIssue = !codex?.available;
  const bothBroken = claudeUnhealthy && codexIssue;
  const anyIssue = claudeIssue || codexIssue;

  // Quota bars come from response headers of past Claude calls (cached).
  // If the credential is currently expired/unhealthy, that snapshot is
  // stale — showing "23% 사용" next to "만료" implies the account is still
  // usable. Suppress the bars until a fresh credential lets us re-observe.
  const showQuota =
    !!(fh?.utilization !== undefined || sd?.utilization !== undefined)
    && !claudeUnhealthy;

  // Nothing actionable and no quota to show → don't render.
  if (!anyIssue && !showQuota && !claudeThrottleActive) return null;

  const severity: "error" | "warn" | "info" = bothBroken
    ? "error"
    : anyIssue || claudeThrottleActive
      ? "warn"
      : "info";
  const palette =
    severity === "error"
      ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200"
      : severity === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200"
        : "border-border/50 bg-muted/30 text-muted-foreground";
  const headerLabel = bothBroken
    ? "LLM 호출 불가 — 모든 provider 인증 실패"
    : claudeIssue && !codexIssue
      ? "Claude 인증 필요 · Codex로 라우팅 중"
      : codexIssue && !claudeIssue
        ? "Codex 인증 필요 · Claude로 라우팅 중"
        : claudeThrottleActive
          ? "Claude OAuth 일시 제한"
          : "LLM 상태";

  // Optional opt-in threshold (env-set). Undefined = availability-first mode,
  // router relies on real throttle signals instead of a percentage gate.
  const threshold = state.claudeUtilizationThreshold ?? state.oauthUtilizationThreshold;
  const fallbackReady = state.apiKeyFallbackAvailable === true;


  const policyNote =
    typeof threshold === "number"
      ? `임계값 ${Math.round(threshold * 100)}% · ${fallbackReady ? "초과 시 API 키로 자동 전환" : "API 키 미설정 — OAuth만 사용"}`
      : fallbackReady
        ? "프록시가 throttle 감지 시 API 키로 자동 전환"
        : "프록시가 throttle 감지 시 라우팅 중단 (API 키 미설정)";

  const claudeHintText =
    state.hint ||
    "ANTHROPIC_API_KEY 설정 또는 `claude login` 실행 후 서버 재시작.";
  const codexHintText =
    codex?.hint ||
    "codex login 실행 또는 .env에 OPENAI_API_KEY=sk-... 추가 후 서버 재시작.";

  // Friendly labels for the raw internal `source` strings — the banner is
  // user-facing, so `env:ANTHROPIC_AUTH_TOKEN` or `codex-chatgpt-oauth`
  // shouldn't leak through verbatim.
  function labelClaudeSource(raw: string): string {
    if (raw.startsWith("claude-max-oauth")) {
      return raw.includes("expired") ? "Claude Max · 만료" : "Claude Max · OAuth";
    }
    if (raw.startsWith("env:ANTHROPIC_API_KEY")) {
      return raw.includes("throttled") ? "Anthropic API Key · throttle 전환" : "Anthropic API Key";
    }
    if (raw === "env:ANTHROPIC_AUTH_TOKEN") return "Keychain 토큰 (env) · sync 필요";
    if (raw === "none") return "미설정";
    return raw;
  }
  function labelCodexSource(raw: string): string {
    if (raw === "codex-chatgpt-oauth") return "ChatGPT Codex · OAuth";
    if (raw === "openai-api-key") return "OpenAI API Key";
    if (raw === "none") return "미설정";
    return raw;
  }

  return (
    <div
      role={severity === "error" ? "alert" : "status"}
      className={`mb-4 rounded-md border ${palette} px-3 py-2 text-[12px]`}
    >
      {/* Header summary — reflects overall routing stance */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{headerLabel}</span>
      </div>

      {/* Claude row — always rendered so users see its independent state */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot ok={!claudeIssue} />
          <span className="font-mono text-[10px]">Claude</span>
        </span>
        <span className="font-mono text-[10px] opacity-70">
          {labelClaudeSource(state.source)}
        </span>
        {state.expired && typeof state.hoursExpired === "number" && (
          <span className="font-mono text-[10px] opacity-60">
            · {state.hoursExpired}h 전 만료
          </span>
        )}
        {claudeIssue && (
          <span className="flex-1 leading-relaxed opacity-90">{claudeHintText}</span>
        )}
        {claudeIssue && isLocal && <SyncCopyButton />}
      </div>

      {/* Codex row — symmetric with Claude, independent of Claude state */}
      {hasCodex && codex && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot ok={!codexIssue} />
            <span className="font-mono text-[10px]">Codex</span>
          </span>
          <span className="font-mono text-[10px] opacity-70">
            {labelCodexSource(codex.source)}
          </span>
          {typeof codex.daysSinceRefresh === "number" && (
            <span className="font-mono text-[10px] opacity-60">
              · {codex.daysSinceRefresh}일 전 갱신
            </span>
          )}
          {codexIssue && (
            <span className="flex-1 leading-relaxed opacity-90">{codexHintText}</span>
          )}
        </div>
      )}

      {/* Claude throttle (transient: in cool-down window) */}
      {claudeThrottleActive && claudeThrottle && (
        <div className="mt-2 border-t border-current/10 pt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] opacity-70">Claude 일시 제한</span>
          <span className="flex-1 leading-relaxed">
            {claudeThrottle.window ? `${claudeThrottle.window} 윈도우 ` : ""}
            throttle 감지 — 다음 요청부터 {fallbackReady ? "API 키 경로" : "Codex"}로 라우팅
          </span>
          {isLocal && (
            <span className="font-mono text-[10px] opacity-70">
              {formatTimeRemaining(claudeThrottle.retryUntil, now)}
            </span>
          )}
        </div>
      )}

      {/* Claude Max rate-limit bars + reset chip (local-only). Hidden
          when Claude credential is unhealthy — the snapshot would be
          stale and misleading. */}
      {showQuota && (
        <div className="mt-2 border-t border-current/10 pt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-[10px] opacity-70">Claude Max 쿼터</span>
          {fh?.utilization !== undefined && (
            <Bar
              label="5h"
              util={fh.utilization}
              resetAt={fh.resetAt}
              threshold={threshold}
              isLocal={isLocal}
              observedAt={observedAt}
            />
          )}
          {sd?.utilization !== undefined && (
            <Bar
              label="7d"
              util={sd.utilization}
              resetAt={sd.resetAt}
              threshold={threshold}
              isLocal={isLocal}
              observedAt={observedAt}
            />
          )}
          <span className="font-mono text-[10px] opacity-60">{policyNote}</span>
        </div>
      )}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
      aria-hidden
    />
  );
}

function Bar({
  label,
  util,
  resetAt,
  threshold,
  isLocal,
  observedAt,
}: {
  label: string;
  util: number;
  resetAt?: number;
  threshold: number | undefined;
  isLocal: boolean;
  observedAt: number;
}) {
  const pct = Math.min(100, Math.round(util * 100));
  const crossed = typeof threshold === "number" ? util >= threshold : pct >= 90;
  const color = crossed ? "bg-red-500/70" : pct >= 60 ? "bg-amber-500/70" : "bg-emerald-500/60";
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] opacity-70">{label}</span>
      <div className="relative h-1.5 w-24 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] opacity-80">{pct}%</span>
      {isLocal && typeof resetAt === "number" && (
        <span className="font-mono text-[10px] opacity-60">
          · {formatTimeRemaining(resetAt, observedAt)}
        </span>
      )}
    </div>
  );
}

