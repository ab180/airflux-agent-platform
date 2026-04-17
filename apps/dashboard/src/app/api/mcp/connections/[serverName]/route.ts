import { NextRequest, NextResponse } from "next/server";
import { getViewerUserId, proxyToServer } from "@/lib/server-proxy";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ serverName: string }> },
) {
  const { serverName } = await context.params;
  const userId = await getViewerUserId();
  const upstream = await proxyToServer(
    `/api/mcp/connections/${encodeURIComponent(serverName)}`,
    { method: "DELETE" },
    { userId },
  );

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
