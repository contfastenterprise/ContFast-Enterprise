import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-[#003366]/30 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[#001e40] text-white hover:bg-[#003366] shadow-sm dark:bg-[#003366] dark:hover:bg-[#004883]",
        gold:
          "bg-[#C5A059] text-slate-950 hover:bg-[#b08c4a] shadow-sm shadow-[#C5A059]/20 font-bold",
        primary:
          "bg-[#001e40] text-white hover:bg-[#003366] shadow-sm dark:bg-[#003366]",
        secondary:
          "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
        outline:
          "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-700 shadow-sm dark:bg-rose-600 dark:hover:bg-rose-700",
        danger:
          "bg-rose-600 text-white hover:bg-rose-700 shadow-sm dark:bg-rose-600 dark:hover:bg-rose-700",
        success:
          "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm dark:bg-emerald-600 dark:hover:bg-emerald-700",
        warning:
          "bg-amber-500 text-white hover:bg-amber-600 shadow-sm dark:bg-amber-500 dark:hover:bg-amber-600",
        link:
          "text-[#003366] dark:text-[#C5A059] underline-offset-4 hover:underline p-0 h-auto font-medium",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        xs: "h-7 px-2.5 text-xs rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 px-3 text-xs rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-10 px-4 py-2 text-sm",
        lg: "h-12 px-6 py-3 text-base rounded-xl [&_svg:not([class*='size-'])]:size-5",
        xl: "h-14 px-8 py-4 text-lg rounded-2xl [&_svg:not([class*='size-'])]:size-6",
        icon: "h-10 w-10 p-0 rounded-xl",
        "icon-xs": "h-7 w-7 p-0 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "h-8 w-8 p-0 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "h-12 w-12 p-0 rounded-xl [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
