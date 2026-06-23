"use client";
import { useState, useRef, useEffect } from "react";
import { DatePicker, parseDate } from "@ark-ui/react/date-picker";
import { ChevronLeftIcon, ChevronRightIcon, Calendar as CalendarIcon } from "lucide-react";

const NUM_OF_MONTHS = 2;

interface DateRangePickerProps {
  from: string; // "YYYY-MM-DD"
  to: string;   // "YYYY-MM-DD"
  onChange: (range: { from: string; to: string }) => void;
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Format dates for display
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const displayValue = from && to 
    ? `${formatDateDisplay(from)} – ${formatDateDisplay(to)}`
    : "Seleccionar rango de fecha";

  // Convert "YYYY-MM-DD" to DateValue or fallback to today
  const getInitialValues = () => {
    const values: any[] = [];
    if (from) {
      try {
        values.push(parseDate(from));
      } catch (e) {
        // Fallback
      }
    }
    if (to) {
      try {
        values.push(parseDate(to));
      } catch (e) {
        // Fallback
      }
    }
    return values;
  };

  const handleValueChange = (details: any) => {
    const values = details.valueAsString || [];
    if (values.length === 2) {
      onChange({
        from: values[0],
        to: values[1]
      });
    } else if (values.length === 1) {
      onChange({
        from: values[0],
        to: values[0]
      });
    }
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-outline-variant bg-white text-on-surface px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer min-w-[240px]"
      >
        <CalendarIcon className="h-4 w-4 text-on-surface-variant" />
        <span className="flex-1 text-left">{displayValue}</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 z-50 shadow-xl rounded-lg bg-white dark:bg-gray-800 border border-outline-variant">
          <DatePicker.Root
            inline
            value={getInitialValues()}
            onValueChange={handleValueChange}
            selectionMode="range"
            timeZone="America/Santo_Domingo"
            numOfMonths={NUM_OF_MONTHS}
          >
            <DatePicker.Content className="bg-white dark:bg-gray-800 rounded-lg shadow-xs py-3 inline-block">
              <DatePicker.View
                view="day"
                className="flex divide-x divide-gray-200 dark:divide-gray-700 relative"
              >
                <nav className="absolute w-full top-0 flex justify-between px-3 z-10">
                  <DatePicker.PrevTrigger className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                    <ChevronLeftIcon className="w-4 h-4" />
                  </DatePicker.PrevTrigger>
                  <DatePicker.NextTrigger className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-700 dark:text-gray-300 cursor-pointer">
                    <ChevronRightIcon className="w-4 h-4" />
                  </DatePicker.NextTrigger>
                </nav>
                <DatePicker.Context>
                  {(api) =>
                    Array.from({ length: NUM_OF_MONTHS }).map((_, index) => {
                      const offset = api.getOffset({ months: index });
                      return (
                        <div key={index} className="px-3">
                          <DatePicker.ViewControl className="flex justify-center items-center mx-10 mb-1 h-9">
                            <DatePicker.ViewTrigger className="z-20 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded-md transition-colors cursor-pointer">
                              <span>
                                {new Intl.DateTimeFormat("es", {
                                  month: "long",
                                }).format(
                                  offset.visibleRange.start.toDate("America/Santo_Domingo")
                                )}{" "}
                                {offset.visibleRange.start.year}
                              </span>
                            </DatePicker.ViewTrigger>
                          </DatePicker.ViewControl>
                          <DatePicker.Table>
                            <DatePicker.TableHead>
                              <DatePicker.TableRow>
                                {api.weekDays.map((weekDay, id) => (
                                  <DatePicker.TableHeader
                                    key={id}
                                    className="text-sm font-medium text-gray-500 dark:text-gray-400 w-9 h-7 text-center"
                                  >
                                    {weekDay.narrow}
                                  </DatePicker.TableHeader>
                                ))}
                              </DatePicker.TableRow>
                            </DatePicker.TableHead>
                            <DatePicker.TableBody>
                              {offset.weeks.map((week, id) => (
                                <DatePicker.TableRow key={id}>
                                  {week.map((day, id) => (
                                    <DatePicker.TableCell
                                      key={id}
                                      value={day}
                                      className="pe-0 ps-0"
                                      visibleRange={offset.visibleRange}
                                    >
                                      <DatePicker.TableCellTrigger className="relative w-9 h-9 text-sm transition-colors data-outside-range:pointer-events-none flex items-center justify-center font-medium cursor-pointer data-today:after:content-[''] data-today:after:absolute data-today:after:bottom-0.5 data-today:after:w-1 data-today:after:h-1 data-today:after:rounded-full data-today:after:bg-gray-200 data-today:not-data-range-start:not-data-range-end:not-data-hover-range-start:not-data-hover-range-end:after:bg-gray-900 dark:data-today:after:bg-gray-900 data-outside-range:text-gray-400 dark:data-outside-range:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 data-in-range:not-data-range-start:not-data-range-end:not-data-hover-range-start:not-data-hover-range-end:bg-gray-100 dark:data-in-range:not-data-range-start:not-data-range-end:not-data-hover-range-start:not-data-hover-range-end:bg-gray-700 data-range-start:bg-gray-900 data-range-start:text-white dark:data-range-start:bg-gray-200 dark:data-range-start:text-gray-900 data-range-end:bg-gray-900 data-range-end:text-white dark:data-range-end:bg-gray-200 dark:data-range-end:text-gray-900 data-hover-range-start:bg-gray-900 data-hover-range-start:text-white dark:data-hover-range-start:bg-gray-200 dark:data-hover-range-start:text-gray-900 data-hover-range-end:bg-gray-900 data-hover-range-end:text-white dark:data-hover-range-end:bg-gray-200 dark:data-hover-range-end:text-gray-900 not-data-in-range:rounded-lg data-range-start:rounded-l-lg data-range-end:rounded-r-lg data-hover-range-start:rounded-l-lg data-hover-range-end:rounded-r-lg">
                                        {day.day}
                                      </DatePicker.TableCellTrigger>
                                    </DatePicker.TableCell>
                                  ))}
                                </DatePicker.TableRow>
                              ))}
                            </DatePicker.TableBody>
                          </DatePicker.Table>
                        </div>
                      );
                    })
                  }
                </DatePicker.Context>
              </DatePicker.View>
            </DatePicker.Content>
          </DatePicker.Root>
        </div>
      )}
    </div>
  );
}
