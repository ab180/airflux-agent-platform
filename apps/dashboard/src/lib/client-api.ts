import { API_BASE } from "./config";

/**
 * Client-side API fetch utility. Replaces scattered raw fetch() + console.warn patterns.
 * For use in "use client" components.
 */
export async function fetchClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    // Try to extract error message from JSON response body
    let message = `API ${path}: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Response wasn't JSON, use default message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function postClient<T>(
  path: string,
  body: unknown,
): Promise<T> {
  return fetchClient<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
