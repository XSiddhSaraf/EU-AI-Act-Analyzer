import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, resolving conflicting Tailwind utility classes
 * (e.g. `cn("p-2", condition && "p-4")` keeps only `p-4` when true).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
