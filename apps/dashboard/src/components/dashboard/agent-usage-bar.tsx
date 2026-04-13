interface AgentUsage {
  name: string;
  requests: number;
  percentage: number;
}

interface AgentUsageBarProps {
  agents: AgentUsage[];
}

const BAR_COLORS = [
  "bg-primary",
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-rose-400",
];

export function AgentUsageBar({ agents }: AgentUsageBarProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/50">
        {agents.map((agent, i) => (
          <div
            key={agent.name}
            className={`${BAR_COLORS[i % BAR_COLORS.length]} transition-all`}
            style={{ width: `${agent.percentage}%` }}
          />
        ))}
      </div>
      <div className="space-y-1">
        {agents.map((agent, i) => (
          <div key={agent.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
              />
              <span className="text-[12px] text-muted-foreground">
                {agent.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] text-foreground/80">
                {agent.requests}
              </span>
              <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">
                {agent.percentage}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
