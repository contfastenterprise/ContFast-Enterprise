import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean | string;
  selectSize?: "sm" | "md" | "lg";
  leftIcon?: React.ReactNode;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      children,
      error,
      selectSize = "md",
      leftIcon,
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "h-8 pl-3 pr-8 text-xs rounded-lg",
      md: "h-10 pl-3.5 pr-9 text-sm rounded-xl",
      lg: "h-12 pl-4 pr-10 text-base rounded-xl",
    };

    const hasLeftIcon = Boolean(leftIcon);

    return (
      <div className="relative w-full flex items-center">
        {hasLeftIcon && (
          <div className="absolute left-3 flex items-center justify-center pointer-events-none text-slate-400 dark:text-slate-500">
            {leftIcon}
          </div>
        )}

        <select
          className={cn(
            "w-full appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-medium transition-all duration-200 outline-none cursor-pointer",
            "focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15 dark:focus:border-[#C5A059] dark:focus:ring-[#C5A059]/20",
            "disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-950 disabled:opacity-60",
            error &&
              "border-rose-500 dark:border-rose-500 focus:border-rose-600 focus:ring-rose-500/20 text-rose-900 dark:text-rose-200",
            sizeClasses[selectSize],
            hasLeftIcon && "pl-9",
            className
          )}
          ref={ref}
          disabled={disabled}
          {...props}
        >
          {children}
        </select>

        <div className="absolute right-3 flex items-center justify-center pointer-events-none text-slate-400 dark:text-slate-500">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
