import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "./ThemeProvider";
import { router } from "@/routes";

/**
 * Single module-scope QueryClient. Survives HMR, doesn't lose the cache
 * between Fast Refreshes. Re-creating it inside `AppProviders` would
 * cause every HMR to invalidate every query.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

/**
 * Provider order is deliberate:
 *   QueryClient (outermost — every hook can use it)
 *     └─ Theme (next-themes writes to <html> in an effect; we want it
 *              above the Router so route changes see the right theme)
 *          └─ Router (renders pages)
 *          └─ Toaster (sibling of Router, top-level so any page can toast)
 */
export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
