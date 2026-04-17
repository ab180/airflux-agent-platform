import { NextResponse } from "next/server";
import { getViewerUserId, proxyToServer } from "@/lib/server-proxy";

export async function GET() {
  const userId = await getViewerUserId();
  const upstream = await proxyToServer(`/api/mcp/servers`, undefined, { userId });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
