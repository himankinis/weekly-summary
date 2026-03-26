"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO, addDays, subDays } from "date-fns";

interface Props {
  weekStart: string;
  onWeekChange: (week: string) => void;
}

function prevWeek(weekStart: string): string {
  return format(subDays(parseISO(weekStart), 7), "yyyy-MM-dd");
}

function nextWeek(weekStart: string): string {
  return format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd");
}

function isCurrentWeek(weekStart: string): boolean {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10) === weekStart;
}

export default function WeekNav({ weekStart, onWeekChange }: Props) {
  const weekEnd = format(addDays(parseISO(weekStart), 6), "MMM d");
  const weekStartFmt = format(parseISO(weekStart), "MMM d");
  const year = format(parseISO(weekStart), "yyyy");
  const isCurrent = isCurrentWeek(weekStart);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onWeekChange(prevWeek(weekStart))}
        title="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="text-sm font-medium min-w-[150px] text-center">
        {weekStartFmt}–{weekEnd}
        {", "}
        {year}
        {isCurrent && (
          <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            This week
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onWeekChange(nextWeek(weekStart))}
        disabled={isCurrent}
        title="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
