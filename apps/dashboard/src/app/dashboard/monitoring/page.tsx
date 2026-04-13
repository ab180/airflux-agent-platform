import Link from "next/link";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { fetchAPISafe } from "@/lib/api";

interface Metrics {
  totals: {
    requests: number;
    errors: number;
    errorRate: number;
    avgDuration: number;
    maxDuration: number;
    tokens: { input: number; output: number };
  };
  agentBreakdown: {
    agent: string;
    requests: number;
    errors: number;
    errorRate: number;
    avgDuration: number;
    maxDuration: number;
  }[];
  hourly: { hour: string; requests: number; errors: number }[];
  recentErrors: {
    agent: string;
    query: string;
    error: string;
    timestamp: string;
    durationMs: number;
  }[];
}

const FALLBACK: Metrics = {
  totals: { requests: 0, errors: 0, errorRate: 0, avgDuration: 0, maxDuration: 0, tokens: { input: 0, output: 0 } },
  agentBreakdown: [],
  hourly: [],
  recentErrors: [],
};

export default async function MonitoringPage() {
  const [data, costData] = await Promise.all([
    fetchAPISafe<Metrics>("/api/admin/monitoring/metrics", FALLBACK),
    fetchAPISafe<{ today: { costUsd: number } }>("/api/admin/cost", { today: { costUsd: 0 } }),
  ]);
  const { totals, agentBreakdown, hourly, recentErrors } = data;

  const totalTokens = totals.tokens.input + totals.tokens.output;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">모니터링</h1>
        <p className="text-[13px] text-muted-foreground">
          시스템 성능 및 에러 현황
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="전체 요청" value={totals.requests.toLocaleString()} detail="건" accent />
        <StatCard
          label="에러율"
          value={`${totals.errorRate}%`}
          detail={`${totals.errors}건 실패`}
        />
        <StatCard
          label="평균 응답시간"
          value={`${totals.avgDuration}ms`}
          detail={`최대 ${totals.maxDuration}ms`}
        />
        <StatCard
          label="비용 / 토큰"
          value={costData.today.costUsd > 0 ? `$${costData.today.costUsd.toFixed(4)}` : totalTokens > 0 ? totalTokens.toLocaleString() : "—"}
          detail={costData.today.costUsd > 0
            ? `${totalTokens.toLocaleString()} tokens`
            : totalTokens > 0
              ? `입력 ${totals.tokens.input.toLocaleString()} / 출력 ${totals.tokens.output.toLocaleString()}`
              : "LLM 미사용"}
        />
      </div>

      {/* Agent breakdown */}
      {agentBreakdown.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            에이전트별 현황
          </h2>
          <div className="overflow-hidden rounded-lg border border-border/50">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">에이전트</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">요청</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">에러율</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">평균 응답</th>
                  <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">최대 응답</th>
                </tr>
              </thead>
              <tbody>
                {agentBreakdown.map((a) => (
                  <tr key={a.agent} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px]">
                      <Link href={`/dashboard/logs?agent=${a.agent}`} className="hover:text-primary transition-colors">
                        {a.agent}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{a.requests}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono text-[12px] ${a.errorRate > 5 ? "text-red-400" : a.errorRate > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {a.errorRate}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{a.avgDuration}ms</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">{a.maxDuration}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hourly chart (text-based) */}
      {hourly.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            시간대별 요청 (24h)
          </h2>
          <div className="rounded-lg border border-border/50 p-4">
            <div className="flex items-end gap-1" style={{ height: 80 }}>
              {hourly.map((h) => {
                const maxReqs = Math.max(...hourly.map(x => x.requests), 1);
                const height = Math.max((h.requests / maxReqs) * 100, 4);
                return (
                  <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-sm ${h.errors > 0 ? "bg-red-400/60" : "bg-primary/40"}`}
                      style={{ height: `${height}%` }}
                      title={`${h.hour}시: ${h.requests}건 (에러 ${h.errors})`}
                      aria-label={`${h.hour}시: ${h.requests}건 요청, ${h.errors}건 에러`}
                    />
                    <span className="text-[9px] text-muted-foreground">{h.hour}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recent errors */}
      <div className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          최근 에러
        </h2>
        {recentErrors.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 px-4 py-3">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" role="status" aria-label="정상" />
            <span className="text-[12px] text-foreground/80">에러 없음</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentErrors.map((err, i) => (
              <div key={i} className="rounded-lg border border-border/50 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-[9px]">에러</Badge>
                    <Link
                      href={`/dashboard/logs?agent=${err.agent}&success=false`}
                      className="font-mono text-[11px] hover:text-foreground transition-colors"
                    >
                      {err.agent}
                    </Link>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(err.timestamp).toLocaleTimeString("ko-KR", { hour12: false })}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/logs?agent=${err.agent}&success=false`}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    로그 →
                  </Link>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground" title={err.query}>
                  {err.query}
                </p>
                <p className="mt-0.5 text-[11px] text-red-400/80">
                  {err.error || "Unknown error"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
