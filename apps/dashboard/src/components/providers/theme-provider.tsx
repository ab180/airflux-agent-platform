"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Wraps next-themes with our defaults — dark by default for backward
 * compatibility, but the user can switch to light or follow system pref.
 * `attribute="class"` adds/removes `class="dark"` on <html>, which the
 * existing CSS variables in globals.css already toggle on.
 */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  );
}
