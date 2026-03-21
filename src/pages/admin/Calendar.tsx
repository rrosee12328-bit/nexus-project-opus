import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon,
  Users, CheckSquare, FolderKanban, Phone, ExternalLink,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isSameDay, isToday, addMonths, subMonths, parseISO, startOfWeek, endOfWeek,
} from "date-fns";
import { motion } from "framer-motion";

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  type: "follow_up" | "task_deadline" | "project_milestone" | "meeting";
  color: string;
  meta?: string;
  link?: string;
}

const TYPE_CONFIG = {
  follow_up: { icon: Phone, label: "Follow-up", color: "text-primary", dotColor: "bg-primary" },
  task_deadline: { icon: CheckSquare, label: "Task", color: "text-emerald-500", dotColor: "bg-emerald-500" },
  project_milestone: { icon: FolderKanban, label: "Project", color: "text-purple-500", dotColor: "bg-purple-500" },
  meeting: { icon: Users, label: "Meeting", color: "text-blue-500", dotColor: "bg-blue-500" },
} as const;

type EventType = keyof typeof TYPE_CONFIG;

export default function AdminCalendar() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(
    new Set(["follow_up", "task_deadline", "project_milestone", "meeting"])
  );

  const toggleFilter = (type: EventType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Fetch leads with follow-up windows
  const { data: leads = [] } = useQuery({
    queryKey: ["calendar-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, follow_up_start, follow_up_end, last_contact_date, pipeline_stage, status")
        .or("status.eq.lead,status.eq.prospect");
      if (error) throw error;
      return data;
    },
  });

  // Fetch tasks with due dates (include all statuses for full visibility)
  const { data: tasks = [] } = useQuery({
    queryKey: ["calendar-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, client_id")
        .not("due_date", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Fetch client names for task context
  const { data: clients = [] } = useQuery({
    queryKey: ["calendar-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) map.set(c.id, c.name);
    return map;
  }, [clients]);

  // Fetch projects with target dates
  const { data: projects = [] } = useQuery({
    queryKey: ["calendar-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, target_date, current_phase, status, client_id")
        .not("target_date", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Fetch meetings from client notes
  const { data: meetings = [] } = useQuery({
    queryKey: ["calendar-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("id, title, meeting_date, client_id")
        .eq("type", "meeting")
        .not("meeting_date", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Build calendar events
  const allEvents = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    // Follow-up windows
    for (const lead of leads) {
      if (lead.follow_up_start) {
        result.push({
          id: `followup-start-${lead.id}`,
          date: parseISO(lead.follow_up_start),
          title: `Follow up: ${lead.name}`,
          type: "follow_up",
          color: "bg-primary",
          meta: lead.follow_up_end
            ? `Window: ${format(parseISO(lead.follow_up_start), "MMM d")} – ${format(parseISO(lead.follow_up_end), "MMM d")}`
            : undefined,
          link: `/admin/leads`,
        });
      }
      if (lead.follow_up_end && lead.follow_up_end !== lead.follow_up_start) {
        result.push({
          id: `followup-end-${lead.id}`,
          date: parseISO(lead.follow_up_end),
          title: `Follow-up closes: ${lead.name}`,
          type: "follow_up",
          color: "bg-amber-500",
          link: `/admin/leads`,
        });
      }
    }

    // Task deadlines
    for (const task of tasks) {
      if (task.due_date) {
        const clientName = task.client_id ? clientMap.get(task.client_id) : null;
        const isDone = task.status === "done";
        result.push({
          id: `task-${task.id}`,
          date: parseISO(task.due_date),
          title: task.title,
          type: "task_deadline",
          color: isDone
            ? "bg-muted"
            : task.priority === "urgent"
            ? "bg-destructive"
            : task.priority === "high"
            ? "bg-amber-500"
            : "bg-emerald-500",
          meta: [
            isDone ? "✓ Done" : `${task.priority} priority · ${task.status}`,
            clientName ? `· ${clientName}` : "",
          ].join(" "),
          link: "/ops/tasks",
        });
      }
    }

    // Project milestones
    for (const project of projects) {
      if (project.target_date) {
        const clientName = project.client_id ? clientMap.get(project.client_id) : null;
        result.push({
          id: `project-${project.id}`,
          date: parseISO(project.target_date),
          title: `${project.name} target`,
          type: "project_milestone",
          color: project.status === "completed" ? "bg-muted" : "bg-purple-500",
          meta: [
            `Phase: ${project.current_phase?.replace("_", " ")}`,
            clientName ? `· ${clientName}` : "",
          ].join(" "),
          link: "/admin/projects",
        });
      }
    }

    // Meetings
    for (const meeting of meetings) {
      if (meeting.meeting_date) {
        const clientName = meeting.client_id ? clientMap.get(meeting.client_id) : null;
        result.push({
          id: `meeting-${meeting.id}`,
          date: parseISO(meeting.meeting_date),
          title: meeting.title,
          type: "meeting",
          color: "bg-blue-500",
          meta: clientName ? clientName : undefined,
          link: meeting.client_id ? `/admin/clients/${meeting.client_id}` : undefined,
        });
      }
    }

    return result;
  }, [leads, tasks, projects, meetings, clientMap]);

  // Apply filters
  const events = useMemo(
    () => allEvents.filter((e) => activeFilters.has(e.type)),
    [allEvents, activeFilters]
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day: Date) => events.filter((e) => isSameDay(e.date, day));
  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  // Summary counts for this month
  const monthEvents = events.filter((e) => isSameMonth(e.date, currentMonth));
  const typeCounts = {
    follow_up: monthEvents.filter((e) => e.type === "follow_up").length,
    task_deadline: monthEvents.filter((e) => e.type === "task_deadline").length,
    project_milestone: monthEvents.filter((e) => e.type === "project_milestone").length,
    meeting: monthEvents.filter((e) => e.type === "meeting").length,
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground text-sm">Follow-ups, deadlines, milestones & meetings</p>
        </div>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Today
        </Button>
      </motion.div>

      {/* Filter + summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            { key: "follow_up" as EventType, count: typeCounts.follow_up },
            { key: "task_deadline" as EventType, count: typeCounts.task_deadline },
            { key: "project_milestone" as EventType, count: typeCounts.project_milestone },
            { key: "meeting" as EventType, count: typeCounts.meeting },
          ] as const
        ).map((item, i) => {
          const cfg = TYPE_CONFIG[item.key];
          const active = activeFilters.has(item.key);
          return (
            <motion.div key={item.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
              <Card
                className={`cursor-pointer transition-all ${active ? "ring-1 ring-primary/30" : "opacity-50"}`}
                onClick={() => toggleFilter(item.key)}
              >
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono">{item.count}</p>
                    <p className="text-xs text-muted-foreground">{cfg.label}s</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Calendar grid */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-lg">{format(currentMonth, "MMMM yyyy")}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                    {d}
                  </div>
                ))}
              </div>
              {/* Days */}
              <div className="grid grid-cols-7">
                {calendarDays.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const today = isToday(day);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`relative p-1 min-h-[64px] sm:min-h-[80px] border border-border/50 text-left transition-colors hover:bg-accent/20
                        ${!isCurrentMonth ? "opacity-30" : ""}
                        ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : ""}
                      `}
                    >
                      <span
                        className={`text-xs font-medium block mb-0.5 ${
                          today
                            ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                            : ""
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      {/* Event dots for mobile, labels for desktop */}
                      <div className="hidden sm:block space-y-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className={`${e.color} text-white text-[9px] leading-tight rounded px-1 py-0.5 truncate`}
                          >
                            {e.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                      {/* Dots for mobile */}
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5 sm:hidden mt-0.5">
                          {dayEvents.slice(0, 4).map((e) => {
                            const dotCfg = TYPE_CONFIG[e.type];
                            return <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${dotCfg.dotColor}`} />;
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Selected day detail */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="sticky top-20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalIcon className="h-4 w-4 text-primary" />
                {selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <CalIcon className="h-5 w-5 text-primary/40" />
                  </div>
                  <p className="text-xs text-muted-foreground">No events this day</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3">
                    {selectedEvents.map((event) => {
                      const cfg = TYPE_CONFIG[event.type];
                      return (
                        <div
                          key={event.id}
                          className={`flex gap-3 items-start rounded-lg border border-border p-3 transition-colors ${
                            event.link ? "hover:bg-accent/30 cursor-pointer" : ""
                          }`}
                          onClick={() => event.link && navigate(event.link)}
                        >
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight">{event.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {cfg.label}
                              </Badge>
                              {event.meta && (
                                <span className="text-[10px] text-muted-foreground">{event.meta}</span>
                              )}
                            </div>
                          </div>
                          {event.link && (
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
