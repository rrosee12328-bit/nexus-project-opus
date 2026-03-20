import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/activityLogger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pencil, Trash2, Calendar, User, ExternalLink, LinkIcon, Paperclip,
  Plus, FileText, Upload, Loader2, Download, CheckSquare, Clock, AlertTriangle, TrendingUp, Star,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

interface TaskWithClient extends Task {
  clients: { name: string } | null;
}

interface TaskAttachment {
  id: string;
  task_id: string;
  type: "link" | "file";
  title: string;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_by: string;
  created_at: string;
}

const columns: { key: TaskStatus; label: string; icon: typeof CheckSquare }[] = [
  { key: "todo", label: "To Do", icon: CheckSquare },
  { key: "in_progress", label: "In Progress", icon: Clock },
  { key: "review", label: "Review", icon: AlertTriangle },
  { key: "done", label: "Done", icon: TrendingUp },
];

const priorityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/20 text-primary",
  high: "bg-warning/20 text-warning",
  urgent: "bg-destructive/20 text-destructive",
};

interface TaskDetailDialogProps {
  task: TaskWithClient | null;
  open: boolean;
  onClose: () => void;
}

export default function TaskDetailDialog({ task, open, onClose }: TaskDetailDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "medium" as TaskPriority, due_date: "" });
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TaskAttachment | null>(null);
  const [uploading, setUploading] = useState(false);

  // Sync edit form when task changes
  const initEditForm = (t: TaskWithClient) => {
    setEditForm({
      title: t.title,
      description: t.description ?? "",
      priority: t.priority,
      due_date: t.due_date ?? "",
    });
  };

  // Fetch attachments
  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery({
    queryKey: ["task-attachments", task?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments" as any)
        .select("*")
        .eq("task_id", task!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TaskAttachment[];
    },
    enabled: !!task?.id,
  });

  const updateTask = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { error } = await supabase.from("tasks").update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        priority: editForm.priority,
        due_date: editForm.due_date || null,
      }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      logActivity("updated_task", "task", task?.id ?? null, `Updated task: "${editForm.title.trim()}"`);
      setEditMode(false);
      toast.success("Task updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      logActivity("deleted_task", "task", task?.id ?? null, `Deleted task: "${task?.title ?? "Unknown"}"`);
      toast.success("Task deleted");
      onClose();
    },
  });

  const moveTask = useMutation({
    mutationFn: async (status: TaskStatus) => {
      if (!task) return;
      const { error } = await supabase.from("tasks").update({ status }).eq("id", task.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (task && status) {
        logActivity("updated_task", "task", task.id, `Moved "${task.title}" to ${columns.find(c => c.key === status)?.label}`);
      }
      onClose();
    },
  });

  // Add link
  const addLink = useMutation({
    mutationFn: async () => {
      if (!linkTitle.trim() || !linkUrl.trim()) throw new Error("Title and URL required");
      const { error } = await supabase.from("task_attachments" as any).insert({
        task_id: task!.id,
        type: "link",
        title: linkTitle.trim(),
        url: linkUrl.trim(),
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", task?.id] });
      logActivity("added_task_attachment", "task", task?.id ?? null, `Added link "${linkTitle.trim()}" to task "${task?.title}"`);
      setShowAddLink(false);
      setLinkTitle("");
      setLinkUrl("");
      toast.success("Link added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Upload file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task || !user) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${task.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("task_attachments" as any).insert({
        task_id: task.id,
        type: "file",
        title: file.name,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        created_by: user.id,
      });
      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey: ["task-attachments", task.id] });
      logActivity("added_task_attachment", "task", task.id, `Uploaded file "${file.name}" to task "${task.title}"`);
      toast.success("File uploaded");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete attachment
  const deleteAttachment = useMutation({
    mutationFn: async (att: TaskAttachment) => {
      if (att.type === "file" && att.file_path) {
        await supabase.storage.from("task-attachments").remove([att.file_path]);
      }
      const { error } = await supabase.from("task_attachments" as any).delete().eq("id", att.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", task?.id] });
      toast.success("Attachment removed");
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete"),
  });

  // Download file
  const downloadFile = async (att: TaskAttachment) => {
    if (!att.file_path) return;
    const { data, error } = await supabase.storage.from("task-attachments").createSignedUrl(att.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Failed to generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!task) return null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setEditMode(false);
            setShowAddLink(false);
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>{editMode ? "Edit Task" : "Task Details"}</span>
              {!editMode && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { initEditForm(task); setEditMode(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTask.mutate()}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          {!editMode ? (
            <div className="space-y-4 py-2">
              {/* Title & description */}
              <div>
                <h3 className="text-lg font-semibold">{task.title}</h3>
                {task.description && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{task.description}</p>
                )}
              </div>

              <Separator />

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Status</p>
                  <Badge variant="secondary">
                    {columns.find(c => c.key === task.status)?.label ?? task.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Priority</p>
                  <Badge variant="outline" className={priorityColor[task.priority]}>
                    {task.priority}
                  </Badge>
                </div>
                {task.clients?.name && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Client</p>
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {task.clients.name}
                    </span>
                  </div>
                )}
                {task.due_date && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Due Date</p>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {format(new Date(task.due_date + "T00:00:00"), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Created</p>
                  <span>{format(new Date(task.created_at), "MMM d, yyyy")}</span>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Last Updated</p>
                  <span>{format(new Date(task.updated_at), "MMM d, yyyy")}</span>
                </div>
              </div>

              <Separator />

              {/* Attachments & Links */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    Links & Files
                    {attachments.length > 0 && (
                      <Badge variant="secondary" className="text-xs font-mono ml-1">{attachments.length}</Badge>
                    )}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddLink(true)}>
                      <LinkIcon className="h-3 w-3 mr-1" /> Add Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                      Upload
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>

                {/* Add link form */}
                {showAddLink && (
                  <div className="rounded-lg border border-border p-3 mb-3 space-y-3 bg-muted/30">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Title</Label>
                      <Input
                        value={linkTitle}
                        onChange={(e) => setLinkTitle(e.target.value)}
                        placeholder="e.g. Brand assets on Dropbox"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">URL</Label>
                      <Input
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowAddLink(false); setLinkTitle(""); setLinkUrl(""); }}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => addLink.mutate()} disabled={!linkTitle.trim() || !linkUrl.trim() || addLink.isPending}>
                        {addLink.isPending ? "Adding..." : "Add Link"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Attachment list */}
                {attachmentsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No links or files attached yet. Add Dropbox links, Drive docs, or upload files.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="group flex items-center gap-3 rounded-md border border-border p-2.5 hover:bg-accent/30 transition-colors"
                      >
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          {att.type === "link" ? (
                            <LinkIcon className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {att.type === "link"
                              ? (att.url && att.url.length > 50 ? att.url.slice(0, 50) + "..." : att.url)
                              : formatBytes(att.file_size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {att.type === "link" && att.url && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={att.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {att.type === "file" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadFile(att)}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(att)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Move to section */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Move to</p>
                <div className="flex gap-2 flex-wrap">
                  {columns.filter(c => c.key !== task.status).map(c => (
                    <Button
                      key={c.key}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => moveTask.mutate(c.key)}
                    >
                      <c.icon className="h-3 w-3 mr-1.5" /> {c.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Edit mode */
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm(f => ({ ...f, priority: v as TaskPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={editForm.due_date} onChange={(e) => setEditForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} rows={4} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={() => updateTask.mutate()} disabled={!editForm.title.trim() || updateTask.isPending}>
                  {updateTask.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete attachment confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this {deleteTarget?.type === "file" ? "file" : "link"}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteAttachment.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
