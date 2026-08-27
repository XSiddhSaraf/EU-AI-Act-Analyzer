import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Use the more opaque "strong" glass surface (elevated/hover state). */
  strong?: boolean;
  /** Use the lighter "soft" glass surface (nested/inset panels). */
  soft?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, strong, soft, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          soft ? "glass-panel-soft" : "glass-panel",
          strong && "glass-panel-strong",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";
