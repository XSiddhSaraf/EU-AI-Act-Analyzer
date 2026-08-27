"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[#04060c]/78 backdrop-blur-sm transition-opacity duration-200",
      "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "glass-panel-strong fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-7",
        "transition-[opacity,transform] duration-200",
        "data-[state=open]:scale-100 data-[state=open]:opacity-100",
        "data-[state=closed]:scale-95 data-[state=closed]:opacity-0",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Close dialog"
        className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-strong/60 text-text-2 transition-colors hover:border-gold hover:text-text"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";
