import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fetchAPISafe } from "@/lib/api";

interface FeedbackEntry {
  id: string;
  traceId: string;
  rating: "positive" | "negative";
  comment: string | null;
  userId: string;
  agent: string;
  timestamp: string;
}

export default async function FeedbackPage() {
  const { feedback, total } = await fetchAPISafe<{
    feedback: FeedbackEntry[];
    total: number;
  }>("/api/admin/feedback?limit=100", { feedback: [], total: 0 });

  const positive = feedback.filter((f) => f.rating === "positive").length;
  const negative = feedback.filter((f) => f.rating === "negative").length;

  // Agent-level breakdown
  const agentMap = new Map<string, { pos: number; neg: number }>();
  for (const fb of feedback) {
    const a = agentMap.get(fb.agent) || { pos: 0, neg: 0 };
    if (fb.rating === "positive") a.pos++;
    else a.neg++;
    agentMap.set(fb.agent, a);
  }
  const agentStats = Array.from(agentMap.entries())
    .map(([agent, s]) => ({ agent, total: s.pos + s.neg, positiveRate: Math.round((s.pos / (s.pos + s.neg)) * 100) }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">피드백</h1>
        <p className="text-[13px] text-muted-foreground">
          사용자 응답 만족도 ({total}건)
        </p>
      </div>

      {/* Summary stats */}
      {total > 0 && (
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400" aria-label="긍정">+</span>
            <span className="font-mono text-[12px] font-medium">{positive}</span>
            <span className="text-[12px] text-muted-foreground">긍정</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400" aria-label="부정">-</span>
            <span className="font-mono text-[12px] font-medium">{negative}</span>
            <span className="text-[12px] text-muted-foreground">부정</span>
          </div>
          <div className="text-[12px] text-muted-foreground">
            긍정률:{" "}
            <span className="font-mono font-medium text-foreground">
              {total > 0 ? Math.round((positive / total) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* Per-agent satisfaction */}
      {agentStats.length > 1 && (
        <div className="space-y-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            에이전트별 만족도
          </h2>
          <div className="flex flex-wrap gap-3">
            {agentStats.map((a) => (
              <div key={a.agent} className="rounded-lg border border-border/50 px-3 py-2 min-w-[120px]">
                <div className="font-mono text-[11px] text-muted-foreground">{a.agent}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className={`font-mono text-[14px] font-semibold ${a.positiveRate >= 80 ? "text-emerald-400" : a.positiveRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
                    {a.positiveRate}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">{a.total}건</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {feedback.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16">
          <h3 className="text-[13px] font-medium">피드백 없음</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            플레이그라운드에서 에이전트 응답에 피드백을 남기면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {feedback.map((fb) => {
            const time = new Date(fb.timestamp);
            const timeStr = time.toLocaleString("ko-KR", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });

            return (
              <div
                key={fb.id}
                className="flex items-start gap-3 rounded-lg border border-border/50 px-4 py-3"
              >
                <div className="mt-0.5 shrink-0">
                  {fb.rating === "positive" ? (
                    <span className="text-[12px] text-emerald-400" title="긍정" aria-label="긍정 피드백">+</span>
                  ) : (
                    <span className="text-[12px] text-red-400" title="부정" aria-label="부정 피드백">-</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={fb.rating === "positive" ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {fb.rating === "positive" ? "긍정" : "부정"}
                    </Badge>
                    <Link
                      href={`/dashboard/logs?agent=${fb.agent}`}
                      className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {fb.agent}
                    </Link>
                    <span className="text-[11px] text-muted-foreground">
                      {timeStr}
                    </span>
                  </div>
                  {fb.comment && (
                    <p className="mt-1 text-[12px] text-foreground/80">
                      {fb.comment}
                    </p>
                  )}
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                    trace:{" "}
                    <Link
                      href={`/dashboard/logs?agent=${fb.agent}`}
                      className="hover:text-foreground transition-colors"
                      title={fb.traceId}
                    >
                      {fb.traceId.slice(0, 8)}...
                    </Link>
                    {" | user: "}{fb.userId}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
