import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/activityLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  FileSignature, DollarSign, Send, Copy, Check, Clock, Briefcase, Repeat,
  Sparkles, Loader2, Download, Eye, ArrowLeft, CreditCard, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderContract, type ProposalType } from "@/lib/contractTemplate";
import { createProposalToken } from "@/lib/proposalToken";

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
  const [costAnalysisUrl, setCostAnalysisUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);

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
    setCostAnalysisUrl("");
    setCopied(false);
    setGenerating(false);
    setShowReview(false);
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
    cost_analysis_url: costAnalysisUrl.trim() || null,
    created_by: user!.id,
  });

  // Send for client signature (existing flow)
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("proposals")
        .insert({ ...buildPayload("sent"), token: createProposalToken() } as any)
        .select("token")
        .single();
      if (error) throw error;
      if (!data?.token) throw new Error("Proposal link could not be created");
      return data.token;
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/proposal/${token}`;
      setProposalUrl(url);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast.success("Proposal link created. Nothing is emailed automatically.");
      logActivity("created_proposal", "proposal", clientId, `Created ${proposalType} proposal for "${clientName}"`);
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
          token: createProposalToken(),
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

  const fmt = (value: number) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    });

  const contractPreview = renderContract({
    clientName: clientName || "_______________",
    companyName: "_______________",
    clientAddress: "_______________",
    clientEmail: clientEmail || "_______________",
    projectName: projectName.trim() || undefined,
    setupFee: proposalType === "retainer" ? Number(setupFee) || 0 : 0,
    monthlyFee: proposalType === "retainer" ? Number(monthlyFee) || 0 : 0,
    hourlyRate: proposalType === "hourly" ? Number(hourlyRate) || 0 : 0,
    projectTotal: proposalType === "project" ? Number(projectTotal) || 0 : 0,
    proposalType,
    servicesDescription: servicesDescription.trim() || undefined,
    scopeDescription: scopeDescription.trim() || undefined,
    deliverables: deliverables.trim() || undefined,
    timeline: timeline.trim() || undefined,
  });

  const paymentSummary = (() => {
    if (proposalType === "hourly") {
      return `${fmt(Number(hourlyRate) || 0)} per hour; time is invoiced as worked.`;
    }
    if (proposalType === "project") {
      return `${fmt(Number(projectTotal) || 0)} total; 50% due upfront and 50% on delivery.`;
    }

    const terms = [];
    if (Number(setupFee) > 0) terms.push(`${fmt(Number(setupFee))} setup`);
    if (Number(monthlyFee) > 0) terms.push(`${fmt(Number(monthlyFee))} per month`);
    const split = billingSchedule === "bimonthly" && Number(monthlyFee) > 0
      ? ` The monthly fee is split into two ${fmt(Number(monthlyFee) / 2)} payments.`
      : "";
    return `${terms.join(" plus ")}.${split}`;
  })();

  const checkoutStatus = proposalType === "hourly"
    ? {
        title: "No immediate Stripe checkout",
        detail: "Hourly work is tracked and invoiced after it is performed, so this proposal does not create a payment link.",
        badge: "Invoiced after work",
      }
    : proposalType === "project"
      ? {
          title: "50% project deposit is ready",
          detail: "After the client signs, Stripe Checkout collects the first 50%. Once paid, the remaining 50% is created automatically as an unsent draft invoice for you to review later.",
          badge: "50% now + 50% draft",
        }
      : {
          title: "Stripe checkout is ready to generate",
          detail: "The payment link is intentionally created only after the client signs the contract. This prevents an unsigned client from paying against unfinished terms.",
          badge: "Pending client signature",
        };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className={`${showReview ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            New Proposal & Contract
          </DialogTitle>
          <DialogDescription>
            Create a proposal for <strong>{clientName}</strong>. Generate the contract immediately, or send it for client signature.
          </DialogDescription>
        </DialogHeader>

        {!proposalUrl && !showReview ? (
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

              {/* Internal admin field — cost analysis link */}
              <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3 bg-muted/30">
                <Label className="text-xs font-semibold">Cost Analysis Link (admin only)</Label>
                <Input
                  type="url"
                  value={costAnalysisUrl}
                  onChange={(e) => setCostAnalysisUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
                <p className="text-[11px] text-muted-foreground">
                  Internal Google Sheet (or any URL) for this client's cost analysis. Visible only to admins on the proposal page — never shown to the client.
                </p>
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
                onClick={() => setShowReview(true)}
                disabled={sendMutation.isPending || generating || !isValid}
              >
                <><Eye className="h-4 w-4 mr-2" /> Review Before Sending</>
              </Button>
            </DialogFooter>
          </>
        ) : !proposalUrl ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
              <div>
                <p className="font-semibold">Client preview</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Nothing has been sent or saved yet. Review each tab before creating the client link.
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 border-amber-500/40 text-amber-600">
                Not sent
              </Badge>
            </div>

            <Tabs defaultValue="proposal" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="proposal">Proposal</TabsTrigger>
                <TabsTrigger value="contract">Contract</TabsTrigger>
                <TabsTrigger value="payment">Stripe Payment</TabsTrigger>
              </TabsList>

              <TabsContent value="proposal" className="mt-3">
                <div className="max-h-[52vh] overflow-y-auto rounded-lg border bg-card p-5 sm:p-7">
                  <div className="space-y-6">
                    <div className="text-center border-b pb-5">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Service Proposal</p>
                      <h2 className="text-2xl font-bold mt-2">AI &amp; Automation Services</h2>
                      {projectName.trim() && <p className="font-semibold mt-1">{projectName.trim()}</p>}
                      <p className="text-sm text-muted-foreground mt-2">
                        Prepared for <strong className="text-foreground">{clientName}</strong>
                      </p>
                    </div>
                    <section>
                      <h3 className="text-sm font-bold mb-2">Project Overview</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {servicesDescription.trim() || scopeDescription.trim() || "AI & Automation services tailored to your business needs. Full details are outlined in the contract."}
                      </p>
                    </section>
                    {scopeDescription.trim() && servicesDescription.trim() && (
                      <section><h3 className="text-sm font-bold mb-2">Scope of Services</h3><p className="text-sm text-muted-foreground whitespace-pre-line">{scopeDescription}</p></section>
                    )}
                    {deliverables.trim() && (
                      <section><h3 className="text-sm font-bold mb-2">Deliverables</h3><p className="text-sm text-muted-foreground whitespace-pre-line">{deliverables}</p></section>
                    )}
                    {timeline.trim() && (
                      <section><h3 className="text-sm font-bold mb-2">Timeline</h3><p className="text-sm text-muted-foreground whitespace-pre-line">{timeline}</p></section>
                    )}
                    <section className="border-t pt-5">
                      <h3 className="text-sm font-bold mb-2">Investment</h3>
                      <p className="text-sm text-muted-foreground">{paymentSummary}</p>
                    </section>
                    <section className="border-t pt-5">
                      <h3 className="text-sm font-bold mb-2">What the client does next</h3>
                      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                        <li>Confirm contact information</li>
                        <li>Review and sign the NDA</li>
                        <li>Review and sign the service contract</li>
                        <li>Continue to secure Stripe checkout</li>
                      </ol>
                    </section>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contract" className="mt-3">
                <div className="max-h-[52vh] overflow-y-auto rounded-lg border bg-card p-5 sm:p-7">
                  <div className="text-center border-b pb-5 mb-6">
                    <FileSignature className="h-6 w-6 text-primary mx-auto mb-2" />
                    <h2 className="text-xl font-bold">AI &amp; Automation Services Contract</h2>
                    <p className="text-xs text-muted-foreground mt-1">This is the contract the client will review before signing.</p>
                  </div>
                  <div className="space-y-6">
                    {contractPreview.map((section) => (
                      <section key={section.title}>
                        <h3 className="text-sm font-bold mb-2">{section.title}</h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground prose-p:my-2 prose-strong:text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="payment" className="mt-3">
                <div className="rounded-lg border bg-card p-5 sm:p-7 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-emerald-500/10 p-2"><ShieldCheck className="h-5 w-5 text-emerald-500" /></div>
                    <div>
                      <h3 className="font-semibold">{checkoutStatus.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {checkoutStatus.detail}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                    <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Checkout summary</p></div>
                    <p className="text-sm text-muted-foreground">{paymentSummary}</p>
                    <p className="text-xs text-muted-foreground">After signing, the client clicks the secure payment button and Stripe generates their Checkout session.</p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-dashed p-3 text-sm">
                    <span className="text-muted-foreground">Current payment-link status</span>
                    <Badge variant="secondary">{checkoutStatus.badge}</Badge>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowReview(false)} className="sm:mr-auto">
                <ArrowLeft className="h-4 w-4 mr-2" /> Edit Proposal
              </Button>
              <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || generating}>
                {sendMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating client link...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Confirm &amp; Create Client Link</>
                )}
              </Button>
            </DialogFooter>
          </div>
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
