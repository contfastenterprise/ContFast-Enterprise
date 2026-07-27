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
          "w-full min-h-[80px] p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium text-sm rounded-xl transition-all duration-200 outline-none resize-y",
          "focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15 dark:focus:border-[#C5A059] dark:focus:ring-[#C5A059]/20",
          "disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-950 disabled:opacity-60",
          error &&
            "border-rose-500 dark:border-rose-500 focus:border-rose-600 focus:ring-rose-500/20 text-rose-900 dark:text-rose-200",
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
