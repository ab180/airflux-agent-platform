import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentToggle } from "@/components/dashboard/agent-toggle";
import { AgentCreateButton } from "@/components/dashboard/agent-create-button";
import { fetchAPISafe, type AgentInfo } from "@/lib/api";

export default async function AgentsPage() {
  const { agents } = await fetchAPISafe<{ agents: AgentInfo[] }>(
    "/api/admin/agents",
    { agents: [] }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">에이전트</h1>
          <p className="text-[13px] text-muted-foreground">
            {agents.length}개 에이전트 등록됨
          </p>
        </div>
        <AgentCreateButton />
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16">
          <h3 className="text-[13px] font-medium">에이전트 없음</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            API 서버가 실행 중인지 확인하세요.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentInfo }) {
  const hasSchedule = agent.schedule && agent.schedule.length > 0;

  return (
    <div className="group rounded-lg border border-border/50 px-5 py-4 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div
              className={`h-2 w-2 shrink-0 rounded-full ${
                agent.enabled ? "bg-emerald-500" : "bg-zinc-600"
              }`}
              aria-label={agent.enabled ? "활성" : "비활성"}
              role="status"
            />
            <Link
              href={`/dashboard/agents/${agent.name}`}
              className="font-mono text-[14px] font-medium hover:text-primary transition-colors"
            >
              {agent.name}
            </Link>
            {agent.advisor && (
              <Badge
                variant="outline"
                className="border-violet-500/30 bg-violet-500/10 text-[10px] font-medium text-violet-400"
              >
                advisor: {agent.advisor.model}
              </Badge>
            )}
            {hasSchedule && (
              <Badge
                variant="outline"
                className="border-sky-500/30 bg-sky-500/10 text-[10px] font-medium text-sky-400"
              >
                scheduled
              </Badge>
            )}
            {!agent.enabled && (
              <Badge variant="secondary" className="text-[10px] font-medium">
                disabled
              </Badge>
            )}
          </div>
          {agent.description && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {agent.description}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              모델:{" "}
              <span className="font-mono text-foreground/70">{agent.model}</span>
            </span>
            <span>
              스킬:{" "}
              <span className="font-mono text-foreground/70">
                {agent.skills.length}
              </span>
            </span>
            <span>
              도구:{" "}
              <span className="font-mono text-foreground/70">
                {agent.tools.length}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border/30 pt-3">
        <Link href={`/dashboard/playground?agent=${agent.name}`}>
          <Button size="sm" className="h-7 text-[11px]">
            플레이그라운드
          </Button>
        </Link>
        <Link href={`/dashboard/prompts?agent=${agent.name}`}>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]">
            프롬프트
          </Button>
        </Link>
        <Link href={`/dashboard/agents/${agent.name}`}>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]">
            설정
          </Button>
        </Link>
        <Link href={`/dashboard/logs?agent=${agent.name}`}>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]">
            로그
          </Button>
        </Link>
        <AgentToggle name={agent.name} enabled={agent.enabled} />
      </div>
    </div>
  );
}
