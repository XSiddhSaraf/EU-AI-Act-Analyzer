"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

export interface ProgressProps {
  /** 0–100 */
  value: number;
  className?: string;
  fillClassName?: string;
  label?: string;
}

export function Progress({ value, className, fillClassName, label }: ProgressProps) {
  const shouldReduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("meter-track h-1.5 w-full", className)}
    >
      <motion.div
        className={cn("meter-fill h-full", fillClassName)}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}
