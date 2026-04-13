import Link from "next/link";
import { fetchAPISafe } from "@/lib/api";

interface LogEntry {
  id: string;
  timestamp: string;
  agent: string;
  query: string;
  userId: string;
  source: string;
  success: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const agentFilter = sp.agent || "";
  const successFilter = sp.success || "";

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (agentFilter) params.set("agent", agentFilter);
  if (successFilter) params.set("success", successFilter);

  const { logs, total } = await fetchAPISafe<{
    logs: LogEntry[];
    total: number;
  }>(`/api/admin/logs?${params}`, { logs: [], total: 0 });

  const hasFilters = agentFilter || successFilter;
  const filterLabel = [
    agentFilter && `${agentFilter} 에이전트`,
    successFilter === "false" && "에러만",
    successFilter === "true" && "성공만",
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">로그</h1>
          <p className="text-[13px] text-muted-foreground">
            {filterLabel
              ? `${filterLabel} — ${total}개 기록`
              : `${total}개 요청 기록`}
          </p>
        </div>
        {hasFilters && (
          <Link
            href="/dashboard/logs"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            필터 초기화
          </Link>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16">
          <h3 className="text-[13px] font-medium">로그 없음</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            에이전트에 질문을 보내면 여기에 기록됩니다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/50">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  시간
                </th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  에이전트
                </th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  질문
                </th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  사용자
                </th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  상태
                </th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  응답시간
                </th>
                <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  토큰
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const time = new Date(log.timestamp);
                const timeStr = time.toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                });

                return (
                  <tr
                    key={log.id}
                    className="border-b border-border/30 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {timeStr}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">
                      {log.agent}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-[12px] text-muted-foreground" title={log.query}>
                      {log.query}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {log.userId}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 text-[10px] font-medium ${
                          log.success
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                        aria-label={log.success ? "성공" : "에러"}
                      >
                        {log.success ? "200" : "ERR"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {log.durationMs}ms
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                      {log.inputTokens || log.outputTokens
                        ? `${(log.inputTokens || 0) + (log.outputTokens || 0)}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
