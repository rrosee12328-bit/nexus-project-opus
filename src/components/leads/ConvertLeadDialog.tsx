import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PartyPopper, Rocket, DollarSign, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface ConvertLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Client | null;
}

export function ConvertLeadDialog({ open, onOpenChange, lead }: ConvertLeadDialogProps) {
  const queryClient = useQueryClient();
  const [createProject, setCreateProject] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [setupFee, setSetupFee] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  // Pre-fill from lead when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && lead) {
      setMonthlyFee(String(lead.monthly_fee ?? ""));
      setSetupFee(String(lead.setup_fee ?? ""));
      setProjectName(`${lead.name} — ${lead.type || "Project"}`);
      setProjectDescription(lead.notes?.slice(0, 200) || "");
      setStartDate(new Date().toISOString().slice(0, 10));
    }
    onOpenChange(isOpen);
  };

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("No lead selected");

      // 1. Update client: status → onboarding, clear pipeline fields
      const { error: updateError } = await supabase
        .from("clients")
        .update({
          status: "onboarding",
          pipeline_stage: null,
          monthly_fee: Number(monthlyFee) || lead.monthly_fee || 0,
          setup_fee: Number(setupFee) || lead.setup_fee || 0,
          balance_due: Number(setupFee) || lead.setup_fee || 0,
          start_date: startDate || null,
        })
        .eq("id", lead.id);
      if (updateError) throw updateError;

      // 2. Optionally create a project
      if (createProject && projectName.trim()) {
        const { error: projectError } = await supabase
          .from("projects")
          .insert({
            client_id: lead.id,
            name: projectName.trim(),
            description: projectDescription.trim() || null,
            status: "not_started",
            current_phase: "discovery",
            start_date: startDate || null,
          });
        if (projectError) throw projectError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["report-projects"] });
      toast.success(`🎉 ${lead?.name} converted to client!`);
      logActivity(
        "converted_lead",
        "client",
        lead?.id ?? null,
        `Converted lead "${lead?.name}" to onboarding client`,
      );
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to convert lead");
    },
  });

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-emerald-500" />
            Convert Lead to Client
          </DialogTitle>
          <DialogDescription>
            Convert <strong>{lead.name}</strong> from a lead to an onboarding client.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Lead summary */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-lg font-bold text-emerald-500">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.type || "No type"}</p>
              </div>
              <Badge className="ml-auto bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Won</Badge>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {lead.email && (
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>
              )}
              {lead.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
              )}
            </div>
          </div>

          <Separator />

          {/* Financial terms */}
          <div>
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Financial Terms
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Monthly Fee</Label>
                <Input
                  type="number"
                  min={0}
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Setup Fee</Label>
                <Input
                  type="number"
                  min={0}
                  value={setupFee}
                  onChange={(e) => setSetupFee(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Project creation */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" /> Create Project
              </p>
              <Switch checked={createProject} onCheckedChange={setCreateProject} />
            </div>
            {createProject && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Project Name</Label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Website Redesign"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Brief project description..."
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => convertMutation.mutate()}
            disabled={convertMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {convertMutation.isPending ? "Converting..." : "Convert to Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
