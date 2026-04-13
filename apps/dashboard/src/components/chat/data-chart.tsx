"use client";

import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export interface ChartData {
  type: "line" | "bar" | "pie";
  title?: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKeys: string[];
}

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

export function DataChart({ chart }: { chart: ChartData }) {
  if (!chart || !chart.data || chart.data.length === 0) return null;

  return (
    <div className="my-3 rounded-lg border border-border/50 bg-card p-3">
      {chart.title && (
        <h4 className="mb-2 text-[12px] font-medium text-foreground/80">{chart.title}</h4>
      )}
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          {chart.type === "bar" ? (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 6, fontSize: 11 }} />
              {chart.yKeys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          ) : chart.type === "line" ? (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 6, fontSize: 11 }} />
              {chart.yKeys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Pie data={chart.data} dataKey={chart.yKeys[0]} nameKey={chart.xKey} cx="50%" cy="50%" outerRadius={70} label={{ fontSize: 10 }}>
                {chart.data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 6, fontSize: 11 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
