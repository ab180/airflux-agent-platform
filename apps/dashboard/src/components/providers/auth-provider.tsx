"use client";

import { SessionProvider } from "next-auth/react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isTeamMode = process.env.NEXT_PUBLIC_AUTH_MODE === "google-sso";

  // Local mode: no SessionProvider needed, just render children
  if (!isTeamMode) {
    return <>{children}</>;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
