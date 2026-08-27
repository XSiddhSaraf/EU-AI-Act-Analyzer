import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        solid:
          "bg-gradient-to-b from-gold-soft to-gold text-[#23200f] shadow-[0_10px_26px_-10px_rgba(233,185,78,0.55)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-10px_rgba(233,185,78,0.7)]",
        glass:
          "glass-panel-soft text-text hover:border-border-strong",
        outline:
          "border border-border-strong bg-transparent text-text hover:border-gold hover:text-gold-soft",
        ghost:
          "bg-transparent text-text-2 hover:bg-surface-strong/60 hover:text-text",
      },
      size: {
        sm: "min-h-9 px-3.5 text-sm",
        default: "min-h-11 px-5 text-[0.95rem]",
        lg: "min-h-12 px-6 text-base",
        icon: "h-9 w-9 shrink-0 p-0",
      },
    },
    defaultVariants: {
      variant: "solid",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
