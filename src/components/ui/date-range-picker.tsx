"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"
import { es } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
  from: string; // "YYYY-MM-DD"
  to: string;   // "YYYY-MM-DD"
  onChange: (range: { from: string; to: string }) => void;
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  // Convert from/to strings into Date objects for react-day-picker
  const dateRange: DateRange | undefined = React.useMemo(() => {
    const fromDate = from ? parseISO(from) : undefined;
    const toDate = to ? parseISO(to) : undefined;
    return {
      from: fromDate,
      to: toDate,
    };
  }, [from, to]);

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) return;
    
    const fromStr = range.from ? format(range.from, "yyyy-MM-dd") : "";
    const toStr = range.to ? format(range.to, "yyyy-MM-dd") : fromStr;
    
    onChange({
      from: fromStr,
      to: toStr,
    });
  };

  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            id="date"
            type="button"
            className={cn(
              "w-full h-8 flex items-center justify-start text-left font-normal bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 transition rounded-lg px-3 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-[#003366]/10 focus:border-[#003366] cursor-pointer",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "dd/MM/yyyy")} – {format(dateRange.to, "dd/MM/yyyy")}
                </>
              ) : (
                format(dateRange.from, "dd/MM/yyyy")
              )
            ) : (
              <span>Seleccionar rango de fecha</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-white border border-slate-200 shadow-xl rounded-xl" align="start">
          <Calendar
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleSelect}
            numberOfMonths={2}
            locale={es}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
