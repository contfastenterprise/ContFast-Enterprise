import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean | string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  inputSize?: "sm" | "md" | "lg";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      error,
      leftIcon,
      rightIcon,
      inputSize = "md",
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "h-8 px-3 text-xs rounded-lg",
      md: "h-10 px-3.5 text-sm rounded-xl",
      lg: "h-12 px-4 text-base rounded-xl",
    };

    const hasLeftIcon = Boolean(leftIcon);
    const hasRightIcon = Boolean(rightIcon);

    return (
      <div className="relative w-full flex items-center">
        {hasLeftIcon && (
          <div className="absolute left-3 flex items-center justify-center pointer-events-none text-slate-400 dark:text-slate-500">
            {leftIcon}
          </div>
        )}

        <input
          type={type}
          className={cn(
            "w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium transition-all duration-200 outline-none",
            "focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15 dark:focus:border-[#C5A059] dark:focus:ring-[#C5A059]/20",
            "disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-950 disabled:opacity-60",
            error &&
              "border-rose-500 dark:border-rose-500 focus:border-rose-600 focus:ring-rose-500/20 text-rose-900 dark:text-rose-200",
            sizeClasses[inputSize],
            hasLeftIcon && "pl-9",
            hasRightIcon && "pr-9",
            className
          )}
          ref={ref}
          disabled={disabled}
          {...props}
        />

        {hasRightIcon && (
          <div className="absolute right-3 flex items-center justify-center text-slate-400 dark:text-slate-500">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
