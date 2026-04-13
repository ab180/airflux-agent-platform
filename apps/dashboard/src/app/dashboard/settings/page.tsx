import { Badge } from "@/components/ui/badge";
import { LLMSetup } from "@/components/dashboard/llm-setup";
import { fetchAPISafe } from "@/lib/api";

interface GuardrailInfo {
  name: string;
  description: string;
}

interface RoutingRule {
  agent: string;
  priority: number;
  keywords?: string[];
  patterns?: string[];
}

export default async function SettingsPage() {
  const [{ guardrails }, routingConfig, { agents }] = await Promise.all([
    fetchAPISafe<{ guardrails: GuardrailInfo[] }>("/api/admin/guardrails", { guardrails: [] }),
    fetchAPISafe<{ rules: RoutingRule[]; fallback: string }>("/api/admin/routing", { rules: [], fallback: "echo-agent" }),
    fetchAPISafe<{ agents: { name: string; model: string; advisor?: { model: string; maxUses?: number } | null }[] }>("/api/admin/agents", { agents: [] }),
  ]);

  const advisorAgents = agents.filter(a => a.advisor);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">설정</h1>
        <p className="text-[13px] text-muted-foreground">
          플랫폼 보안 및 시스템 설정
        </p>
      </div>

      {/* LLM Configuration */}
      <section className="space-y-3" aria-label="LLM 설정">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          LLM 연결
        </h2>
        <div className="rounded-lg border border-border/50 px-4 py-3">
          <LLMSetup />
        </div>
      </section>

      {/* Advisor configuration */}
      {advisorAgents.length > 0 && (
        <section className="space-y-3" aria-label="Advisor 설정">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Advisor 패턴 ({advisorAgents.length}개 에이전트)
          </h2>
          <p className="text-[12px] text-muted-foreground">
            executor(저비용) + advisor(고품질) 모델을 조합하여 비용 효율적으로 고품질 응답을 생성합니다.
          </p>
          <div className="space-y-1.5">
            {advisorAgents.map((a) => (
              <div key={a.name} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-medium">{a.name}</span>
                  <Badge variant="outline" className="text-[9px]">executor: {a.model}</Badge>
                </div>
                <Badge variant="outline" className="border-violet-500/30 text-[9px] text-violet-400">
                  advisor: {a.advisor!.model}{a.advisor!.maxUses ? ` (max ${a.advisor!.maxUses})` : ""}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Guardrails section */}
      <section className="space-y-3" aria-label="가드레일 설정">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            가드레일 ({guardrails.length}개 활성)
          </h2>
          <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-400">
            모두 활성
          </Badge>
        </div>
        <p className="text-[12px] text-muted-foreground">
          모든 쿼리에 자동 적용되는 입력 보안 규칙. 현재 <span className="font-mono text-foreground/70">prompt-injection</span>과 <span className="font-mono text-foreground/70">pii-filter</span>가 쿼리 입력에 적용됩니다.
        </p>

        <div className="space-y-2">
          {guardrails.map((g) => {
            const isActive = ["prompt-injection", "pii-filter"].includes(g.name);
            return (
              <div
                key={g.name}
                className="flex items-start gap-3 rounded-lg border border-border/50 px-4 py-3"
              >
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-emerald-500" : "bg-zinc-600"}`} role="status" aria-label={isActive ? "활성" : "비활성"} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-medium">{g.name}</span>
                    {isActive && (
                      <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
                        쿼리 입력 적용
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {g.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Routing rules section */}
      <section className="space-y-3" aria-label="라우팅 규칙">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          라우팅 규칙 ({routingConfig.rules.length}개)
        </h2>
        <p className="text-[12px] text-muted-foreground">
          사용자 질문을 적절한 에이전트로 자동 분배하는 규칙. Fallback: <span className="font-mono text-foreground/70">{routingConfig.fallback}</span>
        </p>
        <div className="space-y-2">
          {routingConfig.rules.map((rule, i) => (
            <div key={i} className="rounded-lg border border-border/50 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] font-medium">{rule.agent}</span>
                <span className="text-[10px] text-muted-foreground">우선순위: {rule.priority}</span>
              </div>
              {rule.keywords && rule.keywords.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {rule.keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="font-mono text-[9px]">{kw}</Badge>
                  ))}
                </div>
              )}
              {rule.patterns && rule.patterns.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {rule.patterns.map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-[9px] text-sky-400 border-sky-500/30">{p}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* System info section */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          시스템 정보
        </h2>
        <div className="rounded-lg border border-border/50 divide-y divide-border/30">
          <InfoRow label="플랫폼" value="Airflux Agent Platform v0.1.0" />
          <InfoRow label="단계" value="Phase 0+1 — 로컬 개발" />
          <InfoRow label="서버" value="Hono (Node.js)" />
          <InfoRow label="대시보드" value="Next.js 16 + shadcn/ui" />
          <InfoRow label="데이터베이스" value="SQLite (WAL 모드, 64MB 캐시)" />
          <InfoRow label="LLM" value="AI SDK 6 + Anthropic (Advisor 지원)" />
          <InfoRow label="에이전트" value={`${agents.length}개 (${agents.filter(a => a.advisor).length}개 advisor)`} />
          <InfoRow label="보안" value={`8종 미들웨어 + ${guardrails.length}종 가드레일 + 19패턴 prompt injection`} />
        </div>
      </section>

      {/* Config files section */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          설정 파일
        </h2>
        <div className="rounded-lg border border-border/50 divide-y divide-border/30">
          <InfoRow label="settings/agents.yaml" value="에이전트 등록/설정" mono />
          <InfoRow label="settings/skills.yaml" value="스킬 정의 (도구 조합 + guardrail)" mono />
          <InfoRow label="settings/routing-rules.yaml" value="에이전트 라우팅 규칙" mono />
          <InfoRow label="settings/feature-flags.yaml" value="기능 플래그" mono />
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className={`text-[12px] ${mono ? "font-mono" : ""} text-muted-foreground`}>{label}</span>
      <span className="text-[12px] text-foreground/80">{value}</span>
    </div>
  );
}
