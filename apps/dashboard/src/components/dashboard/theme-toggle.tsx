"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * 3-way theme toggle: light → dark → system → light → ...
 * Renders nothing during SSR / before hydration to avoid mismatch
 * (next-themes only knows the actual resolved theme on the client).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="테마"
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40"
      >
        <span className="block h-3 w-3 rounded-full border border-current" />
      </button>
    );
  }

  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label =
    theme === "light" ? "라이트" : theme === "dark" ? "다크" : "시스템";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`테마: ${label} (클릭하면 ${
        next === "light" ? "라이트" : next === "dark" ? "다크" : "시스템"
      })`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-transparent px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <ThemeIcon theme={theme} />
      <span>{label}</span>
    </button>
  );
}

function ThemeIcon({ theme }: { theme: string | undefined }) {
  if (theme === "light") {
    return (
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1.06 1.06M4.46 11.54L3.4 12.6M12.6 12.6l-1.06-1.06M4.46 4.46L3.4 3.4" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13.5 9.5A6 6 0 016.5 2.5a6 6 0 107 7z" />
      </svg>
    );
  }
  // system
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="12" height="9" rx="1" />
      <path d="M5.5 14h5M8 12v2" />
    </svg>
  );
}
