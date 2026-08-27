import { type VariantProps, cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border font-mono text-[0.7rem] font-semibold tracking-[0.1em] uppercase",
  {
    variants: {
      tone: {
        gold: "border-gold/40 bg-gold/10 text-gold",
        blue: "border-blue/40 bg-blue/10 text-blue",
        neutral: "border-border-strong bg-surface-strong/60 text-text-3",
        critical: "border-critical/45 bg-critical/10 text-critical",
        high: "border-high/45 bg-high/10 text-high",
        medium: "border-medium/45 bg-medium/10 text-medium",
        low: "border-low/45 bg-low/10 text-low",
        ok: "border-ok/45 bg-ok/10 text-ok",
      },
      size: {
        sm: "min-w-[76px] px-2.5 py-1 text-[0.62rem]",
        default: "px-3.5 py-1.5",
      },
    },
    defaultVariants: {
      tone: "gold",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
