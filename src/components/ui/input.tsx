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
      md: "h-10 px-3.5 text-sm rounded-[10px]",
      lg: "h-12 px-4 text-base rounded-[10px]",
    };

    const hasLeftIcon = Boolean(leftIcon);
    const hasRightIcon = Boolean(rightIcon);

    return (
      <div className="relative w-full flex items-center">
        {hasLeftIcon && (
          <div className="absolute left-3 flex items-center justify-center pointer-events-none text-muted-foreground">
            {leftIcon}
          </div>
        )}

        <input
          type={type}
          className={cn(
            "w-full bg-background border border-border text-foreground placeholder:text-muted-foreground transition duration-200 outline-none",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
            error &&
              "border-destructive focus:border-destructive focus:ring-destructive/20 text-destructive",
            sizeClasses[inputSize],
            hasLeftIcon && "pl-10",
            hasRightIcon && "pr-10",
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
