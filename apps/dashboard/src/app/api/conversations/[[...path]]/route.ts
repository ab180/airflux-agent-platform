import { NextRequest, NextResponse } from "next/server";
import { getViewerUserId, proxyToServer } from "@/lib/server-proxy";

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  const userId = await getViewerUserId();
  const search = request.nextUrl.search || "";
  const suffix = path.length > 0 ? `/${path.join("/")}` : "";
  const upstreamPath = `/api/conversations${suffix}${search}`;
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const upstream = await proxyToServer(
    upstreamPath,
    {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
      },
      body,
    },
    { userId },
  );

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  return handle(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  return handle(request, context);
}
