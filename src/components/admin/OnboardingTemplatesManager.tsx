import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  GripVertical,
  Layers,
  Star,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const AVAILABLE_PHASES = ["discovery", "design", "development", "review", "launch"];

interface OnboardingStep {
  step_key: string;
  title: string;
  description: string;
  sort_order: number;
}

interface TemplateRow {
  id: string;
  client_type: string;
  project_name: string;
  project_description: string;
  phases: string[];
  onboarding_steps: OnboardingStep[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_STEPS: OnboardingStep[] = [
  { step_key: "set_password", title: "Set your password", description: "Create a secure password for your portal account", sort_order: 0 },
  { step_key: "review_project", title: "Review your project", description: "Check out your project timeline and current phase", sort_order: 1 },
  { step_key: "upload_assets", title: "Upload brand assets", description: "Share logos, fonts, and brand guidelines with your team", sort_order: 2 },
  { step_key: "send_message", title: "Send your first message", description: "Introduce yourself or ask a question to your Vektiss team", sort_order: 3 },
  { step_key: "review_payments", title: "Review payment history", description: "Check your payment records and billing status", sort_order: 4 },
];

export function OnboardingTemplatesManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);

  // Form state
  const [formType, setFormType] = useState("");
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPhases, setFormPhases] = useState<string[]>([]);
  const [formSteps, setFormSteps] = useState<OnboardingStep[]>([]);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("client_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  const openEdit = (template: TemplateRow) => {
    setEditing(template);
    setIsNew(false);
    setFormType(template.client_type);
    setFormName(template.project_name);
    setFormDesc(template.project_description);
    setFormPhases([...template.phases]);
    setFormSteps([...(template.onboarding_steps as OnboardingStep[])]);
  };

  const openNew = () => {
    setEditing(null);
    setIsNew(true);
    setFormType("");
    setFormName("");
    setFormDesc("");
    setFormPhases(["discovery", "design", "development", "review", "launch"]);
    setFormSteps([...DEFAULT_STEPS]);
  };

  const closeDialog = () => {
    setEditing(null);
    setIsNew(false);
  };

  const togglePhase = (phase: string) => {
    setFormPhases((prev) =>
      prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase]
    );
  };

  const updateStep = (index: number, field: keyof OnboardingStep, value: string) => {
    setFormSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const addStep = () => {
    setFormSteps((prev) => [
      ...prev,
      {
        step_key: `step_${Date.now()}`,
        title: "",
        description: "",
        sort_order: prev.length,
      },
    ]);
  };

  const removeStep = (index: number) => {
    setFormSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort_order: i })));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formType.trim()) throw new Error("Client type is required");
      if (!formName.trim()) throw new Error("Project name is required");
      if (formPhases.length === 0) throw new Error("At least one phase is required");

      const orderedPhases = AVAILABLE_PHASES.filter((p) => formPhases.includes(p));
      const payload = {
        client_type: formType.trim().toLowerCase().replace(/\s+/g, "_"),
        project_name: formName.trim(),
        project_description: formDesc.trim(),
        phases: orderedPhases,
        onboarding_steps: formSteps.filter((s) => s.title.trim()),
      };

      if (editing) {
        const { error } = await supabase
          .from("onboarding_templates")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("onboarding_templates")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      toast.success(editing ? "Template updated" : "Template created");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("onboarding_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      toast.success("Template deleted");
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dialogOpen = isNew || !!editing;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Onboarding Project Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure the welcome project and checklist steps created for each client type during onboarding.
          </p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Add Template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !templates?.length ? (
        <p className="text-sm text-muted-foreground">No templates configured yet.</p>
      ) : (
        <div className="grid gap-3">
          {templates.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Card className="hover:border-primary/20 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{t.project_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {t.client_type}
                        </Badge>
                        {t.is_default && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Star className="h-3 w-3" /> Default
                          </Badge>
                        )}
                      </div>
                      {t.project_description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {t.project_description}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {t.phases.map((p) => (
                          <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {p.replace("_", " ")}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {(t.onboarding_steps as OnboardingStep[]).length} checklist steps
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!t.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Template" : "New Onboarding Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Client Type Key</Label>
                <Input
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  placeholder="e.g. web_design"
                  disabled={editing?.is_default}
                />
                <p className="text-[11px] text-muted-foreground">
                  Must match the client's "type" field
                </p>
              </div>
              <div className="space-y-2">
                <Label>Welcome Project Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Website Project"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Project Description</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="A brief description of the welcome project..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Project Phases</Label>
              <div className="flex gap-2 flex-wrap">
                {AVAILABLE_PHASES.map((phase) => (
                  <Badge
                    key={phase}
                    variant={formPhases.includes(phase) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer select-none transition-colors",
                      formPhases.includes(phase)
                        ? ""
                        : "opacity-50 hover:opacity-100"
                    )}
                    onClick={() => togglePhase(phase)}
                  >
                    {phase.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Onboarding Checklist Steps</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1 h-7 text-xs">
                  <Plus className="h-3 w-3" /> Add Step
                </Button>
              </div>

              {formSteps.map((step, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="pt-2.5 text-muted-foreground/40">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex-1 grid gap-2 sm:grid-cols-2">
                    <Input
                      value={step.title}
                      onChange={(e) => updateStep(idx, "title", e.target.value)}
                      placeholder="Step title"
                      className="text-sm h-8"
                    />
                    <Input
                      value={step.description}
                      onChange={(e) => updateStep(idx, "description", e.target.value)}
                      placeholder="Description"
                      className="text-sm h-8"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeStep(idx)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{deleteTarget?.project_name}" template for client type "{deleteTarget?.client_type}". New clients of this type will use the default template instead.
            </AlertDialogDescription>
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
    </div>
  );
}
