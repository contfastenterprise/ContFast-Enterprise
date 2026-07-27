import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, HelpCircle } from "lucide-react";

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string | boolean;
  helperText?: React.ReactNode;
  tooltip?: string;
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      className,
      label,
      htmlFor,
      required,
      error,
      helperText,
      tooltip,
      children,
      ...props
    },
    ref
  ) => {
    const hasError = Boolean(error);
    const errorMessage = typeof error === "string" ? error : null;

    return (
      <div ref={ref} className={cn("space-y-1.5 w-full", className)} {...props}>
        {label && (
          <div className="flex items-center justify-between gap-1.5">
            <label
              htmlFor={htmlFor}
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1"
            >
              <span>{label}</span>
              {required && (
                <span className="text-rose-500 font-bold" title="Campo obligatorio">
                  *
                </span>
              )}
              {tooltip && (
                <span
                  title={tooltip}
                  className="text-slate-400 hover:text-slate-600 dark:text-slate-500 cursor-help"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </span>
              )}
            </label>
          </div>
        )}

        {children}

        {hasError && errorMessage ? (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </p>
        ) : helperText ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);
FormField.displayName = "FormField";

export { FormField };
