import { Loader2 } from "lucide-react";

/**
 * Full-viewport spinner for route transitions and async loaders. Use
 * this from `<Suspense fallback>` in FE-2+ and from any `useQuery`
 * with `isPending`.
 */
export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
    </div>
  );
}
