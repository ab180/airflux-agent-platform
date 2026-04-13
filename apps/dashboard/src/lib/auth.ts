/**
 * NextAuth.js configuration for Airflux Agent Platform.
 *
 * AUTH_MODE=local (default): No auth, all access allowed.
 * AUTH_MODE=google-sso: Google OAuth with workspace domain restriction.
 *
 * Reference: backstage farmerville/apps/web/server/auth/config.ts
 */

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export type UserRole = "admin" | "user";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
  }
}

export const isTeamMode = process.env.NEXT_PUBLIC_AUTH_MODE === "google-sso";

function buildAuthConfig(): NextAuthOptions {
  if (!isTeamMode) {
    // Local mode: no providers, JWT strategy, no real auth
    return {
      providers: [],
      session: { strategy: "jwt" },
      pages: { signIn: "/login" },
    };
  }

  // Team mode: Google OAuth with workspace domain restriction
  return {
    providers: [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorization: {
          params: {
            prompt: "consent",
            access_type: "offline",
            response_type: "code",
            hd: process.env.GOOGLE_WORKSPACE_DOMAIN,
          },
        },
      }),
    ],
    callbacks: {
      async signIn({ profile }) {
        // Restrict to workspace domain
        const domain = process.env.GOOGLE_WORKSPACE_DOMAIN;
        if (domain && profile?.email) {
          return profile.email.endsWith(`@${domain}`);
        }
        return false;
      },
      async jwt({ token, profile }) {
        // Assign role based on ADMIN_EMAILS
        if (profile?.email) {
          const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);
          token.role = adminEmails.includes(profile.email) ? "admin" : "user";
        }
        if (!token.role) token.role = "user";
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.role = token.role;
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    session: {
      strategy: "jwt",
    },
  };
}

export const authConfig = buildAuthConfig();
