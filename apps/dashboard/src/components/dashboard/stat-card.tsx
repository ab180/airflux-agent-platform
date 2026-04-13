import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  accent?: boolean;
  size?: "sm" | "lg";
}

export function StatCard({
  label,
  value,
  detail,
  trend,
  trendValue,
  accent,
  size = "sm",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/50",
        size === "lg" ? "px-5 py-4" : "px-4 py-3",
        accent && "border-primary/20 bg-primary/[0.03]"
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {trend && trendValue && (
          <span
            className={cn(
              "font-mono text-[11px] font-medium",
              trend === "up" && "text-emerald-400",
              trend === "down" && "text-red-400",
              trend === "neutral" && "text-muted-foreground"
            )}
          >
            {trend === "up" ? "+" : ""}
            {trendValue}
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1 font-mono font-semibold tracking-tight",
          size === "lg" ? "text-3xl" : "text-2xl"
        )}
      >
        {value}
      </div>
      {detail && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div>
      )}
    </div>
  );
}
