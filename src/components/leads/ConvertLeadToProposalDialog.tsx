import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Loader2, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const SERVICE_TYPES = [
  { value: "apps_portals_websites", label: "Apps, Portals & Websites" },
  { value: "project_intelligence", label: "Project Intelligence" },
  { value: "phone_email_assistant", label: "Phone & Email Assistant" },
  { value: "business_media_content", label: "Business Media & Content" },
];

const PROPOSAL_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "custom", label: "Custom" },
  { value: "retainer", label: "Retainer" },
];

type ConvertResult = {
  proposal_id: string;
  proposal_number: string;
};

type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  type: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: Lead | null;
  onConverted?: (result: ConvertResult) => void;
};

export function ConvertLeadToProposalDialog({ open, onOpenChange, lead, onConverted }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [form, setForm] = useState({
    project_name: "",
    scope_description: "",
    proposal_type: "standard",
    service_type: "apps_portals_websites",
    setup_fee: "",
    monthly_fee: "",
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("No lead selected");
      if (!form.project_name.trim()) throw new Error("Project name is required");

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const { data: proposal, error: propError } = await supabase
        .from("proposals")
        .insert({
          client_id: lead.id,
          client_name: lead.name,
          client_email: lead.email ?? null,
          project_name: form.project_name.trim(),
          scope_description: form.scope_description.trim() || null,
          proposal_type: form.proposal_type,
          setup_fee: parseFloat(form.setup_fee) || 0,
          monthly_fee: parseFloat(form.monthly_fee) || 0,
          billing_schedule: "monthly",
          status: "draft",
          created_by: uid,
        } as any)
        .select("id, proposal_number")
        .single();

      if (propError) throw propError;
      if (!proposal) throw new Error("Proposal creation returned no result");

      await supabase
        .from("clients")
        .update({ pipeline_stage: "proposal" } as any)
        .eq("id", lead.id);

      return {
        proposal_id: proposal.id,
        proposal_number: (proposal as any).proposal_number ?? "PRP-????",
      } as ConvertResult;
    },
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`Proposal ${res.proposal_number} created`);
      onConverted?.(res);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create proposal"),
  });

  const handleClose = () => {
    setResult(null);
    setForm({
      project_name: "",
      scope_description: "",
      proposal_type: "standard",
      service_type: "apps_portals_websites",
      setup_fee: "",
      monthly_fee: "",
    });
    onOpenChange(false);
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Convert Lead to Proposal
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Proposal Created</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Lead <span className="font-medium text-foreground">{lead.name}</span> has been moved to the Proposal stage.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="font-mono">{result.proposal_number}</Badge>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{form.project_name}</span>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  handleClose();
                  navigate("/admin/proposals");
                }}
              >
                Go to Proposals
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Converting Lead</p>
              <p className="font-medium text-sm">{lead.name}</p>
              {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">
                This creates a PRP-#### proposal and moves the lead to the Proposal pipeline stage.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="project_name">Project Name *</Label>
                <Input
                  id="project_name"
                  value={form.project_name}
                  onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                  placeholder="e.g. Acme Corp Website Redesign"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Proposal Type</Label>
                  <Select value={form.proposal_type} onValueChange={(v) => setForm({ ...form, proposal_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROPOSAL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Service Type</Label>
                  <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="setup_fee">Setup Fee (optional)</Label>
                  <Input
                    id="setup_fee"
                    type="number"
                    value={form.setup_fee}
                    onChange={(e) => setForm({ ...form, setup_fee: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="monthly_fee">Monthly Fee (optional)</Label>
                  <Input
                    id="monthly_fee"
                    type="number"
                    value={form.monthly_fee}
                    onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="scope">Scope Notes (optional)</Label>
                <Textarea
                  id="scope"
                  rows={3}
                  value={form.scope_description}
                  onChange={(e) => setForm({ ...form, scope_description: e.target.value })}
                  placeholder="Brief description of what was discussed…"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending || !form.project_name.trim()}
                className="gap-1.5"
              >
                {convertMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                Create Proposal
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
