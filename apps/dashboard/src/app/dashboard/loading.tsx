export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-5 w-28 rounded bg-muted/50" />
        <div className="mt-1.5 h-3.5 w-48 rounded bg-muted/30" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-border/50 bg-muted/10"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-32 rounded-lg border border-border/50 bg-muted/10 lg:col-span-3" />
        <div className="h-32 rounded-lg border border-border/50 bg-muted/10 lg:col-span-2" />
      </div>
    </div>
  );
}
