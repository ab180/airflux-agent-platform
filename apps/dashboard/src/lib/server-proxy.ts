import { getServerSession } from "next-auth";
import { authConfig, isTeamMode } from "@/lib/auth";
import { createHmac } from "crypto";

const SERVER_API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3000";

const ADMIN_KEY =
  process.env.ADMIN_API_KEY ??
  "airflux-local";

const PROXY_SECRET =
  process.env.DASHBOARD_PROXY_SECRET ??
  process.env.ADMIN_API_KEY ??
  "airflux-local";

export async function getViewerUserId(): Promise<string> {
  if (!isTeamMode) return "local-admin";
  const session = await getServerSession(authConfig);
  return session?.user?.email || "unknown-user";
}

export async function proxyToServer(
  path: string,
  init?: RequestInit,
  options?: { admin?: boolean; userId?: string },
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (options?.admin) {
    headers.set("x-admin-key", ADMIN_KEY);
  }
  if (options?.userId) {
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", PROXY_SECRET)
      .update(`${options.userId}.${timestamp}`)
      .digest("hex");
    headers.set("x-airflux-user-id", options.userId);
    headers.set("x-airflux-user-ts", timestamp);
    headers.set("x-airflux-user-sig", signature);
  }

  return fetch(`${SERVER_API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
