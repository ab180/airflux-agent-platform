import { Badge } from "@/components/ui/badge";
import { fetchAPISafe, type SkillInfo } from "@/lib/api";

interface SkillStat {
  skillName: string;
  totalUses: number;
  successRate: number;
}

export default async function SkillsPage() {
  const [{ skills }, { stats }] = await Promise.all([
    fetchAPISafe<{ skills: SkillInfo[] }>("/api/admin/skills", { skills: [] }),
    fetchAPISafe<{ stats: SkillStat[] }>("/api/admin/skills/stats", { stats: [] }),
  ]);

  const statsMap = new Map(stats.map(s => [s.skillName, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">스킬</h1>
        <p className="text-[13px] text-muted-foreground">
          {skills.length}개 스킬 등록됨
        </p>
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16">
          <h3 className="text-[13px] font-medium">스킬 없음</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            settings/skills.yaml에서 스킬을 정의하세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {skills.map((skill) => {
            const usage = statsMap.get(skill.name);
            return (
              <div
                key={skill.name}
                className="rounded-lg border border-border/50 px-4 py-3.5"
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[13px] font-medium">
                    {skill.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {usage && (
                      <span className={`font-mono text-[10px] ${usage.successRate >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                        {usage.totalUses}회 · {usage.successRate}%
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {skill.requiredTools.length} 도구
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {skill.description}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {skill.guardrails.map((g) => (
                    <Badge
                      key={g}
                      variant="outline"
                      className="border-amber-500/20 text-[9px] font-mono text-amber-500/80"
                    >
                      {g}
                    </Badge>
                  ))}
                </div>
                {skill.usedBy.length > 0 && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    사용 에이전트:{" "}
                    {skill.usedBy.map((a, i) => (
                      <span key={a}>
                        <span className="font-mono text-foreground/60">{a}</span>
                        {i < skill.usedBy.length - 1 && ", "}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
