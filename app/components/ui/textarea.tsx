import type { TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full min-h-[170px] resize-vertical rounded-xl border border-border bg-surface-strong/50 px-4 py-3 font-mono text-[0.82rem] leading-relaxed text-text placeholder:text-text-3 transition-[border-color,box-shadow] duration-150 outline-none",
          "focus:border-gold focus:shadow-[0_0_0_3px_rgba(233,185,78,0.28)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
