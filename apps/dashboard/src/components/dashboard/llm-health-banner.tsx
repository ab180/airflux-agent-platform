"use client";

import { useEffect, useState } from "react";

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
  apiKeyFallbackAvailable?: boolean;
}

interface HealthResponse {
  llm?: LLMHealth;
}

/**
 * Banner that surfaces LLM credential problems at the top of every dashboard
 * page. The platform runs without login (AUTH_MODE=local) but still needs a
 * valid upstream LLM credential — users shouldn't have to guess why a query
 * returns "auth invalid". Polls /api/proxy/health every 30s.
 */
export function LLMHealthBanner() {
  const [state, setState] = useState<LLMHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/proxy/health", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as HealthResponse;
        if (!cancelled && body.llm) setState(body.llm);
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
  const hasQuotaInfo = !!(fh?.utilization !== undefined || sd?.utilization !== undefined);
  const credentialIssue = !state.healthy || (state.healthy && !state.verified && !!state.hint);

  // Nothing actionable and no quota to show → don't render anything.
  if (!credentialIssue && !hasQuotaInfo) return null;

  // Severity of the credential issue (ignored when there isn't one).
  const severity = !state.healthy ? "error" : credentialIssue ? "warn" : "info";
  const palette =
    severity === "error"
      ? "border-red-500/40 bg-red-500/10 text-red-200"
      : severity === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-border/50 bg-muted/30 text-muted-foreground";
  const label =
    severity === "error" ? "LLM 크레덴셜 문제" : severity === "warn" ? "LLM 크레덴셜 알림" : "LLM 상태";

  const threshold = state.oauthUtilizationThreshold ?? 0.8;
  const fallbackReady = state.apiKeyFallbackAvailable === true;

  function Bar({ label, util }: { label: string; util: number }) {
    const pct = Math.min(100, Math.round(util * 100));
    const crossed = util >= threshold;
    const color = crossed ? "bg-red-500/70" : pct >= 60 ? "bg-amber-500/70" : "bg-emerald-500/60";
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] opacity-70">{label}</span>
        <div className="relative h-1.5 w-24 rounded-full bg-muted/50 overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[10px] opacity-80">{pct}%</span>
      </div>
    );
  }

  return (
    <div
      role={severity === "error" ? "alert" : "status"}
      className={`mb-4 rounded-md border ${palette} px-3 py-2 text-[12px]`}
    >
      {credentialIssue && (
        <div className="flex flex-wrap items-start gap-2">
          <span className="font-semibold">{label}</span>
          <span className="flex-1 leading-relaxed">
            {state.hint ||
              "LLM 호출이 실패할 수 있습니다. ANTHROPIC_API_KEY를 설정하거나 `claude login`을 실행한 뒤 서버를 재시작하세요."}
          </span>
          <span className="font-mono text-[10px] opacity-70">
            source: {state.source}
            {state.expired && typeof state.hoursExpired === "number"
              ? ` · expired ${state.hoursExpired}h ago`
              : ""}
          </span>
        </div>
      )}
      {hasQuotaInfo && (
        <div className={`${credentialIssue ? "mt-2 border-t border-current/10 pt-2" : ""} flex flex-wrap items-center gap-x-4 gap-y-1`}>
          <span className="font-mono text-[10px] opacity-70">Claude Max 쿼터</span>
          {fh?.utilization !== undefined && <Bar label="5h" util={fh.utilization} />}
          {sd?.utilization !== undefined && <Bar label="7d" util={sd.utilization} />}
          <span className="font-mono text-[10px] opacity-60">
            임계값 {Math.round(threshold * 100)}% ·{" "}
            {fallbackReady ? "초과 시 API 키로 자동 전환" : "API 키 미설정 — OAuth만 사용"}
          </span>
        </div>
      )}
    </div>
  );
}
