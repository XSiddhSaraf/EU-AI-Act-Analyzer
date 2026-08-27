import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-border bg-surface-strong/50 px-4 py-3 text-[0.9rem] text-text placeholder:text-text-3 transition-[border-color,box-shadow] duration-150 outline-none",
          "focus:border-gold focus:shadow-[0_0_0_3px_rgba(233,185,78,0.28)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
