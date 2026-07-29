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
      md: "h-10 pl-3.5 pr-9 text-sm rounded-[10px]",
      lg: "h-12 pl-4 pr-10 text-base rounded-[10px]",
    };

    const hasLeftIcon = Boolean(leftIcon);

    return (
      <div className="relative w-full flex items-center">
        {hasLeftIcon && (
          <div className="absolute left-3 flex items-center justify-center pointer-events-none text-muted-foreground">
            {leftIcon}
          </div>
        )}

        <select
          className={cn(
            "w-full appearance-none bg-background border border-border text-foreground font-medium transition-all duration-200 outline-none cursor-pointer",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
            error &&
              "border-destructive focus:border-destructive focus:ring-destructive/20 text-destructive",
            sizeClasses[selectSize],
            hasLeftIcon && "pl-10",
            className
          )}
          ref={ref}
          disabled={disabled}
          {...props}
        >
          {children}
        </select>

        <div className="absolute right-3 flex items-center justify-center pointer-events-none text-muted-foreground">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
