import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps, ReactNode } from "react";

/**
 * Thin wrapper around `next-themes`. `attribute="class"` toggles
 * `class="dark"` on `<html>`, which Tailwind v4's
 * `@custom-variant dark (&:where(.dark, .dark *));` picks up.
 *
 * `disableTransitionOnChange` keeps the page from flashing a CSS
 * transition when the user flips the theme.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider> & { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
