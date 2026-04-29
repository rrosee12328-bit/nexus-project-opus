import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import AICommandCenter from "@/components/AICommandCenter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BookOpen, FileText, Lightbulb, MessageSquare,
  Plus, Search, Pencil, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";

type Sop = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

type CompanySummary = {
  id: string;
  title: string;
  content: string;
  summary_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type StrategicInsight = {
  id: string;
  title: string;
  description: string;
  insight_type: string;
  recommended_action: string | null;
  status: string | null;
  generated_at: string | null;
};

type ClientNote = {
  id: string;
  title: string;
  content: string | null;
  type: string;
  client_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Client = { id: string; name: string };

const SOP_CATEGORIES = [
  "onboarding", "operations", "development", "design",
  "communication", "finance", "general",
];

const INSIGHT_TYPES = [
  "opportunity", "risk", "trend", "recommendation", "observation",
];

const INSIGHT_STATUS = ["active", "archived", "actioned"];

const NOTE_TYPES = ["note", "meeting", "decision", "action_item", "general"];

const CAT_COLORS: Record<string, string> = {
  onboarding: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  operations: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  development: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  design: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  communication: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  finance: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  general: "bg-muted text-muted-foreground border-border",
};

const INSIGHT_COLORS: Record<string, string> = {
  opportunity: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  risk: "bg-red-500/20 text-red-400 border-red-500/30",
  trend: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  recommendation: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  observation: "bg-muted text-muted-foreground border-border",
};

function DeleteConfirm({
  open, onOpenChange, onConfirm, title,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  onConfirm: () => void; title: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{title}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this entry from the AI's memory. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExpandableContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  return (
    <div>
      <p className={`text-sm text-foreground/80 whitespace-pre-wrap ${!expanded && isLong ? "line-clamp-3" : ""}`}>
        {text}
      </p>
      {isLong && (
        <button
          className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
        </button>
      )}
    </div>
  );
}

function SopsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sop | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sop | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general", tags: "" });

  const { data: sops = [], isLoading } = useQuery({
    queryKey: ["sops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sops").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Sop[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category as any,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
      if (editing) {
        const { error } = await supabase.from("sops").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sops").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sops"] });
      toast.success(editing ? "SOP updated" : "SOP added");
      setDialogOpen(false); setEditing(null);
      setForm({ title: "", content: "", category: "general", tags: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sops"] }); toast.success("SOP deleted"); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => sops.filter((s) => {
    const q = search.toLowerCase();
    return (!q || s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)) &&
      (filterCat === "all" || s.category === filterCat);
  }), [sops, search, filterCat]);

  const openAdd = () => { setEditing(null); setForm({ title: "", content: "", category: "general", tags: "" }); setDialogOpen(true); };
  const openEdit = (s: Sop) => { setEditing(s); setForm({ title: s.title, content: s.content, category: s.category, tags: s.tags?.join(", ") ?? "" }); setDialogOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search SOPs…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {SOP_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add SOP</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading…</div> :
            filtered.length === 0 ? <div className="p-8 text-center text-muted-foreground">No SOPs found. Click "Add SOP" to create one.</div> : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-[160px]">Tags</TableHead>
                    <TableHead className="w-[90px]">Updated</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className="border-border hover:bg-muted/30 group align-top">
                      <TableCell className="font-medium text-sm py-3 w-[200px]">{s.title}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-xs capitalize ${CAT_COLORS[s.category] || ""}`}>{s.category}</Badge>
                      </TableCell>
                      <TableCell className="py-3 max-w-[400px]"><ExpandableContent text={s.content} /></TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.tags?.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">{format(parseISO(s.updated_at), "MM/dd/yy")}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit SOP" : "Add SOP"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Client Onboarding Process" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SOP_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. onboarding, checklist" /></div>
            </div>
            <div><Label>Content</Label><Textarea rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the full SOP content here…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title.trim()}>{editing ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <DeleteConfirm open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title={deleteTarget.title} onConfirm={() => deleteMutation.mutate(deleteTarget.id)} />
      )}
    </div>
  );
}

function SummariesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CompanySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanySummary | null>(null);
  const [form, setForm] = useState({ title: "", content: "", summary_date: format(new Date(), "yyyy-MM-dd") });

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["company-summaries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_summaries").select("*").order("summary_date", { ascending: false });
      if (error) throw error;
      return data as CompanySummary[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const payload: any = { title: form.title.trim(), content: form.content.trim(), summary_date: form.summary_date, created_by: userData.user?.id };
      if (editing) {
        const { error } = await supabase.from("company_summaries").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_summaries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-summaries"] });
      toast.success(editing ? "Summary updated" : "Summary added");
      setDialogOpen(false); setEditing(null);
      setForm({ title: "", content: "", summary_date: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_summaries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["company-summaries"] }); toast.success("Summary deleted"); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => summaries.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q);
  }), [summaries, search]);

  const openAdd = () => { setEditing(null); setForm({ title: "", content: "", summary_date: format(new Date(), "yyyy-MM-dd") }); setDialogOpen(true); };
  const openEdit = (s: CompanySummary) => { setEditing(s); setForm({ title: s.title, content: s.content, summary_date: s.summary_date }); setDialogOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search summaries…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Summary</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading…</div> :
            filtered.length === 0 ? <div className="p-8 text-center text-muted-foreground">No summaries found.</div> : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Title</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-[90px]">Date</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className="border-border hover:bg-muted/30 group align-top">
                      <TableCell className="font-medium text-sm py-3 w-[200px]">{s.title}</TableCell>
                      <TableCell className="py-3 max-w-[400px]"><ExpandableContent text={s.content} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">{format(parseISO(s.summary_date), "MM/dd/yy")}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Summary" : "Add Summary"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Q2 Company Direction" /></div>
              <div><Label>Date</Label><Input type="date" value={form.summary_date} onChange={(e) => setForm({ ...form, summary_date: e.target.value })} /></div>
            </div>
            <div><Label>Content</Label><Textarea rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the summary content here…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title.trim()}>{editing ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <DeleteConfirm open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title={deleteTarget.title} onConfirm={() => deleteMutation.mutate(deleteTarget.id)} />
      )}
    </div>
  );
}

function InsightsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StrategicInsight | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StrategicInsight | null>(null);
  const [form, setForm] = useState({ title: "", description: "", insight_type: "observation", recommended_action: "", status: "active" });

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ["strategic-insights"],
    queryFn: async () => {
      const { data, error } = await supabase.from("strategic_insights").select("*").order("generated_at", { ascending: false });
      if (error) throw error;
      return data as StrategicInsight[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim(),
        insight_type: form.insight_type,
        recommended_action: form.recommended_action.trim() || null,
        status: form.status,
      };
      if (editing) {
        const { error } = await supabase.from("strategic_insights").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("strategic_insights").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategic-insights"] });
      toast.success(editing ? "Insight updated" : "Insight added");
      setDialogOpen(false); setEditing(null);
      setForm({ title: "", description: "", insight_type: "observation", recommended_action: "", status: "active" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("strategic_insights").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["strategic-insights"] }); toast.success("Insight deleted"); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => insights.filter((s) => {
    const q = search.toLowerCase();
    return (!q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) &&
      (filterType === "all" || s.insight_type === filterType);
  }), [insights, search, filterType]);

  const openAdd = () => { setEditing(null); setForm({ title: "", description: "", insight_type: "observation", recommended_action: "", status: "active" }); setDialogOpen(true); };
  const openEdit = (s: StrategicInsight) => {
    setEditing(s);
    setForm({ title: s.title, description: s.description, insight_type: s.insight_type, recommended_action: s.recommended_action ?? "", status: s.status ?? "active" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search insights…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {INSIGHT_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Insight</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading…</div> :
            filtered.length === 0 ? <div className="p-8 text-center text-muted-foreground">No insights found.</div> : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className="border-border hover:bg-muted/30 group align-top">
                      <TableCell className="font-medium text-sm py-3 w-[200px]">{s.title}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-xs capitalize ${INSIGHT_COLORS[s.insight_type] || ""}`}>{s.insight_type}</Badge>
                      </TableCell>
                      <TableCell className="py-3 max-w-[320px]">
                        <ExpandableContent text={s.description} />
                        {s.recommended_action && (
                          <p className="text-xs text-primary mt-1"><span className="font-semibold">Action:</span> {s.recommended_action}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={`text-xs capitalize ${s.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : s.status === "actioned" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-muted text-muted-foreground border-border"}`}>
                          {s.status ?? "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Insight" : "Add Insight"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Upsell opportunity with Client X" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.insight_type} onValueChange={(v) => setForm({ ...form, insight_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INSIGHT_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INSIGHT_STATUS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the insight…" /></div>
            <div><Label>Recommended Action <span className="text-xs text-muted-foreground">(optional)</span></Label><Textarea rows={2} value={form.recommended_action} onChange={(e) => setForm({ ...form, recommended_action: e.target.value })} placeholder="What should be done about this?" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title.trim()}>{editing ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <DeleteConfirm open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title={deleteTarget.title} onConfirm={() => deleteMutation.mutate(deleteTarget.id)} />
      )}
    </div>
  );
}

function ClientNotesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientNote | null>(null);
  const [form, setForm] = useState({ title: "", content: "", type: "note", client_id: "" });

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["client-notes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_notes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientNote[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data || []) as Client[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const payload: any = {
        title: form.title.trim(),
        content: form.content.trim() || null,
        type: form.type,
        client_id: form.client_id || null,
        created_by: userData.user?.id,
      };
      if (editing) {
        const { error } = await supabase.from("client_notes").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("client_notes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes"] });
      toast.success(editing ? "Note updated" : "Note added");
      setDialogOpen(false); setEditing(null);
      setForm({ title: "", content: "", type: "note", client_id: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["client-notes"] }); toast.success("Note deleted"); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const getClientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => notes.filter((n) => {
    const q = search.toLowerCase();
    return (!q || n.title.toLowerCase().includes(q) || (n.content ?? "").toLowerCase().includes(q)) &&
      (filterClient === "all" || n.client_id === filterClient);
  }), [notes, search, filterClient]);

  const openAdd = () => { setEditing(null); setForm({ title: "", content: "", type: "note", client_id: "" }); setDialogOpen(true); };
  const openEdit = (n: ClientNote) => { setEditing(n); setForm({ title: n.title, content: n.content ?? "", type: n.type, client_id: n.client_id ?? "" }); setDialogOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Note</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading…</div> :
            filtered.length === 0 ? <div className="p-8 text-center text-muted-foreground">No notes found.</div> : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead className="w-[140px]">Client</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-[90px]">Date</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((n) => (
                    <TableRow key={n.id} className="border-border hover:bg-muted/30 group align-top">
                      <TableCell className="font-medium text-sm py-3">{n.title}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-xs capitalize bg-muted text-muted-foreground border-border">{n.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm py-3">{getClientName(n.client_id)}</TableCell>
                      <TableCell className="py-3 max-w-[300px]">{n.content ? <ExpandableContent text={n.content} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">{format(parseISO(n.created_at), "MM/dd/yy")}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(n)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(n)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Note" : "Add Note"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Client preference — no cold calls" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NOTE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Client</Label>
                <Select value={form.client_id || "none"} onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">General</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Content</Label><Textarea rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the note content here…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title.trim()}>{editing ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <DeleteConfirm open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title={deleteTarget.title} onConfirm={() => deleteMutation.mutate(deleteTarget.id)} />
      )}
    </div>
  );
}

export default function AdminKnowledgeBase() {
  const { data: sopCount = 0 } = useQuery({
    queryKey: ["kb-counts", "sops"],
    queryFn: async () => { const { count } = await supabase.from("sops").select("id", { count: "exact", head: true }); return count ?? 0; },
  });
  const { data: summaryCount = 0 } = useQuery({
    queryKey: ["kb-counts", "company-summaries"],
    queryFn: async () => { const { count } = await supabase.from("company_summaries").select("id", { count: "exact", head: true }); return count ?? 0; },
  });
  const { data: insightCount = 0 } = useQuery({
    queryKey: ["kb-counts", "strategic-insights"],
    queryFn: async () => { const { count } = await supabase.from("strategic_insights").select("id", { count: "exact", head: true }); return count ?? 0; },
  });
  const { data: noteCount = 0 } = useQuery({
    queryKey: ["kb-counts", "client-notes"],
    queryFn: async () => { const { count } = await supabase.from("client_notes").select("id", { count: "exact", head: true }); return count ?? 0; },
  });

  return (
    <div className="space-y-6">
      <AICommandCenter pageContext={{ pageType: "knowledge_base", title: "Knowledge Base" }} />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground hidden sm:block">
          Everything fed into the AI brain — SOPs, summaries, insights, and client notes.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "SOPs", value: sopCount, icon: BookOpen, color: "text-purple-400" },
          { label: "Summaries", value: summaryCount, icon: FileText, color: "text-blue-400" },
          { label: "Insights", value: insightCount, icon: Lightbulb, color: "text-amber-400" },
          { label: "Client Notes", value: noteCount, icon: MessageSquare, color: "text-teal-400" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-70`} />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="sops">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sops" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /> SOPs</TabsTrigger>
          <TabsTrigger value="summaries" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Summaries</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> Insights</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Client Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="sops" className="mt-4"><SopsTab /></TabsContent>
        <TabsContent value="summaries" className="mt-4"><SummariesTab /></TabsContent>
        <TabsContent value="insights" className="mt-4"><InsightsTab /></TabsContent>
        <TabsContent value="notes" className="mt-4"><ClientNotesTab /></TabsContent>
      </Tabs>
    </div>
  );
}