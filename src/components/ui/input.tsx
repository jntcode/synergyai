import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm transition-colors",
        "placeholder:text-faint focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[120px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm transition-colors",
      "placeholder:text-faint focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-destructive",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
