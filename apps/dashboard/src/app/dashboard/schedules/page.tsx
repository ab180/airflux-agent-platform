import { Badge } from "@/components/ui/badge";
import { fetchAPISafe } from "@/lib/api";

interface Schedule {
  id: string;
  agentName: string;
  name: string;
  cron: string;
  question: string;
  channels: string[];
  enabled: boolean;
}

export default async function SchedulesPage() {
  const { schedules } = await fetchAPISafe<{ schedules: Schedule[] }>(
    "/api/admin/schedules",
    { schedules: [] }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">스케줄</h1>
        <p className="text-[13px] text-muted-foreground">
          에이전트 자동 실행 스케줄 ({schedules.length}개)
        </p>
      </div>

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 py-16">
          <div className="text-center">
            <p className="text-[13px] font-medium">등록된 스케줄 없음</p>
            <p className="mt-1.5 max-w-sm text-[12px] text-muted-foreground">
              agents.yaml에서 에이전트에 <code className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[11px]">schedule</code> 필드를
              추가하면 여기에 표시됩니다.
            </p>
            <pre className="mt-3 mx-auto max-w-xs text-left rounded-md bg-muted/30 px-3 py-2 font-mono text-[10px] text-muted-foreground">
{`schedule:
  - name: "일일 리포트"
    cron: "0 9 * * *"
    question: "어제 DAU 요약"
    channels: ["#reports"]`}
            </pre>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-border/50 px-4 py-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13px] font-medium">{s.name}</span>
                    <Badge variant="outline" className="font-mono text-[9px]">
                      {s.cron}
                    </Badge>
                    {s.enabled && (
                      <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
                        활성
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {s.question}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>에이전트: <span className="font-mono text-foreground/70">{s.agentName}</span></span>
                    {s.channels.length > 0 && (
                      <span>채널: {s.channels.map(ch => (
                        <span key={ch} className="font-mono text-sky-400">{ch}</span>
                      ))}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
