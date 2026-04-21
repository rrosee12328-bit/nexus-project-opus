import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/activityLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  FileSignature, DollarSign, Send, Copy, Check, Clock, Briefcase, Repeat,
  Sparkles, Loader2, Download,
} from "lucide-react";
import { toast } from "sonner";
import type { ProposalType } from "@/lib/contractTemplate";

interface SendProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
  defaultMonthlyFee?: number;
  defaultSetupFee?: number;
}

const TYPE_OPTIONS: { value: ProposalType; label: string; description: string; icon: any }[] = [
  { value: "retainer", label: "Retainer", description: "Setup fee + monthly recurring", icon: Repeat },
  { value: "project", label: "Project", description: "Fixed total for defined scope", icon: Briefcase },
  { value: "hourly", label: "Hourly", description: "Billed per hour as worked", icon: Clock },
];

export function SendProposalDialog({
  open, onOpenChange, clientId, clientName, clientEmail,
  defaultMonthlyFee = 0, defaultSetupFee = 0,
}: SendProposalDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [proposalType, setProposalType] = useState<ProposalType>("retainer");
  const [projectName, setProjectName] = useState("");
  const [monthlyFee, setMonthlyFee] = useState(String(defaultMonthlyFee || ""));
  const [setupFee, setSetupFee] = useState(String(defaultSetupFee || ""));
  const [hourlyRate, setHourlyRate] = useState("");
  const [projectTotal, setProjectTotal] = useState("");
  const [billingSchedule, setBillingSchedule] = useState("monthly");
  const [scopeDescription, setScopeDescription] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [timeline, setTimeline] = useState("");
  const [servicesDescription, setServicesDescription] = useState("");
  const [proposalUrl, setProposalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const reset = () => {
    setProposalType("retainer");
    setProjectName("");
    setMonthlyFee(String(defaultMonthlyFee || ""));
    setSetupFee(String(defaultSetupFee || ""));
    setHourlyRate("");
    setProjectTotal("");
    setBillingSchedule("monthly");
    setScopeDescription("");
    setDeliverables("");
    setTimeline("");
    setServicesDescription("");
    setProposalUrl(null);
    setCopied(false);
    setGenerating(false);
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) reset();
    onOpenChange(isOpen);
  };

  // Validation per type
  const isValid = (() => {
    if (proposalType === "hourly") return Number(hourlyRate) > 0;
    if (proposalType === "project") return Number(projectTotal) > 0;
    return Number(setupFee) > 0 || Number(monthlyFee) > 0;
  })();

  // Build the proposal row payload
  const buildPayload = (status: "sent" | "draft" | "signed") => ({
    client_id: clientId,
    client_name: clientName,
    client_email: clientEmail || null,
    proposal_type: proposalType,
    project_name: projectName.trim() || null,
    monthly_fee: proposalType === "retainer" ? (Number(monthlyFee) || 0) : 0,
    setup_fee: proposalType === "retainer" ? (Number(setupFee) || 0) : 0,
    hourly_rate: proposalType === "hourly" ? (Number(hourlyRate) || 0) : 0,
    project_total: proposalType === "project" ? (Number(projectTotal) || 0) : 0,
    services_description: servicesDescription.trim() || null,
    scope_description: scopeDescription.trim() || null,
    deliverables: deliverables.trim() || null,
    timeline: timeline.trim() || null,
    billing_schedule: billingSchedule,
    status,
    created_by: user!.id,
  });

  // Send for client signature (existing flow)
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("proposals")
        .insert(buildPayload("sent") as any)
        .select("token")
        .single();
      if (error) throw error;
      return data.token;
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/proposal/${token}`;
      setProposalUrl(url);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast.success("Proposal created — share the link with your client.");
      logActivity("created_proposal", "proposal", clientId, `Sent ${proposalType} proposal to "${clientName}"`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create proposal"),
  });

  // Generate contract immediately (admin-side, no client signing)
  const handleGenerateNow = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      // Insert proposal as already "signed" by admin so PDF can be generated.
      const adminName = user.email?.split("@")[0] || "Vektiss Admin";
      const { data: proposal, error: insErr } = await supabase
        .from("proposals")
        .insert({
          ...buildPayload("signed"),
          signed_at: new Date().toISOString(),
          signed_name: `${adminName} (Admin Generated)`,
        } as any)
        .select("id")
        .single();
      if (insErr) throw insErr;

      // Trigger PDF generation
      const { data: genData, error: genErr } = await supabase.functions.invoke(
        "generate-contract-pdf",
        { body: { proposal_id: proposal.id, admin_generate: true } },
      );
      if (genErr) throw genErr;

      // Download the PDF
      const path = (genData as any)?.path;
      if (path) {
        const { data: signed } = await supabase.storage
          .from("client-assets")
          .createSignedUrl(path, 60);
        if (signed?.signedUrl) {
          window.open(signed.signedUrl, "_blank");
        }
      }

      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["client-contracts"] });
      toast.success("Contract generated and saved to client files.");
      logActivity("generated_contract", "proposal", clientId, `Generated ${proposalType} contract for "${clientName}"`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate contract");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!proposalUrl) return;
    await navigator.clipboard.writeText(proposalUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            New Proposal & Contract
          </DialogTitle>
          <DialogDescription>
            Create a proposal for <strong>{clientName}</strong>. Generate the contract immediately, or send it for client signature.
          </DialogDescription>
        </DialogHeader>

        {!proposalUrl ? (
          <>
            <div className="space-y-5 py-2">
              {/* Proposal Type Selector */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Proposal Type
                </Label>
                <RadioGroup
                  value={proposalType}
                  onValueChange={(v) => setProposalType(v as ProposalType)}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  {TYPE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <Label
                        key={opt.value}
                        htmlFor={`pt-${opt.value}`}
                        className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                          proposalType === opt.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value={opt.value} id={`pt-${opt.value}`} className="mt-0.5" />
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-semibold">{opt.label}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">{opt.description}</p>
                        </div>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </div>

              {/* Project identity */}
              <div className="space-y-1.5">
                <Label className="text-xs">Project Name</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. AI Chatbot Implementation" />
                <p className="text-[11px] text-muted-foreground">Project number is auto-generated.</p>
              </div>

              {/* Financial Terms — varies by type */}
              <div className="space-y-3">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-primary" /> Financial Terms
                </p>

                {proposalType === "retainer" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Setup Fee (USD)</Label>
                        <Input type="number" min={0} value={setupFee}
                          onChange={(e) => setSetupFee(e.target.value)} placeholder="e.g. 5800" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Monthly Fee (USD)</Label>
                        <Input type="number" min={0} value={monthlyFee}
                          onChange={(e) => setMonthlyFee(e.target.value)} placeholder="e.g. 2500" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Billing Schedule</Label>
                      <Select value={billingSchedule} onValueChange={setBillingSchedule}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly (full amount)</SelectItem>
                          <SelectItem value="bimonthly">Bi-monthly (15th & 30th)</SelectItem>
                        </SelectContent>
                      </Select>
                      {billingSchedule === "bimonthly" && Number(monthlyFee) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Two payments of ${(Number(monthlyFee) / 2).toFixed(2)} each
                        </p>
                      )}
                    </div>
                  </>
                )}

                {proposalType === "hourly" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hourly Rate (USD/hr)</Label>
                    <Input type="number" min={0} value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)} placeholder="e.g. 150" />
                    <p className="text-[11px] text-muted-foreground">
                      Billed as worked. Time will be tracked and invoiced.
                    </p>
                  </div>
                )}

                {proposalType === "project" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Project Total (USD)</Label>
                    <Input type="number" min={0} value={projectTotal}
                      onChange={(e) => setProjectTotal(e.target.value)} placeholder="e.g. 12000" />
                    <p className="text-[11px] text-muted-foreground">
                      Fixed price. 50% upfront, 50% on delivery (default terms).
                    </p>
                  </div>
                )}
              </div>

              {/* Scope context */}
              <div className="space-y-3">
                <p className="text-xs font-semibold">Scope & Context</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Scope Description</Label>
                  <Textarea value={scopeDescription}
                    onChange={(e) => setScopeDescription(e.target.value)}
                    placeholder="What's included in this engagement?" rows={3} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Deliverables</Label>
                    <Textarea value={deliverables}
                      onChange={(e) => setDeliverables(e.target.value)}
                      placeholder="• Item one&#10;• Item two" rows={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Timeline</Label>
                    <Textarea value={timeline}
                      onChange={(e) => setTimeline(e.target.value)}
                      placeholder="e.g. Phase 1: weeks 1-2&#10;Phase 2: weeks 3-4" rows={3} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Additional Services Notes (optional)</Label>
                  <Textarea value={servicesDescription}
                    onChange={(e) => setServicesDescription(e.target.value)}
                    placeholder="Any extra context that should appear in the contract..." rows={2} />
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerateNow}
                disabled={generating || sendMutation.isPending || !isValid}
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" /> Generate Contract Now</>
                )}
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending || generating || !isValid}
              >
                {sendMutation.isPending ? "Creating..." : (
                  <><Send className="h-4 w-4 mr-2" /> Send for Signature</>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Share this link with your client. They'll fill in their details, review the contract, sign, and pay.
              </p>
              <div className="flex gap-2">
                <Input value={proposalUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}