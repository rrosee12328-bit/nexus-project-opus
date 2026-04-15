import { useMemo } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalIcon } from "lucide-react";

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  type: string;
  color: string;
  meta?: string;
  description?: string;
  timeRange?: string;
  startTime?: string;
  link?: string;
  rawEvent?: any;
}

interface DayViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  events: CalendarEvent[];
  onAddEvent: () => void;
  onEditEvent: (event: CalendarEvent) => void;
  onNavigate: (link: string) => void;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7 AM – 9 PM

const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const formatHour = (hour: number) => {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
};

// Map bg-* color classes to lighter bg + colored text for Google-style blocks
const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  "bg-primary": { bg: "bg-primary/15", text: "text-primary", border: "border-primary/30" },
  "bg-teal-500": { bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-400", border: "border-teal-500/30" },
  "bg-emerald-500": { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30" },
  "bg-purple-500": { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/30" },
  "bg-blue-500": { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30" },
  "bg-amber-500": { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" },
  "bg-indigo-500": { bg: "bg-indigo-500/15", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/30" },
  "bg-blue-600": { bg: "bg-blue-600/15", text: "text-blue-600 dark:text-blue-400", border: "border-blue-600/30" },
  "bg-orange-500": { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30" },
  "bg-sky-500": { bg: "bg-sky-500/15", text: "text-sky-600 dark:text-sky-400", border: "border-sky-500/30" },
  "bg-red-500": { bg: "bg-red-500/15", text: "text-red-600 dark:text-red-400", border: "border-red-500/30" },
  "bg-destructive": { bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive/30" },
  "bg-muted": { bg: "bg-muted/50", text: "text-muted-foreground", border: "border-border" },
};

const getColorClasses = (color: string) =>
  COLOR_MAP[color] || { bg: "bg-primary/15", text: "text-primary", border: "border-primary/30" };

export default function DayViewDialog({
  open,
  onOpenChange,
  date,
  events,
  onAddEvent,
  onEditEvent,
  onNavigate,
}: DayViewDialogProps) {
  const { timedEvents, allDayEvents } = useMemo(() => {
    const timed = events
      .filter((e) => e.startTime)
      .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    const allDay = events.filter((e) => !e.startTime);
    return { timedEvents: timed, allDayEvents: allDay };
  }, [events]);

  if (!date) return null;

  const HOUR_HEIGHT = 64; // px per hour
  const START_HOUR = 7;
  const END_HOUR = 22;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary/10">
                <span className="text-[10px] font-semibold uppercase text-primary leading-none">
                  {format(date, "EEE")}
                </span>
                <span className="text-lg font-bold text-primary leading-none mt-0.5">
                  {format(date, "d")}
                </span>
              </div>
              <div>
                <DialogTitle className="text-base">
                  {format(date, "EEEE, MMMM d, yyyy")}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {events.length} event{events.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={onAddEvent}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* All-day events */}
          {allDayEvents.length > 0 && (
            <div className="px-5 py-3 border-b border-border space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All Day</p>
              {allDayEvents.map((event) => {
                const colors = getColorClasses(event.color);
                return (
                  <button
                    key={event.id}
                    onClick={() => event.rawEvent ? onEditEvent(event) : event.link ? onNavigate(event.link) : null}
                    className={`w-full text-left rounded-lg border ${colors.border} ${colors.bg} px-3 py-2 transition-all hover:brightness-95 dark:hover:brightness-110`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${event.color}`} />
                      <span className={`text-sm font-medium ${colors.text}`}>{event.title}</span>
                    </div>
                    {event.meta && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 ml-4">{event.meta}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Timeline */}
          <div className="relative px-5 py-3">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <CalIcon className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">No events this day</p>
                <Button variant="outline" size="sm" onClick={onAddEvent}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Event
                </Button>
              </div>
            ) : (
              <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 flex items-start"
                    style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                  >
                    <span className="w-12 shrink-0 text-[10px] text-muted-foreground -translate-y-1.5 text-right pr-3">
                      {formatHour(hour)}
                    </span>
                    <div className="flex-1 border-t border-border/50 h-0" />
                  </div>
                ))}

                {/* Timed event blocks */}
                {timedEvents.map((event) => {
                  const startMin = timeToMinutes(event.startTime!);
                  const endTimeStr = event.timeRange?.match(/–\s*(.+)/)?.[1];
                  let durationMin = 60; // default 1 hour
                  if (endTimeStr) {
                    // Parse end time from timeRange like "9:00 AM – 10:30 AM"
                    const endMatch = endTimeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                    if (endMatch) {
                      let endH = parseInt(endMatch[1]);
                      const endM = parseInt(endMatch[2]);
                      const period = endMatch[3].toUpperCase();
                      if (period === "PM" && endH !== 12) endH += 12;
                      if (period === "AM" && endH === 12) endH = 0;
                      durationMin = Math.max(endH * 60 + endM - startMin, 30);
                    }
                  }

                  const top = ((startMin / 60) - START_HOUR) * HOUR_HEIGHT;
                  const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 28);
                  const colors = getColorClasses(event.color);

                  return (
                    <button
                      key={event.id}
                      onClick={() => event.rawEvent ? onEditEvent(event) : event.link ? onNavigate(event.link) : null}
                      className={`absolute left-12 right-1 rounded-lg border ${colors.border} ${colors.bg} px-3 py-1.5 text-left transition-all hover:brightness-95 dark:hover:brightness-110 overflow-hidden z-10`}
                      style={{ top: Math.max(top, 0), height }}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-1 self-stretch rounded-full ${event.color} shrink-0 mt-0.5`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold truncate ${colors.text}`}>
                            {event.title}
                          </p>
                          {height > 36 && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {event.timeRange}
                              {event.meta ? ` · ${event.meta}` : ""}
                            </p>
                          )}
                          {height > 56 && event.description && (
                            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                              {event.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
