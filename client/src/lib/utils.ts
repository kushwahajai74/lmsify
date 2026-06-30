import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn(...)` — shadcn's standard class-name helper.
 *
 * 1. `clsx` joins truthy class names, dropping falsy ones (handles conditional
 *    `className` props cleanly).
 * 2. `tailwind-merge` then de-duplicates conflicting Tailwind classes so the
 *    LAST one wins (e.g. `cn("p-2", "p-4")` resolves to `p-4`, not both).
 *
 * Without `tailwind-merge`, two sources of `className` that both set
 * `padding` would both apply — order-dependent and bug-prone.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
