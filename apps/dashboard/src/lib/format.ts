/**
 * Shared formatting utilities for the dashboard.
 */

export function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function formatPercentage(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatTimeRemaining(resetAtMs: number, nowMs: number): string {
  const diffMs = resetAtMs - nowMs;
  if (diffMs <= 0) return "초기화 중";
  const sec = Math.floor(diffMs / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간 뒤 초기화`;
  if (h > 0) return `${h}시간 ${m}분 뒤 초기화`;
  if (m > 0) return `${m}분 뒤 초기화`;
  return "잠시 뒤 초기화";
}
