import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, Search, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  FileText, Users, Code, Palette, MessageCircle, DollarSign, Layers, HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = [
  { value: "general", label: "General", icon: Layers },
  { value: "onboarding", label: "Onboarding", icon: Users },
  { value: "operations", label: "Operations", icon: FileText },
  { value: "development", label: "Development", icon: Code },
  { value: "design", label: "Design", icon: Palette },
  { value: "communication", label: "Communication", icon: MessageCircle },
  { value: "finance", label: "Finance", icon: DollarSign },
] as const;

type SopCategory = (typeof CATEGORIES)[number]["value"];

const categoryColor: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  onboarding: "bg-primary/20 text-primary",
  operations: "bg-warning/20 text-warning",
  development: "bg-success/20 text-success",
  design: "bg-accent/20 text-accent-foreground",
  communication: "bg-primary/15 text-primary",
  finance: "bg-destructive/15 text-destructive",
};

interface SopRow {
  id: string;
  title: string;
  content: string;
  category: SopCategory;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export default function OpsSops() {
  const { toast } = useToast();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SopRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SopRow | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState<SopCategory>("general");
  const [formTags, setFormTags] = useState("");

  const { data: sops, isLoading } = useQuery({
    queryKey: ["sops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sops")
        .select("*")
        .order("category")
        .order("title");
      if (error) throw error;
      return data as SopRow[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formTitle.trim()) throw new Error("Title is required");
      if (!formContent.trim()) throw new Error("Content is required");
      const tags = formTags.split(",").map((t) => t.trim()).filter(Boolean);
      const payload = {
        title: formTitle.trim(),
        content: formContent.trim(),
        category: formCategory as SopCategory,
        tags,
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
      closeDialog();
      toast({ title: editing ? "SOP updated" : "SOP created" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sops"] });
      setDeleteTarget(null);
      toast({ title: "SOP deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setFormTitle("");
    setFormContent("");
    setFormCategory("general");
    setFormTags("");
    setDialogOpen(true);
  };

  const openEdit = (sop: SopRow) => {
    setEditing(sop);
    setFormTitle(sop.title);
    setFormContent(sop.content);
    setFormCategory(sop.category);
    setFormTags(sop.tags.join(", "));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  // Filtering
  const filtered = (sops ?? []).filter((sop) => {
    const matchSearch =
      !search ||
      sop.title.toLowerCase().includes(search.toLowerCase()) ||
      sop.content.toLowerCase().includes(search.toLowerCase()) ||
      sop.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCategory = filterCategory === "all" || sop.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const grouped = CATEGORIES.reduce<Record<string, SopRow[]>>((acc, cat) => {
    const items = filtered.filter((s) => s.category === cat.value);
    if (items.length > 0) acc[cat.value] = items;
    return acc;
  }, {});

  const totalCount = sops?.length ?? 0;
  const categoryBreakdown = CATEGORIES.map((c) => ({
    ...c,
    count: (sops ?? []).filter((s) => s.category === c.value).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Standard Operating Procedures</h1>
          <p className="text-muted-foreground">
            {totalCount} procedure{totalCount !== 1 ? "s" : ""} across {categoryBreakdown.length} categor{categoryBreakdown.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New SOP
          </Button>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex flex-wrap gap-2"
      >
        {categoryBreakdown.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.value}
              onClick={() => setFilterCategory(filterCategory === c.value ? "all" : c.value)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
                filterCategory === c.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <Icon className="h-3 w-3" />
              {c.label}
              <span className="font-mono">{c.count}</span>
            </button>
          );
        })}
      </motion.div>

      {/* Search & Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search SOPs by title, content, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* SOP List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-card animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {search || filterCategory !== "all" ? "No SOPs match your filters" : "No SOPs yet"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {search || filterCategory !== "all"
                    ? "Try adjusting your search or category filter."
                    : isAdmin
                    ? "Create your first standard operating procedure to get started."
                    : "SOPs will appear here once an admin creates them."}
                </p>
              </div>
              {!search && filterCategory === "all" && isAdmin && (
                <Button onClick={openCreate} variant="outline" className="gap-2 mt-2">
                  <Plus className="h-4 w-4" /> Create First SOP
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([catValue, items], gi) => {
            const catMeta = CATEGORIES.find((c) => c.value === catValue)!;
            const CatIcon = catMeta.icon;
            return (
              <motion.div
                key={catValue}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + gi * 0.05 }}
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <CatIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{catMeta.label}</span>
                  <Badge variant="secondary" className="text-xs font-mono">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((sop) => {
                    const isExpanded = expandedId === sop.id;
                    return (
                      <Card
                        key={sop.id}
                        className="hover:border-primary/20 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : sop.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{sop.title}</p>
                                {!isExpanded && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                    {sop.content}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {sop.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              <Badge className={`text-xs ${categoryColor[sop.category]}`}>
                                {sop.category}
                              </Badge>
                              {isAdmin && (
                                <div className="flex gap-1 ml-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEdit(sop);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTarget(sop);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-4 pl-7 border-l-2 border-border ml-0.5">
                                  <div className="prose prose-sm prose-invert max-w-none text-sm text-muted-foreground leading-relaxed [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_a]:text-primary [&_a]:underline [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_li]:marker:text-muted-foreground">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                      {sop.content}
                                    </ReactMarkdown>
                                  </div>
                                  <p className="text-xs text-muted-foreground/60 mt-4">
                                    Last updated {new Date(sop.updated_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit SOP" : "New SOP"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Client Onboarding Checklist" maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as SopCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Content *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground">
                      <HelpCircle className="h-3 w-3" /> Markdown Help
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 text-xs" side="left">
                    <p className="font-semibold text-sm mb-2">Markdown Cheat Sheet</p>
                    <div className="space-y-1.5 font-mono text-muted-foreground">
                      <p><span className="text-foreground"># Heading 1</span></p>
                      <p><span className="text-foreground">## Heading 2</span></p>
                      <p><span className="text-foreground">**bold**</span> → <strong className="text-foreground">bold</strong></p>
                      <p><span className="text-foreground">*italic*</span> → <em className="text-foreground">italic</em></p>
                      <p><span className="text-foreground">- item</span> → bullet list</p>
                      <p><span className="text-foreground">1. item</span> → numbered list</p>
                      <p><span className="text-foreground">[text](url)</span> → link</p>
                      <p><span className="text-foreground">`code`</span> → inline code</p>
                      <p><span className="text-foreground">```code block```</span></p>
                      <p><span className="text-foreground">---</span> → horizontal rule</p>
                      <p><span className="text-foreground">| A | B |</span> → table</p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Use markdown for formatting: # Heading, **bold**, - bullets..."
                rows={8}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="e.g. checklist, new-client, setup" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SOP</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
