import Link from "next/link";
import { StatCard } from "@/components/dashboard/stat-card";
import { AgentUsageBar } from "@/components/dashboard/agent-usage-bar";
import { fetchAPISafe, type OverviewResponse } from "@/lib/api";

const FALLBACK_OVERVIEW: OverviewResponse = {
  agents: { total: 0, enabled: 0, list: [] },
  skills: { total: 0 },
  tools: { total: 0 },
  metrics: {
    requestsToday: 0,
    errorRate: 0,
    costToday: 0,
    evalScore: null,
    latency: { p50: 0, p95: 0, p99: 0 },
  },
  feedback: { total: 0, positiveRate: 0 },
  llm: { available: false },
  alerts: [],
};

export default async function DashboardOverview() {
  const data = await fetchAPISafe<OverviewResponse>(
    "/api/admin/overview",
    FALLBACK_OVERVIEW
  );

  const { agents, skills, tools, metrics, feedback, llm } = data;

  // Fetch execution state (GSD-2 state machine)
  const execStats = await fetchAPISafe<{ running: number; completed: number; failed: number; stale: number }>(
    "/api/admin/executions/stats",
    { running: 0, completed: 0, failed: 0, stale: 0 }
  );

  const usage = agents.list.length > 0
    ? agents.list.map((a) => ({
        name: a.name,
        requests: a.requestsToday,
        percentage: agents.list.length === 1 ? 100 : Math.round(
          (a.requestsToday / Math.max(metrics.requestsToday, 1)) * 100
        ),
      }))
    : [{ name: "에이전트 없음", requests: 0, percentage: 100 }];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">현황</h1>
        <p className="text-[13px] text-muted-foreground">
          플랫폼 전체 상태 요약
        </p>
      </div>

      {/* Primary metric - larger, prominent */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="오늘 요청"
          value={metrics.requestsToday.toLocaleString()}
          detail="건"
          accent
          size="lg"
        />
        <StatCard
          label="에러율"
          value={metrics.errorRate > 0 ? `${metrics.errorRate}%` : "0%"}
          detail="최근 24시간"
          size="lg"
        />
        <Link href="/dashboard/ai-usage" className="block">
          <StatCard
            label="비용"
            value={metrics.costToday > 0 ? `$${metrics.costToday.toFixed(4)}` : "$0"}
            detail="오늘 · 상세 보기 →"
            size="lg"
          />
        </Link>
      </div>

      {/* Secondary metrics - compact */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="에이전트"
          value={`${agents.enabled}/${agents.total}`}
          detail="활성/전체"
        />
        <Link href="/dashboard/evaluation" className="block">
          <StatCard
            label="평가 점수"
            value={metrics.evalScore !== null ? `${metrics.evalScore}%` : "—"}
            detail={metrics.evalScore !== null ? "최근 결과 →" : "미실행"}
            accent={metrics.evalScore !== null && metrics.evalScore >= 90}
          />
        </Link>
        <Link href="/dashboard/feedback" className="block">
          <StatCard
            label="피드백"
            value={feedback.total > 0 ? `${feedback.positiveRate}%` : "—"}
            detail={feedback.total > 0 ? `긍정률 (${feedback.total}건) →` : "피드백 없음"}
          />
        </Link>
        <StatCard
          label="응답시간"
          value={metrics.latency.p95 > 0 ? `${metrics.latency.p95}ms` : "—"}
          detail="p95 백분위"
        />
      </div>

      {/* Two-column: usage + status */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            에이전트 사용량
          </h2>
          <div className="rounded-lg border border-border/50 p-4">
            <AgentUsageBar agents={usage} />
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            시스템 상태
          </h2>
          <div className="space-y-2">
            {data.alerts.length > 0 ? (
              data.alerts.map((alert, i) => (
                <AlertItem key={i} alert={alert} />
              ))
            ) : (
              <div className="flex items-center gap-2.5 rounded-lg border border-border/50 px-3.5 py-2.5">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" role="status" aria-label="정상" />
                <p className="text-[12px] text-foreground/90">
                  모든 시스템 정상 동작 중
                </p>
              </div>
            )}

            {!llm.available && (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" role="status" aria-label="경고" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-amber-200">
                    LLM 연결 안 됨
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {llm.hint || 'ANTHROPIC_API_KEY 설정 또는 `claude login` 필요'}
                  </p>
                </div>
              </div>
            )}

            {execStats.stale > 0 && (
              <div className="flex items-center gap-2.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3.5 py-2.5">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" role="status" aria-label="경고" />
                <p className="text-[12px] text-red-200">
                  {execStats.stale}개 실행이 응답 없음 (크래시 의심)
                </p>
              </div>
            )}

            <div className="flex items-center gap-2.5 rounded-lg border border-border/50 px-3.5 py-2.5">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" role="status" aria-label="정보" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-foreground/90">
                  Phase 0 — 로컬 개발 모드
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {agents.enabled}개 에이전트, {skills.total}개 스킬, {tools.total}개 도구 로드됨
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertItem({ alert }: { alert: { type: string; message: string; time: string } }) {
  const dotColor =
    alert.type === "success" ? "bg-emerald-500" :
    alert.type === "warning" ? "bg-amber-400" :
    "bg-sky-400";

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/50 px-3.5 py-2.5">
      <div className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] leading-relaxed text-foreground/90">{alert.message}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{alert.time}</p>
      </div>
    </div>
  );
}
