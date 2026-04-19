import { NextRequest, NextResponse } from "next/server";
import { getViewerUserId, proxyToServer } from "@/lib/server-proxy";

/**
 * Dashboard proxy for the streaming query endpoint.
 * Forwards the SSE response body as-is so the browser receives the
 * upstream chunks in real time. Do NOT call `.text()` here — that would
 * buffer the whole stream and defeat the point.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const userId = await getViewerUserId();

  const upstream = await proxyToServer(
    "/api/query/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    },
    { userId },
  );

  if (!upstream.body) {
    return NextResponse.json(
      { success: false, error: "Upstream returned empty body" },
      { status: 502 },
    );
  }

  // Non-OK upstream (e.g. validation error) — forward status + JSON body.
  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": contentType || "application/json" },
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
