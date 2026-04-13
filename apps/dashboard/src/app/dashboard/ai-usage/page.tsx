import { StatCard } from "@/components/dashboard/stat-card";
import { fetchAPISafe } from "@/lib/api";

interface CostData {
  today: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    date: string;
  };
  pricing: Record<string, { input: number; output: number; unit: string }>;
}

interface ExecStats {
  running: number;
  completed: number;
  failed: number;
  stale: number;
}

interface SkillStat {
  skillName: string;
  totalUses: number;
  successCount: number;
  successRate: number;
  lastUsed: string;
  agents: string[];
}

interface AgentBreakdown {
  agent: string;
  requests: number;
  errors: number;
  errorRate: number;
  avgDuration: number;
}

interface DailyStat {
  date: string;
  agent: string;
  requests: number;
  errors: number;
  avgDurationMs: number;
}

export default async function AIUsagePage() {
  const [cost, execStats, skillData, metrics, dailyData] = await Promise.all([
    fetchAPISafe<CostData>("/api/admin/cost", {
      today: { costUsd: 0, inputTokens: 0, outputTokens: 0, date: "" },
      pricing: {},
    }),
    fetchAPISafe<ExecStats>("/api/admin/executions/stats", {
      running: 0, completed: 0, failed: 0, stale: 0,
    }),
    fetchAPISafe<{ stats: SkillStat[]; stale: { skillName: string; daysSinceLastUse: number }[] }>(
      "/api/admin/skills/stats", { stats: [], stale: [] }
    ),
    fetchAPISafe<{ agentBreakdown: AgentBreakdown[] }>(
      "/api/admin/monitoring/metrics", { agentBreakdown: [] }
    ),
    fetchAPISafe<{ stats: DailyStat[] }>(
      "/api/admin/stats/daily?days=7", { stats: [] }
    ),
  ]);

  // Aggregate daily stats by date for chart
  const dailyByDate = new Map<string, { requests: number; errors: number }>();
  for (const s of dailyData.stats) {
    const existing = dailyByDate.get(s.date) || { requests: 0, errors: 0 };
    existing.requests += s.requests;
    existing.errors += s.errors;
    dailyByDate.set(s.date, existing);
  }
  const dailyChart = Array.from(dailyByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date: date.slice(5), requests: d.requests, errors: d.errors }));

  const totalTokens = cost.today.inputTokens + cost.today.outputTokens;
  const totalExecs = execStats.completed + execStats.failed;
  const successRate = totalExecs > 0
    ? Math.round((execStats.completed / totalExecs) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">AI 사용 현황</h1>
        <p className="text-[13px] text-muted-foreground">
          비용, 토큰, 실행 상태, 스킬 사용 통합 모니터링
        </p>
      </div>

      {/* Cost overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="오늘 비용"
          value={`$${cost.today.costUsd.toFixed(4)}`}
          detail={cost.today.date}
          accent={cost.today.costUsd > 0}
          size="lg"
        />
        <StatCard
          label="총 토큰"
          value={totalTokens > 0 ? totalTokens.toLocaleString() : "—"}
          detail={totalTokens > 0 ? `입력 ${cost.today.inputTokens.toLocaleString()} / 출력 ${cost.today.outputTokens.toLocaleString()}` : "사용 없음"}
          size="lg"
        />
        <StatCard
          label="실행 성공률"
          value={totalExecs > 0 ? `${successRate}%` : "—"}
          detail={`${execStats.completed} 성공 / ${execStats.failed} 실패`}
          accent={successRate >= 90}
          size="lg"
        />
        <StatCard
          label="현재 실행 중"
          value={String(execStats.running)}
          detail={execStats.stale > 0 ? `${execStats.stale}개 응답 없음` : "정상"}
          size="lg"
        />
      </div>

      {/* Getting started hint when no LLM usage */}
      {totalTokens === 0 && totalExecs === 0 && (
        <div className="rounded-lg border border-dashed border-border/50 px-4 py-6 text-center">
          <p className="text-[13px] font-medium">아직 AI 사용 기록이 없습니다</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            플레이그라운드에서 assistant-agent에 질문하면 비용과 토큰 사용량이 여기에 표시됩니다.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            echo-agent는 LLM을 사용하지 않으므로 비용이 발생하지 않습니다.
          </p>
        </div>
      )}

      {/* Token breakdown chart */}
      {totalTokens > 0 && (
        <section className="space-y-2" aria-label="토큰 사용 비율">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            토큰 사용 비율
          </h2>
          <div className="rounded-lg border border-border/50 p-4">
            <div className="flex h-6 overflow-hidden rounded-full">
              <div
                className="bg-primary/60 transition-all"
                style={{ width: `${totalTokens > 0 ? Math.round((cost.today.inputTokens / totalTokens) * 100) : 0}%` }}
                title={`입력: ${cost.today.inputTokens.toLocaleString()} tokens`}
                aria-label={`입력 토큰 ${Math.round((cost.today.inputTokens / totalTokens) * 100)}%`}
              />
              <div
                className="bg-amber-400/60 transition-all"
                style={{ width: `${totalTokens > 0 ? Math.round((cost.today.outputTokens / totalTokens) * 100) : 0}%` }}
                title={`출력: ${cost.today.outputTokens.toLocaleString()} tokens`}
                aria-label={`출력 토큰 ${Math.round((cost.today.outputTokens / totalTokens) * 100)}%`}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-primary/60" />
                입력 {cost.today.inputTokens.toLocaleString()} ({totalTokens > 0 ? Math.round((cost.today.inputTokens / totalTokens) * 100) : 0}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400/60" />
                출력 {cost.today.outputTokens.toLocaleString()} ({totalTokens > 0 ? Math.round((cost.today.outputTokens / totalTokens) * 100) : 0}%)
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Daily requests trend (7 days) */}
      {dailyChart.length > 0 && (
        <section className="space-y-2" aria-label="일별 요청 추이">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            일별 요청 추이 (7일)
          </h2>
          <div className="rounded-lg border border-border/50 p-4">
            <div className="flex items-end gap-1" style={{ height: 80 }}>
              {dailyChart.map((d) => {
                const maxReqs = Math.max(...dailyChart.map(x => x.requests), 1);
                const height = Math.max((d.requests / maxReqs) * 100, 4);
                const errorPct = d.requests > 0 ? Math.round((d.errors / d.requests) * 100) : 0;
                return (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-sm ${d.errors > 0 ? "bg-red-400/40" : "bg-primary/40"}`}
                      style={{ height: `${height}%` }}
                      title={`${d.date}: ${d.requests}건 (에러 ${d.errors}, ${errorPct}%)`}
                      aria-label={`${d.date}: ${d.requests}건 요청`}
                    />
                    <span className="text-[9px] text-muted-foreground">{d.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Agent cost breakdown */}
      {metrics.agentBreakdown.length > 0 && (
        <section className="space-y-2" aria-label="에이전트별 사용량">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            에이전트별 사용량
          </h2>
          <div className="overflow-hidden rounded-lg border border-border/50">
            <table className="w-full text-left" role="table">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">에이전트</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">요청</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">에러율</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">평균 응답</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxReqs = Math.max(...metrics.agentBreakdown.map(a => a.requests), 1);
                  return metrics.agentBreakdown.map((a) => (
                    <tr key={a.agent} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-[12px]">{a.agent}</div>
                        <div className="mt-1 h-1 w-full rounded-full bg-muted/30">
                          <div
                            className="h-1 rounded-full bg-primary/50"
                            style={{ width: `${Math.round((a.requests / maxReqs) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px]">{a.requests}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-[12px] ${a.errorRate > 5 ? "text-red-400" : a.errorRate > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                          {a.errorRate}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{a.avgDuration}ms</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Execution state distribution */}
      <section className="space-y-2" aria-label="실행 상태 분포">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          실행 상태 분포
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/50 px-4 py-3 text-center">
            <div className="text-2xl font-mono font-semibold text-emerald-400">{execStats.completed}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">완료</div>
          </div>
          <div className="rounded-lg border border-border/50 px-4 py-3 text-center">
            <div className="text-2xl font-mono font-semibold text-red-400">{execStats.failed}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">실패</div>
          </div>
          <div className="rounded-lg border border-border/50 px-4 py-3 text-center">
            <div className="text-2xl font-mono font-semibold text-sky-400">{execStats.running}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">실행 중</div>
          </div>
          <div className="rounded-lg border border-border/50 px-4 py-3 text-center">
            <div className={`text-2xl font-mono font-semibold ${execStats.stale > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{execStats.stale}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">응답 없음</div>
          </div>
        </div>
      </section>

      {/* Skill usage */}
      {skillData.stats.length > 0 && (
        <section className="space-y-2" aria-label="스킬 사용 통계">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            스킬 사용 통계
          </h2>
          <div className="space-y-1.5">
            {skillData.stats.map((s) => (
              <div key={s.skillName} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[12px] font-medium">{s.skillName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {s.totalUses}회 사용
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-[12px] ${s.successRate >= 80 ? "text-emerald-400" : s.successRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
                    성공률 {s.successRate}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {s.agents.join(", ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Model pricing reference */}
      <section className="space-y-2" aria-label="모델 가격표">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          모델 가격표 (USD / 1M 토큰)
        </h2>
        <div className="overflow-hidden rounded-lg border border-border/50">
          <table className="w-full text-left" role="table">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">티어</th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">입력</th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">출력</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(cost.pricing).map(([tier, p]) => (
                <tr key={tier} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-[12px] font-medium">{tier}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">${p.input}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">${p.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
