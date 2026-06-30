import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface UiState {
  theme: Theme;
  sidebarOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

/**
 * UI-only state. Anything that is server-owned (user data, course lists,
 * etc.) belongs in TanStack Query — NOT here. The theme is also mirrored
 * by `next-themes`; this is the optimistic mirror for components that
 * want to read it without a hook dependency.
 */
export const useUiStore = create<UiState>((set) => ({
  theme: "system",
  sidebarOpen: false,
  setTheme: (theme) => set({ theme }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
