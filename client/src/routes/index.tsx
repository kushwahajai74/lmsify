import { createBrowserRouter } from "react-router-dom";
import { HomePage } from "@/pages/HomePage";

/**
 * FE-1 has a single route. FE-2+ will add the rest here. Data-router
 * mode is on (no `<BrowserRouter>`) so loaders/actions are available
 * for FE-3+ course/lesson pages.
 */
export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
]);
