import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/dashboard/stat-card";
import { AgentToggle } from "@/components/dashboard/agent-toggle";
import { fetchAPI, fetchAPISafe, type AgentInfo } from "@/lib/api";
import Link from "next/link";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;

  let agent: AgentInfo;
  try {
    const data = await fetchAPI<{ agent: AgentInfo }>(
      `/api/admin/agents/${name}`
    );
    agent = data.agent;
  } catch {
    notFound();
  }

  // Fetch agent-specific metrics
  const metrics = await fetchAPISafe<{
    agentBreakdown: { agent: string; requests: number; errors: number; errorRate: number; avgDuration: number }[];
  }>("/api/admin/monitoring/metrics", { agentBreakdown: [] });
  const agentMetrics = metrics.agentBreakdown.find(a => a.agent === name);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/agents"
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              에이전트
            </Link>
            <span className="text-[12px] text-muted-foreground">/</span>
          </div>
          <h1 className="mt-1 flex items-center gap-3 font-mono text-lg font-semibold tracking-tight">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                agent.enabled ? "bg-emerald-500" : "bg-zinc-600"
              }`}
              role="status"
              aria-label={agent.enabled ? "활성" : "비활성"}
            />
            {agent.name}
          </h1>
          {agent.description && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {agent.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AgentToggle name={agent.name} enabled={agent.enabled} />
          <Link href={`/dashboard/playground?agent=${agent.name}`}>
            <Button variant="outline" size="sm" className="h-8 text-[12px]">
              테스트
            </Button>
          </Link>
        </div>
      </div>

      <Separator />

      {/* Agent metrics */}
      {agentMetrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="요청"
            value={String(agentMetrics.requests)}
            detail="전체"
            accent
          />
          <StatCard
            label="에러율"
            value={`${agentMetrics.errorRate}%`}
            detail={`${agentMetrics.errors}건 실패`}
          />
          <StatCard
            label="평균 응답"
            value={`${agentMetrics.avgDuration}ms`}
            detail="응답시간"
          />
          <Link
            href={`/dashboard/logs?agent=${name}`}
            className="flex items-center justify-center rounded-lg border border-border/50 px-4 py-3 text-[12px] text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
          >
            로그 보기 →
          </Link>
        </div>
      )}

      {/* Config grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: settings */}
        <div className="space-y-5">
          <Section title="기본 설정">
            <ConfigRow label="모델" value={agent.model} mono />
            <ConfigRow
              label="단가"
              value={
                agent.model === "fast" ? "$0.80 / $4.00 per 1M"
                : agent.model === "powerful" ? "$15 / $75 per 1M"
                : "$3 / $15 per 1M"
              }
            />
            <ConfigRow
              label="스킬"
              value={
                agent.skills.length > 0
                  ? agent.skills.join(", ")
                  : "없음"
              }
            />
            <ConfigRow
              label="도구"
              value={`${agent.tools.length}개`}
            />
            {agent.advisor && (
              <ConfigRow
                label="Advisor"
                value={`${agent.advisor.model}${agent.advisor.maxUses ? ` (max ${agent.advisor.maxUses}회)` : ""}`}
                mono
              />
            )}
          </Section>

          <Section title="도구 목록">
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.map((tool) => (
                <Badge
                  key={tool}
                  variant="outline"
                  className="font-mono text-[11px]"
                >
                  {tool}
                </Badge>
              ))}
              {agent.tools.length === 0 && (
                <span className="text-[12px] text-muted-foreground">
                  등록된 도구 없음
                </span>
              )}
            </div>
          </Section>

          {agent.skills.length > 0 && (
            <Section title="스킬">
              <div className="flex flex-wrap gap-1.5">
                {agent.skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="font-mono text-[11px]"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Right column: schedule + quick test */}
        <div className="space-y-5">
          <Section title="스케줄">
            {agent.schedule && agent.schedule.length > 0 ? (
              <div className="space-y-2">
                {agent.schedule.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border/50 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium">{s.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {s.cron}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {s.question}
                    </p>
                    <div className="mt-1 flex gap-1">
                      {s.channels.map((ch) => (
                        <span
                          key={ch}
                          className="text-[10px] text-sky-400"
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                자동 실행 스케줄이 없습니다.
              </p>
            )}
          </Section>

          <Section title="빠른 테스트">
            <p className="text-[12px] text-muted-foreground">
              터미널에서 이 에이전트를 직접 테스트:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
{`curl -X POST http://localhost:3000/api/query \\
  -H "Content-Type: application/json" \\
  -d '{"query":"테스트", "agent":"${agent.name}"}'`}
            </pre>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ConfigRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span
        className={`text-[12px] ${mono ? "font-mono" : ""} text-foreground/80`}
      >
        {value}
      </span>
    </div>
  );
}
