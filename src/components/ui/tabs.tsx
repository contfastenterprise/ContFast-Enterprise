import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-11 items-center justify-start rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 text-slate-500 dark:text-slate-400 w-full sm:w-auto overflow-x-auto",
        className
      )}
      {...props}
    />
  )
);
TabsList.displayName = "TabsList";

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, active, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition duration-200 outline-none select-none disabled:pointer-events-none disabled:opacity-50",
        active
          ? "bg-white dark:bg-slate-900 text-slate-950 dark:text-slate-100 shadow-xs border border-slate-200/50 dark:border-slate-800"
          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50",
        className
      )}
      {...props}
    />
  )
);
TabsTrigger.displayName = "TabsTrigger";

export { TabsList, TabsTrigger };
