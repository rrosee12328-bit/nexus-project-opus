import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Plus, Video, FileText, CircleDot, StickyNote,
  Pencil, Trash2, Loader2, ExternalLink, Calendar, Users, CheckCircle2, Clock,
  Link as LinkIcon, ChevronDown, ChevronUp, Briefcase, FileSignature,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import AdminClientBilling from "@/components/admin/AdminClientBilling";
import { format, formatDistanceToNow } from "date-fns";
import { SendProposalDialog } from "@/components/proposals/SendProposalDialog";

type NoteType = "meeting" | "document" | "action_item" | "note";

interface ClientNote {
  id: string;
  client_id: string;
  type: NoteType;
  title: string;
  content: string | null;
  meeting_date: string | null;
  attendees: string[];
  url: string | null;
  file_path: string | null;
  status: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const NOTE_TYPES: { value: NoteType; label: string; icon: typeof Video; color: string }[] = [
  { value: "meeting", label: "Meeting", icon: Video, color: "text-blue-500" },
  { value: "document", label: "Document / Link", icon: FileText, color: "text-emerald-500" },
  { value: "action_item", label: "Action Item", icon: CircleDot, color: "text-amber-500" },
  { value: "note", label: "Note", icon: StickyNote, color: "text-purple-500" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", color: "text-amber-500" },
  { value: "waiting", label: "Waiting on Client", color: "text-blue-500" },
  { value: "in_progress", label: "In Progress", color: "text-primary" },
  { value: "completed", label: "Completed", color: "text-success" },
];

interface NoteForm {
  type: NoteType;
  title: string;
  content: string;
  meeting_date: string;
  attendees: string;
  url: string;
  status: string;
  due_date: string;
}

const emptyForm: NoteForm = {
  type: "note",
  title: "",
  content: "",
  meeting_date: "",
  attendees: "",
  url: "",
  status: "pending",
  due_date: "",
};

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NoteForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ClientNote | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [reportExpanded, setReportExpanded] = useState(true);
  const [proposalOpen, setProposalOpen] = useState(false);

  const { data: client } = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", clientId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["client-notes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientNote[];
    },
    enabled: !!clientId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required");
      const payload: any = {
        client_id: clientId,
        type: form.type,
        title: form.title.trim(),
        content: form.content.trim() || null,
        meeting_date: form.meeting_date || null,
        attendees: form.attendees ? form.attendees.split(",").map((a: string) => a.trim()).filter(Boolean) : [],
        url: form.url.trim() || null,
        status: form.type === "action_item" ? form.status : null,
        due_date: form.due_date || null,
        created_by: user?.id,
      };
      if (editingId) {
        delete payload.created_by;
        const { error } = await supabase.from("client_notes").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_notes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Entry updated" : "Entry added");
      queryClient.invalidateQueries({ queryKey: ["client-notes", clientId] });
      const typeLabel = NOTE_TYPES.find((t) => t.value === form.type)?.label ?? form.type;
      logActivity(
        editingId ? "updated_client_note" : "created_client_note",
        "client_note",
        clientId ?? null,
        `${editingId ? "Updated" : "Added"} ${typeLabel}: "${form.title}" for ${client?.name ?? "client"}`,
      );
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      queryClient.invalidateQueries({ queryKey: ["client-notes", clientId] });
      logActivity("deleted_client_note", "client_note", clientId ?? null, `Deleted note for ${client?.name ?? "client"}`);
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete"),
  });

  const toggleActionStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("client_notes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", clientId] });
    },
  });

  const openCreate = (type: NoteType = "note") => {
    setEditingId(null);
    setForm({ ...emptyForm, type });
    setFormOpen(true);
  };

  const openEdit = (note: ClientNote) => {
    setEditingId(note.id);
    setForm({
      type: note.type as NoteType,
      title: note.title,
      content: note.content ?? "",
      meeting_date: note.meeting_date ? note.meeting_date.split("T")[0] : "",
      attendees: note.attendees?.join(", ") ?? "",
      url: note.url ?? "",
      status: note.status ?? "pending",
      due_date: note.due_date ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const filtered = activeTab === "all" ? notes : notes.filter((n) => n.type === activeTab);

  const typeCounts = {
    all: notes.length,
    meeting: notes.filter((n) => n.type === "meeting").length,
    document: notes.filter((n) => n.type === "document").length,
    action_item: notes.filter((n) => n.type === "action_item").length,
    note: notes.filter((n) => n.type === "note").length,
  };

  const pendingActions = notes.filter((n) => n.type === "action_item" && n.status !== "completed").length;

  const getTypeConfig = (type: string) => NOTE_TYPES.find((t) => t.value === type) ?? NOTE_TYPES[3];

  const normalizeLegacyDateCopy = (value: string | null | undefined) => {
    if (!value) return value ?? "";

    return value
      .replace(/March\s*3\s*[–-]\s*7/gi, "March 23-27")
      .replace(/March\s*3rd\s+and\s+March\s*7th/gi, "March 23rd and March 27th")
      .replace(/March\s*3\s+and\s+March\s*7/gi, "March 23 and March 27");
  };

  return (
    <div className="space-y-6">
      <AICommandCenter pageContext={{ pageType: "client-detail", title: "Client Detail", entityId: clientId, entityName: client?.name }} />
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-start sm:items-center gap-3 sm:gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/clients")} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{client?.name ?? "Client"}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {client?.type ?? "No type"} · {client?.email ?? "No email"}
            {client?.status && (
              <Badge variant="outline" className="ml-2 text-xs">{client.status}</Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={() => setProposalOpen(true)} size="sm" variant="outline">
            <FileSignature className="mr-2 h-4 w-4" /> Send Proposal
          </Button>
          <Button onClick={() => openCreate()} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add Entry
          </Button>
        </div>
      </motion.div>

      {/* Quick stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Total Entries", value: notes.length, icon: FileText, color: "text-foreground" },
          { label: "Meetings", value: typeCounts.meeting, icon: Video, color: "text-blue-500" },
          { label: "Pending Actions", value: pendingActions, icon: Clock, color: "text-amber-500" },
          { label: "Documents", value: typeCounts.document, icon: LinkIcon, color: "text-emerald-500" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Client Briefing / Report */}
      {notes.length > 0 && (() => {
        const latestReport = notes.find((n) => n.type === "document") ?? notes.find((n) => n.type === "note" && (n.content?.length ?? 0) > 200);
        const openActions = notes.filter((n) => n.type === "action_item" && n.status !== "completed");
        const pipelineStage = (client as any)?.pipeline_stage as string | null;
        const stageLabels: Record<string, string> = {
          new: "New Lead", discovery_call: "Discovery Call", due_diligence: "Due Diligence",
          proposal: "Proposal Sent", negotiation: "Negotiation", won: "Won", lost: "Lost",
        };
        const lastMeeting = notes.find((n) => n.type === "meeting" && n.meeting_date);
        const lastContactDate = lastMeeting?.meeting_date
          ? format(new Date(lastMeeting.meeting_date), "EEEE, MMMM d, yyyy")
          : null;

        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Where We're At</CardTitle>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {pipelineStage && stageLabels[pipelineStage] ? (
                          <Badge variant="outline" className="text-xs">{stageLabels[pipelineStage]}</Badge>
                        ) : null}
                        {lastContactDate && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Last contact: {lastContactDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setReportExpanded(!reportExpanded)}>
                    {reportExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              {reportExpanded && (
                <CardContent className="space-y-4">
                  {latestReport && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Latest Report</p>
                      <div className="rounded-lg border border-border bg-accent/20 p-4">
                        <p className="font-medium text-sm mb-1">{normalizeLegacyDateCopy(latestReport.title)}</p>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {normalizeLegacyDateCopy(latestReport.content) || "No content"}
                        </p>
                      </div>
                    </div>
                  )}

                  {openActions.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Open Action Items ({openActions.length})
                      </p>
                      <div className="space-y-2">
                        {openActions.map((action) => {
                          const statusCfg = STATUS_OPTIONS.find((s) => s.value === action.status);
                          return (
                            <div key={action.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                              <CircleDot className={`h-4 w-4 mt-0.5 shrink-0 ${statusCfg?.color ?? "text-amber-500"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{normalizeLegacyDateCopy(action.title)}</p>
                                {action.content && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{normalizeLegacyDateCopy(action.content)}</p>
                                )}
                              </div>
                              <Badge variant="outline" className={`text-xs shrink-0 ${statusCfg?.color ?? ""}`}>
                                {statusCfg?.label ?? action.status}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!latestReport && openActions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Add a document or action item to build this client's status report.
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          </motion.div>
        );
      })()}

      {/* Billing */}
      {client && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <AdminClientBilling
            clientId={client.id}
            clientName={client.name}
            stripeCustomerId={(client as any).stripe_customer_id ?? null}
          />
        </motion.div>
      )}

      {/* Tabs + timeline */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Card>
          <CardHeader className="pb-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">Activity & Records</CardTitle>
                <TabsList>
                  <TabsTrigger value="all">All ({typeCounts.all})</TabsTrigger>
                  <TabsTrigger value="meeting">
                    <Video className="h-3.5 w-3.5 mr-1" /> Meetings
                  </TabsTrigger>
                  <TabsTrigger value="document">
                    <FileText className="h-3.5 w-3.5 mr-1" /> Docs
                  </TabsTrigger>
                  <TabsTrigger value="action_item">
                    <CircleDot className="h-3.5 w-3.5 mr-1" /> Actions
                  </TabsTrigger>
                  <TabsTrigger value="note">
                    <StickyNote className="h-3.5 w-3.5 mr-1" /> Notes
                  </TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </CardHeader>
          <CardContent>
            {notesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <StickyNote className="h-8 w-8 text-primary/40" />
                </div>
                <p className="font-semibold">No entries yet</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Start documenting meetings, decisions, and action items to build a complete picture of this client.
                </p>
                <div className="flex gap-2 flex-wrap justify-center mt-2">
                  {NOTE_TYPES.map((t) => (
                    <Button key={t.value} variant="outline" size="sm" onClick={() => openCreate(t.value)}>
                      <t.icon className={`h-3.5 w-3.5 mr-1.5 ${t.color}`} /> {t.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((note) => {
                  const cfg = getTypeConfig(note.type);
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={note.id}
                      className={`group relative flex gap-4 rounded-lg border p-4 transition-colors cursor-pointer ${
                        expandedNote === note.id ? "border-primary/40 bg-accent/40" : "border-border hover:bg-accent/30"
                      }`}
                      onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                    >
                      <div className={`h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 ${cfg.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium leading-tight">{normalizeLegacyDateCopy(note.title)}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Badge variant="secondary" className="text-xs">{cfg.label}</Badge>
                              {note.type === "action_item" && note.status && (
                                <Badge
                                  variant="outline"
                                  className={`text-xs cursor-pointer ${STATUS_OPTIONS.find((s) => s.value === note.status)?.color ?? ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleActionStatus.mutate({
                                      id: note.id,
                                      status: note.status === "completed" ? "pending" : "completed",
                                    });
                                  }}
                                >
                                  {note.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                  {STATUS_OPTIONS.find((s) => s.value === note.status)?.label ?? note.status}
                                </Badge>
                              )}
                              {note.due_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Due {format(new Date(note.due_date + "T00:00:00"), "MMM d, yyyy")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(note); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(note); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {note.meeting_date && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(note.meeting_date), "MMM d, yyyy 'at' h:mm a")}
                            {note.attendees?.length > 0 && (
                              <span className="ml-2 flex items-center gap-1">
                                <Users className="h-3 w-3" /> {note.attendees.join(", ")}
                              </span>
                            )}
                          </p>
                        )}

                        {note.content && expandedNote !== note.id && (
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-2">
                            {normalizeLegacyDateCopy(note.content)}
                          </p>
                        )}

                        {note.content && expandedNote === note.id && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                              {normalizeLegacyDateCopy(note.content)}
                            </p>
                          </div>
                        )}

                        {note.url && (
                          <a
                            href={note.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" /> {note.url.length > 60 ? note.url.slice(0, 60) + "..." : note.url}
                          </a>
                        )}

                        <p className="text-xs text-muted-foreground/60 pt-1">
                          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                          {expandedNote !== note.id && note.content && note.content.length > 150 && (
                            <span className="ml-2 text-primary">Click to read full entry</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm(); else setFormOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Entry" : "Add Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as NoteType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <t.icon className={`h-4 w-4 ${t.color}`} /> {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={
                  form.type === "meeting" ? "e.g. Weekly sync call" :
                  form.type === "document" ? "e.g. Brand guidelines v2" :
                  form.type === "action_item" ? "e.g. Send revised proposal" :
                  "e.g. Important decision made"
                }
              />
            </div>

            {form.type === "meeting" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Meeting Date</Label>
                    <Input type="datetime-local" value={form.meeting_date} onChange={(e) => setForm((f) => ({ ...f, meeting_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Attendees</Label>
                    <Input value={form.attendees} onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))} placeholder="Comma-separated names" />
                  </div>
                </div>
              </>
            )}

            {(form.type === "document" || form.type === "meeting") && (
              <div className="space-y-2">
                <Label>{form.type === "meeting" ? "Recording / Link" : "URL / Link"}</Label>
                <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." />
              </div>
            )}

            {form.type === "action_item" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>
                {form.type === "meeting" ? "Meeting Notes / Summary" :
                 form.type === "action_item" ? "Details" :
                 form.type === "document" ? "Description" : "Content"}
              </Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Write your notes here..."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.title.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {client && (
        <SendProposalDialog
          open={proposalOpen}
          onOpenChange={setProposalOpen}
          clientId={client.id}
          clientName={client.name}
          clientEmail={client.email}
          defaultMonthlyFee={client.monthly_fee ?? 0}
          defaultSetupFee={client.setup_fee ?? 0}
        />
      )}
    </div>
  );
}
