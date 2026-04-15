import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, Plus,
  Users, CheckSquare, FolderKanban, Phone, ExternalLink, Video, PhoneCall, Flag, Star, Clock, Mail,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  isSameDay, isToday, addMonths, subMonths, parseISO, startOfWeek, endOfWeek,
} from "date-fns";
import { motion } from "framer-motion";
import CalendarEventDialog from "@/components/calendar/CalendarEventDialog";
import DayViewDialog from "@/components/calendar/DayViewDialog";

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  type: "follow_up" | "task_deadline" | "project_milestone" | "meeting" | "custom" | "time_block" | "calendly" | "outlook";
  color: string;
  meta?: string;
  description?: string;
  timeRange?: string;
  startTime?: string;
  link?: string;
  rawEvent?: any;
}

const TYPE_CONFIG = {
  follow_up: { icon: Phone, label: "Follow-up", color: "text-primary", dotColor: "bg-primary" },
  task_deadline: { icon: CheckSquare, label: "Task", color: "text-emerald-500", dotColor: "bg-emerald-500" },
  project_milestone: { icon: FolderKanban, label: "Project", color: "text-purple-500", dotColor: "bg-purple-500" },
  meeting: { icon: Users, label: "Meeting", color: "text-blue-500", dotColor: "bg-blue-500" },
  custom: { icon: Star, label: "Event", color: "text-amber-500", dotColor: "bg-amber-500" },
  time_block: { icon: Clock, label: "Time Block", color: "text-teal-500", dotColor: "bg-teal-500" },
  calendly: { icon: Video, label: "Calendly", color: "text-indigo-500", dotColor: "bg-indigo-500" },
  outlook: { icon: Mail, label: "Outlook", color: "text-blue-600", dotColor: "bg-blue-600" },
} as const;

const CUSTOM_TYPE_ICONS: Record<string, typeof Star> = {
  meeting: Users,
  content_shoot: Video,
  call: PhoneCall,
  deadline: Flag,
  other: Star,
};

type EventType = keyof typeof TYPE_CONFIG;

const formatEventTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return format(new Date(2000, 0, 1, hours, minutes), "h:mm a");
};

export default function AdminCalendar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(
    new Set(["follow_up", "task_deadline", "project_milestone", "meeting", "custom", "time_block", "calendly", "outlook"])
  );
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [dayViewOpen, setDayViewOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const dragEventRef = useRef<CalendarEvent | null>(null);

  const rescheduleMutation = useMutation({
    mutationFn: async ({ eventId, newDate }: { eventId: string; newDate: string }) => {
      const { error } = await supabase
        .from("calendar_events")
        .update({ event_date: newDate })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-custom-events"] });
      toast.success("Event rescheduled");
    },
    onError: (err: any) => toast.error(err.message),
  });

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

  const { data: tasks = [] } = useQuery({
    queryKey: ["calendar-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, client_id, description")
        .not("due_date", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["calendar-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const clientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) map.set(c.id, c.name);
    return map;
  }, [clients]);

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

  // Fetch custom calendar events
  const { data: customEvents = [] } = useQuery({
    queryKey: ["calendar-custom-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .order("event_date");
      if (error) throw error;
      return data;
    },
  });

  // Fetch time entries (timesheet data)
  const { data: timeEntries = [] } = useQuery({
    queryKey: ["calendar-time-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, entry_date, start_time, end_time, description, category, user_id")
        .order("entry_date");
      if (error) throw error;
      return data;
    },
  });

  const allEvents = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    for (const lead of leads) {
      if (lead.follow_up_start) {
        result.push({
          id: `followup-start-${lead.id}`, date: parseISO(lead.follow_up_start),
          title: `Follow up: ${lead.name}`, type: "follow_up", color: "bg-primary",
          meta: lead.follow_up_end
            ? `Window: ${format(parseISO(lead.follow_up_start), "MMM d")} – ${format(parseISO(lead.follow_up_end), "MMM d")}`
            : undefined,
          link: `/admin/leads`,
        });
      }
      if (lead.follow_up_end && lead.follow_up_end !== lead.follow_up_start) {
        result.push({
          id: `followup-end-${lead.id}`, date: parseISO(lead.follow_up_end),
          title: `Follow-up closes: ${lead.name}`, type: "follow_up", color: "bg-amber-500",
          link: `/admin/leads`,
        });
      }
    }

    for (const task of tasks) {
      if (task.due_date) {
        const clientName = task.client_id ? clientMap.get(task.client_id) : null;
        const isDone = task.status === "done";
        result.push({
          id: `task-${task.id}`, date: parseISO(task.due_date), title: task.title,
          type: "task_deadline",
          color: isDone ? "bg-muted" : task.priority === "urgent" ? "bg-destructive" : task.priority === "high" ? "bg-amber-500" : "bg-emerald-500",
          meta: [isDone ? "✓ Done" : `${task.priority} priority · ${task.status}`, clientName ? `· ${clientName}` : ""].join(" "),
          description: task.description ?? undefined,
          link: "/ops/tasks",
        });
      }
    }

    for (const project of projects) {
      if (project.target_date) {
        const clientName = project.client_id ? clientMap.get(project.client_id) : null;
        result.push({
          id: `project-${project.id}`, date: parseISO(project.target_date),
          title: `${project.name} target`, type: "project_milestone",
          color: project.status === "completed" ? "bg-muted" : "bg-purple-500",
          meta: [`Phase: ${project.current_phase?.replace("_", " ")}`, clientName ? `· ${clientName}` : ""].join(" "),
          link: "/admin/projects",
        });
      }
    }

    for (const meeting of meetings) {
      if (meeting.meeting_date) {
        const meetingDate = parseISO(meeting.meeting_date);
        const clientName = meeting.client_id ? clientMap.get(meeting.client_id) : null;
        result.push({
          id: `meeting-${meeting.id}`, date: meetingDate,
          title: meeting.title, type: "meeting", color: "bg-blue-500",
          meta: clientName ? clientName : undefined,
          timeRange: format(meetingDate, "h:mm a"),
          startTime: format(meetingDate, "HH:mm"),
          link: meeting.client_id ? `/admin/clients/${meeting.client_id}` : undefined,
        });
      }
    }

    // Custom calendar events (including calendly and outlook)
    for (const evt of customEvents) {
      const clientName = evt.client_id ? clientMap.get(evt.client_id) : null;
      const isVektiss = clientName?.toLowerCase() === "vektiss";
      const timeStr = evt.start_time
        ? `${formatEventTime(evt.start_time)}${evt.end_time ? ` – ${formatEventTime(evt.end_time)}` : ""}`
        : null;

      // Calendly events get their own type
      if (evt.event_type === "calendly") {
        result.push({
          id: `custom-${evt.id}`, date: parseISO(evt.event_date),
          title: evt.title, type: "calendly",
          color: isVektiss ? "bg-primary" : "bg-indigo-500",
          meta: clientName ?? undefined,
          timeRange: timeStr ? `${timeStr} CT` : undefined,
          startTime: evt.start_time ?? undefined,
          description: evt.description ?? undefined,
          rawEvent: evt,
        });
      } else if (evt.event_type === "outlook") {
        // Extract web link from description if available
        const linkMatch = evt.description?.match(/outlook_link:(.+)/);
        const outlookLink = linkMatch?.[1] || undefined;
        result.push({
          id: `custom-${evt.id}`, date: parseISO(evt.event_date),
          title: evt.title, type: "outlook",
          color: isVektiss ? "bg-primary" : "bg-blue-600",
          meta: clientName ?? "Outlook",
          timeRange: timeStr ? `${timeStr} CT` : undefined,
          startTime: evt.start_time ?? undefined,
          description: evt.description?.replace(/\noutlook_link:.+/, "") ?? undefined,
          link: outlookLink,
          rawEvent: evt,
        });
      } else {
        const defaultColor = evt.event_type === "content_shoot" ? "bg-orange-500"
          : evt.event_type === "call" ? "bg-sky-500"
          : evt.event_type === "deadline" ? "bg-red-500"
          : "bg-amber-500";
        result.push({
          id: `custom-${evt.id}`, date: parseISO(evt.event_date),
          title: evt.title, type: "custom",
          color: isVektiss ? "bg-primary" : defaultColor,
          meta: [clientName, evt.event_type.replace("_", " ")].filter(Boolean).join(" · "),
          timeRange: timeStr ? `${timeStr} CT` : undefined,
          startTime: evt.start_time ?? undefined,
          description: evt.description ?? undefined,
          rawEvent: evt,
        });
      }
    }

    // Time entries (timesheet blocks)
    for (const entry of timeEntries) {
      const timeStr = `${formatEventTime(entry.start_time)} – ${formatEventTime(entry.end_time)}`;
      const isVektiss = entry.category === "vektiss";
      result.push({
        id: `time-${entry.id}`,
        date: parseISO(entry.entry_date),
        title: entry.description,
        type: "time_block",
        color: isVektiss ? "bg-primary" : "bg-teal-500",
        meta: entry.category.replace("_", " "),
        timeRange: timeStr,
        startTime: entry.start_time,
        link: "/ops/timesheets",
      });
    }

    return result;
  }, [leads, tasks, projects, meetings, customEvents, timeEntries, clientMap]);

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

  const monthEvents = events.filter((e) => isSameMonth(e.date, currentMonth));
  const typeCounts = {
    follow_up: monthEvents.filter((e) => e.type === "follow_up").length,
    task_deadline: monthEvents.filter((e) => e.type === "task_deadline").length,
    project_milestone: monthEvents.filter((e) => e.type === "project_milestone").length,
    meeting: monthEvents.filter((e) => e.type === "meeting").length,
    custom: monthEvents.filter((e) => e.type === "custom").length,
    time_block: monthEvents.filter((e) => e.type === "time_block").length,
    calendly: monthEvents.filter((e) => e.type === "calendly").length,
    outlook: monthEvents.filter((e) => e.type === "outlook").length,
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  };

  const openNewEvent = (date?: Date) => {
    setEditingEvent(null);
    if (date) setSelectedDate(date);
    setEventDialogOpen(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    if (event.rawEvent) {
      setEditingEvent(event.rawEvent);
      setEventDialogOpen(true);
    } else if (event.link) {
      navigate(event.link);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground text-sm">Follow-ups, deadlines, milestones, meetings & events · <span className="font-medium">Central Time (CT)</span></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
          <Button size="sm" onClick={() => openNewEvent(selectedDate ?? new Date())}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        </div>
      </motion.div>

      {/* Filter + summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {([
          { key: "follow_up" as EventType, count: typeCounts.follow_up },
          { key: "task_deadline" as EventType, count: typeCounts.task_deadline },
          { key: "project_milestone" as EventType, count: typeCounts.project_milestone },
          { key: "meeting" as EventType, count: typeCounts.meeting },
          { key: "custom" as EventType, count: typeCounts.custom },
          { key: "time_block" as EventType, count: typeCounts.time_block },
          { key: "calendly" as EventType, count: typeCounts.calendly },
          { key: "outlook" as EventType, count: typeCounts.outlook },
        ]).map((item, i) => {
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

      <div className="grid grid-cols-1 gap-6">
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
              <div className="grid grid-cols-7 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const todayFlag = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => { setSelectedDate(day); setDayViewOpen(true); }}
                      onDoubleClick={() => openNewEvent(day)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverDay(day.toISOString());
                      }}
                      onDragLeave={() => setDragOverDay(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverDay(null);
                        const evt = dragEventRef.current;
                        if (evt?.rawEvent && !isSameDay(evt.date, day)) {
                          rescheduleMutation.mutate({
                            eventId: evt.rawEvent.id,
                            newDate: format(day, "yyyy-MM-dd"),
                          });
                        }
                        dragEventRef.current = null;
                      }}
                      className={`group relative p-1 min-h-[64px] sm:min-h-[80px] border border-border/50 text-left transition-colors hover:bg-accent/20 cursor-pointer
                        ${!isCurrentMonth ? "opacity-30" : ""}
                        ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : ""}
                        ${dragOverDay === day.toISOString() ? "bg-primary/20 ring-2 ring-primary/50" : ""}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium block mb-0.5 ${
                          todayFlag ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : ""
                        }`}>
                          {format(day, "d")}
                        </span>
                        {isCurrentMonth && (
                          <span
                            className="hidden group-hover:flex h-5 w-5 rounded items-center justify-center bg-primary/10 text-primary cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); openNewEvent(day); }}
                          >
                            <Plus className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="hidden sm:block space-y-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            draggable={!!e.rawEvent}
                            onDragStart={(ev) => {
                              if (!e.rawEvent) { ev.preventDefault(); return; }
                              dragEventRef.current = e;
                              ev.dataTransfer.effectAllowed = "move";
                            }}
                            className={`${e.color} text-white text-[9px] leading-tight rounded px-1 py-0.5 truncate ${e.rawEvent ? "cursor-grab active:cursor-grabbing" : ""}`}
                          >
                            {e.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5 sm:hidden mt-0.5">
                          {dayEvents.slice(0, 4).map((e) => {
                            return <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${e.color}`} />;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

      </div>

      <DayViewDialog
        open={dayViewOpen}
        onOpenChange={setDayViewOpen}
        date={selectedDate}
        events={selectedEvents as any[]}
        onAddEvent={() => { setDayViewOpen(false); openNewEvent(selectedDate ?? new Date()); }}
        onEditEvent={(event: any) => { setDayViewOpen(false); openEditEvent(event as CalendarEvent); }}
        onNavigate={(link) => { setDayViewOpen(false); navigate(link); }}
      />

      <CalendarEventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        selectedDate={selectedDate}
        editingEvent={editingEvent}
      />
    </div>
  );
}
