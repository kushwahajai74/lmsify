import { toast } from "sonner";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * FE-1 placeholder. Proves the design system is wired (Card, Button,
 * Separator, sonner toasts), the theme toggle works, and both stores
 * (auth + UI) are reachable. Replaced by real pages in FE-2+.
 *
 * `Wand2` is used in place of `Github` because lucide-react v1+ removed
 * all brand icons. Wand2 is a generic, brand-free substitute.
 */
export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <main className="bg-background text-foreground min-h-screen p-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-5 w-5" />
          <h1 className="text-xl font-semibold">CourseHub</h1>
        </div>
        <ThemeToggle />
      </header>

      <Separator className="my-6" />

      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Frontend scaffold complete</CardTitle>
          <CardDescription>
            FE-1: Vite 6 + React 19 + Tailwind v4 + shadcn/ui. No features
            yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Logged in as:{" "}
            <span className="text-foreground font-medium">
              {user?.name ?? "Anonymous"}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="default"
              onClick={() => toast.success("sonner is wired up")}
            >
              Trigger a toast
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                toggleSidebar();
                toast.info("Sidebar toggled (uiStore wired)");
              }}
            >
              Toggle sidebar
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                toast("Welcome to CourseHub", {
                  description: "FE-1 scaffold",
                })
              }
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Show another toast
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
