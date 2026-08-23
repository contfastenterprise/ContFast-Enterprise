import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, disabled, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "w-full min-h-[80px] p-3.5 bg-background border border-border text-foreground placeholder:text-muted-foreground font-medium text-sm rounded-[10px] transition duration-200 outline-none resize-y",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
          error &&
            "border-destructive focus:border-destructive focus:ring-destructive/20 text-destructive",
          className
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
