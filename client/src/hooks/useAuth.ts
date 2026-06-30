import { useAuthStore } from "@/stores/authStore";

/**
 * Thin selector over the auth store. Avoids components having to know
 * the store's internal shape, and gives a single seam to swap to
 * `useShallow` (Zustand v5) or memoize later if re-renders become a
 * problem.
 */
export function useAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSession = useAuthStore((s) => s.setSession);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);

  return {
    accessToken,
    user,
    isAuthenticated,
    setSession,
    setAccessToken,
    setUser,
    clear,
  };
}
