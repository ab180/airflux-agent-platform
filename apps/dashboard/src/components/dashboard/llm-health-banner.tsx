"use client";

import { useEffect, useState } from "react";

interface LLMHealth {
  available: boolean;
  healthy: boolean;
  source: string;
  verified: boolean;
  expired: boolean;
  hoursExpired?: number;
  hint?: string;
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

  // Only render when something is actionable. Unverified-but-present env
  // tokens show a softer warning; verified+expired creds show an error.
  if (!state) return null;
  if (state.healthy && state.verified) return null;
  if (state.healthy && !state.verified && !state.hint) return null;

  const severity = !state.healthy ? "error" : "warn";
  const palette =
    severity === "error"
      ? "border-red-500/40 bg-red-500/10 text-red-200"
      : "border-amber-500/40 bg-amber-500/10 text-amber-200";
  const label = severity === "error" ? "LLM 크레덴셜 문제" : "LLM 크레덴셜 알림";

  return (
    <div
      role={severity === "error" ? "alert" : "status"}
      className={`mb-4 flex flex-wrap items-start gap-2 rounded-md border ${palette} px-3 py-2 text-[12px]`}
    >
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
  );
}
