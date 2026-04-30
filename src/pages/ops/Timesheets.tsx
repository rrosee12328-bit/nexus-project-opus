import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Clock, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TimesheetDashboard from "./TimesheetDashboard";

const CATEGORIES = [
  { value: "client_work", label: "Client Work" },
  { value: "sales", label: "Sales" },
  { value: "admin", label: "Admin" },
  { value: "vektiss", label: "Vektiss" },
  { value: "break", label: "Break" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
] as const;

// Legacy + TC code category colours
const categoryColors: Record<string, string> = {
  client_work: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  sales: "bg-green-500/20 text-green-400 border-green-500/30",
  admin: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  vektiss: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  break: "bg-muted text-muted-foreground border-border",
  meeting: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  other: "bg-muted text-muted-foreground border-border",
  // TC code categories
  "Pre-Sale": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Delivery: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Communications: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  Travel: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type TimeTrackingCode = {
  id: string;
  code: string;
  category: string;
  phase: string | null;
  label: string;
  is_billable: boolean;
};

type TimeEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  hours: number;
  description: string;
  category: string;
  time_code_id?: string | null;
};

type FormData = {
  entry_date: string;
  start_time: string;
  end_time: string;
  description: string;
  category: string;
  time_code_id: string;
};

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
  return Math.max(0, Math.round(diff * 100) / 100);
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export default function Timesheets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [form, setForm] = useState<FormData>({
    entry_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "10:00",
    description: "",
    category: "other",
    time_code_id: "",
  });

  const currentWeekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekLabel = `${format(currentWeekStart, "MMM d")} – ${format(currentWeekEnd, "MMM d, yyyy")}`;

  // Fetch TC time tracking codes
  const { data: timeCodes = [] } = useQuery({
    queryKey: ["time-tracking-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_tracking_codes" as any)
        .select("id, code, category, phase, label, is_billable")
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (error) {
        console.warn("time_tracking_codes table not available:", error.message);
        return [] as TimeTrackingCode[];
      }
      return (data || []) as unknown as TimeTrackingCode[];
    },
  });

  // Fetch all team members (profiles with ops or admin role)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["timesheet-team"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "ops"]);
      if (!roles?.length) return [];
      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      return (profiles || []).map((p) => ({
        ...p,
        role: roles.find((r) => r.user_id === p.user_id)?.role || "ops",
      }));
    },
  });

  // Fetch time entries for the selected week
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["time-entries", format(currentWeekStart, "yyyy-MM-dd"), selectedUserId],
    queryFn: async () => {
      let query = supabase
        .from("time_entries")
        .select("*")
        .gte("entry_date", format(currentWeekStart, "yyyy-MM-dd"))
        .lte("entry_date", format(currentWeekEnd, "yyyy-MM-dd"))
        .order("entry_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (selectedUserId !== "all") {
        query = query.eq("user_id", selectedUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TimeEntry[];
    },
  });

  const isViewingSelf = selectedUserId === "all" || selectedUserId === user?.id;

  const addMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const dayIndex = parseISO(data.entry_date).getDay();
      const payload: any = {
        user_id: user!.id,
        entry_date: data.entry_date,
        day_of_week: DAY_NAMES[dayIndex],
        start_time: data.start_time,
        end_time: data.end_time,
        hours: calcHours(data.start_time, data.end_time),
        description: data.description,
        category: data.category as any,
        time_code_id: data.time_code_id || null,
      };
      const { error } = await supabase.from("time_entries").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast.success("Time entry added");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const dayIndex = parseISO(data.entry_date).getDay();
      const payload: any = {
        entry_date: data.entry_date,
        day_of_week: DAY_NAMES[dayIndex],
        start_time: data.start_time,
        end_time: data.end_time,
        hours: calcHours(data.start_time, data.end_time),
        description: data.description,
        category: data.category as any,
        time_code_id: data.time_code_id || null,
      };
      const { error } = await supabase.from("time_entries").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast.success("Time entry updated");
      setDialogOpen(false);
      setEditingEntry(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast.success("Entry deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Group entries by date
  const groupedEntries = useMemo(() => {
    const groups: Record<string, TimeEntry[]> = {};
    entries.forEach((e) => {
      if (!groups[e.entry_date]) groups[e.entry_date] = [];
      groups[e.entry_date].push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours), 0);

  const openAdd = () => {
    setEditingEntry(null);
    setForm({
      entry_date: format(new Date(), "yyyy-MM-dd"),
      start_time: "09:00",
      end_time: "10:00",
      description: "",
      category: "other",
      time_code_id: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setForm({
      entry_date: entry.entry_date,
      start_time: entry.start_time.slice(0, 5),
      end_time: entry.end_time.slice(0, 5),
      description: entry.description,
      category: entry.category,
      time_code_id: entry.time_code_id || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.description.trim()) {
      toast.error("Please add a description");
      return;
    }
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data: form });
    } else {
      addMutation.mutate(form);
    }
  };

  const getUserName = (userId: string) => {
    const member = teamMembers.find((m) => m.user_id === userId);
    return member?.display_name || "Unknown";
  };

  // Resolve TC code label/color for a given entry
  const getCodeLabel = (entry: TimeEntry): { label: string; color: string } => {
    if (entry.time_code_id) {
      const tc = timeCodes.find((c) => c.id === entry.time_code_id);
      if (tc) {
        return {
          label: `${tc.code} · ${tc.label}`,
          color: categoryColors[tc.category] || "",
        };
      }
    }
    const legacy = CATEGORIES.find((c) => c.value === entry.category);
    return {
      label: legacy?.label || entry.category,
      color: categoryColors[entry.category] || "",
    };
  };

  // Group TC codes by category for the dropdown
  const codesByCategory = useMemo(() => {
    const groups: Record<string, TimeTrackingCode[]> = {};
    timeCodes.forEach((tc) => {
      if (!groups[tc.category]) groups[tc.category] = [];
      groups[tc.category].push(tc);
    });
    return groups;
  }, [timeCodes]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Timesheets</h1>
          <p className="text-sm text-muted-foreground">Track and document work hours per task</p>
        </div>
        <Button onClick={openAdd} size="sm" disabled={!isViewingSelf}>
          <Plus className="h-4 w-4 mr-1" /> Log Time
        </Button>
      </div>

      <Tabs defaultValue="log" className="space-y-4">
        <TabsList>
          <TabsTrigger value="log" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Log Hours</TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[200px] text-center">
            {weekLabel}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              This Week
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All team members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team Members</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.display_name || "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Card className="bg-card border-border px-4 py-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{totalHours.toFixed(2)} hrs</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Time Log Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : groupedEntries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No time entries for this week. Click "Log Time" to add one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead className="w-[50px]">Day</TableHead>
                  <TableHead className="w-[90px]">Start</TableHead>
                  <TableHead className="w-[90px]">End</TableHead>
                  <TableHead className="w-[60px] text-right">Hrs</TableHead>
                  <TableHead>Task / Description</TableHead>
                  <TableHead className="w-[180px]">Cost Code</TableHead>
                  {selectedUserId === "all" && <TableHead className="w-[120px]">Employee</TableHead>}
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedEntries.map(([date, dayEntries]) => {
                  const dayTotal = dayEntries.reduce((s, e) => s + Number(e.hours), 0);
                  const parsed = parseISO(date);
                  const dateStr = format(parsed, "MM/dd/yy");
                  const dayName = format(parsed, "EEE");

                  return (
                    <React.Fragment key={date}>
                      {/* Day header */}
                      <TableRow className="bg-secondary/50 border-border hover:bg-secondary/50">
                        <TableCell colSpan={selectedUserId === "all" ? 9 : 8} className="py-2">
                          <span className="font-semibold text-foreground">
                            {dateStr} {dayName}
                          </span>
                        </TableCell>
                      </TableRow>
                      {/* Entries */}
                      {dayEntries.map((entry) => {
                        const { label: codeLabel, color: codeColor } = getCodeLabel(entry);
                        return (
                          <TableRow key={entry.id} className="border-border hover:bg-muted/30 group">
                            <TableCell className="text-muted-foreground text-sm">{dateStr}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{dayName}</TableCell>
                            <TableCell className="text-sm">{formatTime12(entry.start_time)}</TableCell>
                            <TableCell className="text-sm">{formatTime12(entry.end_time)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{Number(entry.hours).toFixed(2)}</TableCell>
                            <TableCell className="text-sm max-w-[400px]">
                              <span className="line-clamp-2">{entry.description}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={codeColor}>
                                {codeLabel}
                              </Badge>
                            </TableCell>
                            {selectedUserId === "all" && (
                              <TableCell className="text-sm text-muted-foreground">
                                {getUserName(entry.user_id)}
                              </TableCell>
                            )}
                            <TableCell>
                              {entry.user_id === user?.id && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(entry.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Day total */}
                      <TableRow className="border-border hover:bg-transparent">
                        <TableCell colSpan={4} />
                        <TableCell className="text-right font-mono font-semibold text-sm text-primary">
                          {dayTotal.toFixed(2)}
                        </TableCell>
                        <TableCell colSpan={selectedUserId === "all" ? 4 : 3} />
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Time Entry" : "Log Time"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            {form.start_time && form.end_time && (
              <p className="text-xs text-muted-foreground">
                Duration: <span className="font-semibold text-foreground">{calcHours(form.start_time, form.end_time).toFixed(2)} hrs</span>
              </p>
            )}
            <div>
              <Label>Task / Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What did you work on?"
                rows={3}
              />
            </div>

            {/* TC Code dropdown — pulls from time_tracking_codes table */}
            {timeCodes.length > 0 ? (
              <div>
                <Label>
                  Cost Code <span className="text-xs text-muted-foreground font-normal">(TC-###)</span>
                </Label>
                <Select
                  value={form.time_code_id}
                  onValueChange={(v) => {
                    const tc = timeCodes.find((c) => c.id === v);
                    setForm({ ...form, time_code_id: v, category: tc?.category || form.category });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cost code…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(codesByCategory).map(([cat, codes]) => (
                      <div key={cat}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {cat}
                        </div>
                        {codes.map((tc) => (
                          <SelectItem key={tc.id} value={tc.id}>
                            <span className="font-mono text-xs font-semibold mr-2">{tc.code}</span>
                            {tc.label}
                            {!tc.is_billable && (
                              <span className="ml-2 text-[10px] text-muted-foreground">(non-billable)</span>
                            )}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // Fallback to legacy category dropdown
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={addMutation.isPending || updateMutation.isPending}>
              {editingEntry ? "Update" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}