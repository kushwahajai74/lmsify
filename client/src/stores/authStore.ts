import { create } from "zustand";
import type { User } from "@/types/user";

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setSession: (accessToken: string, user: User) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

/**
 * In-memory only. The refresh token lives in an httpOnly cookie and is never
 * readable from JS — this store is the authoritative home of the access token
 * between renders. On hard refresh the store is empty; FE-2 adds a
 * `/auth/refresh`-on-boot hook to restore the session from the cookie.
 *
 * NO `persist` middleware — that would defeat the security model.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  setSession: (accessToken, user) =>
    set({ accessToken, user, isAuthenticated: true }),
  setAccessToken: (accessToken) =>
    set((s) => ({ ...s, accessToken, isAuthenticated: accessToken !== null })),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null, isAuthenticated: false }),
}));
