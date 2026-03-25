import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";

const EVENT_TYPES = [
  { value: "meeting", label: "Meeting" },
  { value: "content_shoot", label: "Content Shoot" },
  { value: "call", label: "Call" },
  { value: "deadline", label: "Deadline" },
  { value: "other", label: "Other" },
] as const;

const TIME_OPTIONS = (() => {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const label = `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
})();

interface CalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | null;
  editingEvent?: {
    id: string;
    title: string;
    description: string | null;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    event_type: string;
    client_id: string | null;
  } | null;
}

export default function CalendarEventDialog({
  open, onOpenChange, selectedDate, editingEvent,
}: CalendarEventDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [eventType, setEventType] = useState("meeting");
  const [clientId, setClientId] = useState<string>("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-event"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (editingEvent) {
      setTitle(editingEvent.title);
      setDescription(editingEvent.description ?? "");
      setEventDate(editingEvent.event_date);
      setStartTime(editingEvent.start_time ?? "");
      setEndTime(editingEvent.end_time ?? "");
      setEventType(editingEvent.event_type);
      setClientId(editingEvent.client_id ?? "");
    } else {
      setTitle("");
      setDescription("");
      setEventDate(selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");
      setStartTime("");
      setEndTime("");
      setEventType("meeting");
      setClientId("");
    }
  }, [editingEvent, selectedDate, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description: description || null,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        event_type: eventType,
        client_id: (clientId && clientId !== "none") ? clientId : null,
        created_by: user!.id,
      };

      if (editingEvent) {
        const { error } = await supabase
          .from("calendar_events")
          .update(payload)
          .eq("id", editingEvent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("calendar_events")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-custom-events"] });
      toast.success(editingEvent ? "Event updated" : "Event created");
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editingEvent) return;
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", editingEvent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-custom-events"] });
      toast.success("Event deleted");
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingEvent ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="event-title">Title *</Label>
            <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Content shoot with Steve" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="event-type">Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="event-client">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="event-date">Date *</Label>
            <Input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start-time">Start time</Label>
              <Select value={startTime || "none"} onValueChange={(v) => setStartTime(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No start time" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">No start time</SelectItem>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="end-time">End time</Label>
              <Select value={endTime || "none"} onValueChange={(v) => setEndTime(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No end time" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">No end time</SelectItem>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="event-desc">Notes</Label>
            <Textarea id="event-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional details..." />
          </div>

          <div className="flex items-center gap-2 pt-2">
            {editingEvent && (
              <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!title.trim() || !eventDate || saveMutation.isPending}>
              {editingEvent ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
