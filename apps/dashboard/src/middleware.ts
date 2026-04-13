import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const isTeamMode = process.env.NEXT_PUBLIC_AUTH_MODE === "google-sso";

export async function middleware(request: NextRequest) {
  // Local mode: no auth, allow everything
  if (!isTeamMode) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Public paths: login page, NextAuth API, static assets
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check session
  const token = await getToken({ req: request });
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /dashboard (admin console): require admin role
  if (pathname.startsWith("/dashboard")) {
    if (token.role !== "admin") {
      // Non-admin trying to access admin console → redirect to chat
      return NextResponse.redirect(new URL("/chat", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
