/**
 * Centralized client-side configuration.
 * All client components should import API_BASE from here.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
export const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "airflux-local";
