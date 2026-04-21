import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, CheckCircle, CreditCard, ExternalLink, Eye, Plus, Mail,
  Send, Copy, Check, ArrowLeft, Sparkles, Loader2, Edit3,
  Briefcase, Clock, Repeat, Download,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Sent", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  signed: { label: "Signed", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  paid: { label: "Paid", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

type DialogStep = "input" | "preview" | "done";
type ProposalType = "retainer" | "project" | "hourly";

const TYPE_OPTIONS: { value: ProposalType; label: string; description: string; icon: any }[] = [
  { value: "retainer", label: "Retainer", description: "Setup + monthly recurring", icon: Repeat },
  { value: "project", label: "Project", description: "Fixed total for defined scope", icon: Briefcase },
  { value: "hourly", label: "Hourly", description: "Billed per hour as worked", icon: Clock },
];

function QuickCreateDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<DialogStep>("input");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [proposalType, setProposalType] = useState<ProposalType>("retainer");
  const [projectName, setProjectName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [setupFee, setSetupFee] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [projectTotal, setProjectTotal] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [timeline, setTimeline] = useState("");
  const [billingSchedule, setBillingSchedule] = useState("monthly");
  const [servicesDescription, setServicesDescription] = useState("");
  const [polishedDescription, setPolishedDescription] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [proposalUrl, setProposalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const reset = () => {
    setStep("input");
    setClientName(""); setClientEmail(""); setCompanyName("");
    setProposalType("retainer");
    setProjectName(""); setProjectNumber("");
    setMonthlyFee(""); setSetupFee(""); setBillingSchedule("monthly");
    setHourlyRate(""); setProjectTotal("");
    setScopeDescription(""); setDeliverables(""); setTimeline("");
    setServicesDescription(""); setPolishedDescription("");
    setProposalUrl(null); setCopied(false);
    setCreating(false); setPolishing(false); setGenerating(false);
  };

  const handleOpen = (o: boolean) => {
    if (o) reset();
    onOpenChange(o);
  };

  const handlePolishAndPreview = async () => {
    setPolishing(true);
    try {
      if (servicesDescription.trim()) {
        const { data, error } = await supabase.functions.invoke("polish-proposal", {
          body: {
            servicesDescription: servicesDescription.trim(),
            clientName: clientName.trim(),
            companyName: companyName.trim(),
            setupFee: Number(setupFee) || 0,
            monthlyFee: Number(monthlyFee) || 0,
            billingSchedule,
          },
        });
        if (error) throw error;
        setPolishedDescription(data.polished || servicesDescription.trim());
      } else {
        setPolishedDescription("");
      }
      setStep("preview");
    } catch (err: any) {
      console.error("Polish error:", err);
      toast.error("AI polish failed, showing original text");
      setPolishedDescription(servicesDescription.trim());
      setStep("preview");
    } finally {
      setPolishing(false);
    }
  };

  const handleCreate = async () => {
    if (!user || !clientName.trim()) return;
    setCreating(true);
    try {
      const finalDescription = polishedDescription.trim() || servicesDescription.trim() || null;
      const { data, error } = await supabase.from("proposals").insert({
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        company_name: companyName.trim() || null,
        proposal_type: proposalType,
        project_name: projectName.trim() || null,
        project_number: projectNumber.trim() || null,
        monthly_fee: proposalType === "retainer" ? (Number(monthlyFee) || 0) : 0,
        setup_fee: proposalType === "retainer" ? (Number(setupFee) || 0) : 0,
        hourly_rate: proposalType === "hourly" ? (Number(hourlyRate) || 0) : 0,
        project_total: proposalType === "project" ? (Number(projectTotal) || 0) : 0,
        scope_description: scopeDescription.trim() || null,
        deliverables: deliverables.trim() || null,
        timeline: timeline.trim() || null,
        services_description: finalDescription,
        billing_schedule: billingSchedule,
        status: "draft",
        created_by: user.id,
      } as any).select("token").single();
      if (error) throw error;
      const url = `${window.location.origin}/proposal/${data.token}`;
      setProposalUrl(url);
      setStep("done");
      onCreated();
      toast.success("Proposal created!");
      logActivity("created_proposal", "proposal", undefined, `Created proposal for "${clientName}"`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create proposal");
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateNow = async () => {
    if (!user || !clientName.trim()) return;
    setGenerating(true);
    try {
      const adminName = user.email?.split("@")[0] || "Vektiss Admin";
      const finalDescription = polishedDescription.trim() || servicesDescription.trim() || null;
      const { data: proposal, error: insErr } = await supabase
        .from("proposals")
        .insert({
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || null,
          company_name: companyName.trim() || null,
          proposal_type: proposalType,
          project_name: projectName.trim() || null,
          project_number: projectNumber.trim() || null,
          monthly_fee: proposalType === "retainer" ? (Number(monthlyFee) || 0) : 0,
          setup_fee: proposalType === "retainer" ? (Number(setupFee) || 0) : 0,
          hourly_rate: proposalType === "hourly" ? (Number(hourlyRate) || 0) : 0,
          project_total: proposalType === "project" ? (Number(projectTotal) || 0) : 0,
          scope_description: scopeDescription.trim() || null,
          deliverables: deliverables.trim() || null,
          timeline: timeline.trim() || null,
          services_description: finalDescription,
          billing_schedule: billingSchedule,
          status: "signed",
          signed_at: new Date().toISOString(),
          signed_name: `${adminName} (Admin Generated)`,
          created_by: user.id,
        } as any)
        .select("id")
        .single();
      if (insErr) throw insErr;

      const { data: genData, error: genErr } = await supabase.functions.invoke(
        "generate-contract-pdf",
        { body: { proposal_id: proposal.id, admin_generate: true } },
      );
      if (genErr) throw genErr;

      const path = (genData as any)?.path;
      if (path) {
        const { data: signed } = await supabase.storage
          .from("client-assets")
          .createSignedUrl(path, 60);
        if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
      }

      onCreated();
      toast.success("Contract generated.");
      logActivity("generated_contract", "proposal", undefined, `Generated ${proposalType} contract for "${clientName}"`);
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
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = async () => {
    if (!proposalUrl || !clientEmail.trim()) {
      toast.error("Client email is required to send");
      return;
    }
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          event: "proposal_link",
          eventData: {
            recipient_email: clientEmail.trim(),
            client_name: clientName,
            proposal_url: proposalUrl,
          },
        },
      });
      if (error) throw error;
      toast.success(`Proposal link sent to ${clientEmail}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const fmtCurrency = (v: string) => {
    const n = Number(v);
    if (!n) return "$0";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "input" && <><Plus className="h-5 w-5 text-primary" /> New Proposal</>}
            {step === "preview" && <><Eye className="h-5 w-5 text-primary" /> Review Draft</>}
            {step === "done" && <><CheckCircle className="h-5 w-5 text-primary" /> Proposal Ready</>}
          </DialogTitle>
          <DialogDescription>
            {step === "input" && "Enter client details and describe the services."}
            {step === "preview" && "Review the polished proposal before creating it."}
            {step === "done" && "Copy the link or send it via email."}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Name *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Greg McCann" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Company Name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Crown & Associates" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client Email</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Project Name</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. AI Chatbot Implementation" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Project Number</Label>
                  <Input value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)}
                    placeholder="Optional, e.g. PR-1024" />
                </div>
              </div>
              {/* Proposal Type */}
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
                        htmlFor={`qpt-${opt.value}`}
                        className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                          proposalType === opt.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value={opt.value} id={`qpt-${opt.value}`} className="mt-0.5" />
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

              {proposalType === "retainer" && (
                <>
                <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Setup Fee</Label>
                  <Input type="number" min={0} value={setupFee} onChange={(e) => setSetupFee(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Monthly Fee</Label>
                  <Input type="number" min={0} value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder="e.g. 625" />
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
                {billingSchedule === "bimonthly" && monthlyFee && Number(monthlyFee) > 0 && (
                  <p className="text-xs text-muted-foreground">Two payments of ${(Number(monthlyFee) / 2).toFixed(2)} each</p>
                )}
                </div>
                </>
              )}

              {proposalType === "hourly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Hourly Rate (USD/hr)</Label>
                  <Input type="number" min={0} value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)} placeholder="e.g. 150" />
                  <p className="text-[11px] text-muted-foreground">Billed as worked.</p>
                </div>
              )}

              {proposalType === "project" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Project Total (USD)</Label>
                  <Input type="number" min={0} value={projectTotal}
                    onChange={(e) => setProjectTotal(e.target.value)} placeholder="e.g. 12000" />
                  <p className="text-[11px] text-muted-foreground">Fixed price. 50% upfront, 50% on delivery.</p>
                </div>
              )}

              {/* Scope / Deliverables / Timeline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deliverables</Label>
                  <Textarea value={deliverables} onChange={(e) => setDeliverables(e.target.value)}
                    placeholder="• Item one&#10;• Item two" rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Timeline</Label>
                  <Textarea value={timeline} onChange={(e) => setTimeline(e.target.value)}
                    placeholder="e.g. Phase 1: weeks 1-2" rows={3} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Scope Description</Label>
                <Textarea value={scopeDescription} onChange={(e) => setScopeDescription(e.target.value)}
                  placeholder="What's included in this engagement?" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  Services Description
                  <Badge variant="outline" className="text-[10px] font-normal"><Sparkles className="h-3 w-3 mr-0.5" />AI polished</Badge>
                </Label>
                <Textarea
                  value={servicesDescription}
                  onChange={(e) => setServicesDescription(e.target.value)}
                  placeholder="Describe services in your own words — AI will clean it up. e.g. 'set up their AI chatbot, automate their email follow-ups, and integrate with their CRM'"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">Cancel</Button>
              <Button variant="outline" onClick={handleGenerateNow}
                disabled={generating || polishing || creating || !clientName.trim()}>
                {generating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" /> Generate Contract Now</>
                )}
              </Button>
              <Button onClick={handlePolishAndPreview}
                disabled={polishing || generating || !clientName.trim()}>
                {polishing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Polishing...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Preview Draft</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="space-y-4 py-2">
              {/* Proposal Preview Card */}
              <div className="rounded-lg border border-border bg-card">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">PROPOSAL PREVIEW — HOW YOUR CLIENT WILL SEE IT</p>
                </div>
                <div className="p-4 space-y-4">
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-bold">Vektiss LLC</h3>
                    <p className="text-xs text-muted-foreground">Service Agreement for {clientName}{companyName ? ` — ${companyName}` : ""}</p>
                  </div>

                  <Separator />

                  {/* Services */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Services Included
                    </h4>
                    <div
                      className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-line"
                      dangerouslySetInnerHTML={{
                        __html: (polishedDescription || "AI & Automation services tailored to your business needs.")
                          .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>'),
                      }}
                    />
                  </div>

                  {/* Pricing */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-primary" /> Pricing
                    </h4>
                    <div className="bg-muted/50 rounded-lg p-3 grid gap-3 sm:grid-cols-2">
                      {Number(setupFee) > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">One-Time Setup Fee</p>
                          <p className="text-lg font-bold font-mono">{fmtCurrency(setupFee)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">Monthly Service Fee</p>
                        <p className="text-lg font-bold font-mono">{fmtCurrency(monthlyFee)}/mo</p>
                        {billingSchedule === "bimonthly" && (
                          <p className="text-xs text-muted-foreground">Billed bi-monthly (15th & 30th)</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editable polished description */}
              {polishedDescription && (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Edit3 className="h-3 w-3" /> Edit polished description
                  </Label>
                  <Textarea
                    value={polishedDescription}
                    onChange={(e) => setPolishedDescription(e.target.value)}
                    rows={4}
                    className="text-sm"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setStep("input")} className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4 mr-1" /> Edit Details
              </Button>
              <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
                {creating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Create Proposal</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "done" && proposalUrl && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">Proposal created! Copy the link or send it via email.</p>
              <div className="flex gap-2">
                <Input value={proposalUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {clientEmail.trim() && (
                <Button variant="default" className="w-full" onClick={handleSendEmail} disabled={sendingEmail}>
                  <Mail className="h-4 w-4 mr-2" />
                  {sendingEmail ? "Sending..." : `Send to ${clientEmail}`}
                </Button>
              )}
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

function EmailProposalDialog({ open, onOpenChange, proposalToken, clientEmail: defaultEmail, clientName }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proposalToken: string;
  clientEmail?: string | null;
  clientName: string;
}) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    const proposalUrl = `${window.location.origin}/proposal/${proposalToken}`;
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          event: "proposal_link",
          eventData: {
            recipient_email: email.trim(),
            client_name: clientName,
            proposal_url: proposalUrl,
          },
        },
      });
      if (error) throw error;
      toast.success(`Proposal sent to ${email}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Email Proposal</DialogTitle>
          <DialogDescription>Send the proposal link to {clientName}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !email.trim()}>
            {sending ? "Sending..." : <><Send className="h-4 w-4 mr-2" /> Send</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminProposals() {
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; token: string; email?: string | null; name: string }>({
    open: false, token: "", name: "",
  });

  const { data: proposals, isLoading, refetch } = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const all = proposals ?? [];
  
  const signed = all.filter((p) => p.status === "signed").length;
  const paid = all.filter((p) => p.status === "paid").length;
  const viewed = all.filter((p) => (p as any).view_count > 0).length;

  const stats = [
    { label: "Total Sent", value: all.length, icon: FileText, color: "text-amber-400" },
    { label: "Opened", value: viewed, icon: Eye, color: "text-purple-400" },
    { label: "Signed", value: signed, icon: CheckCircle, color: "text-blue-400" },
    { label: "Paid", value: paid, icon: CreditCard, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Proposals</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">Track proposals from sent to signed to paid.</p>
        </div>
        <Button onClick={() => setQuickCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Proposal
        </Button>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}>
            <Card className="group hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{s.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              All Proposals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : all.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No proposals yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Setup Fee</TableHead>
                    <TableHead>Monthly Fee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Views</TableHead>
                    <TableHead>Signed</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {all.map((p) => {
                    const cfg = statusConfig[p.status] ?? statusConfig.draft;
                    const clientName = (p as any).clients?.name ?? p.client_name ?? "—";
                    const viewCount = (p as any).view_count ?? 0;
                    const firstViewed = (p as any).first_viewed_at;
                    const lastViewed = (p as any).last_viewed_at;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{clientName}</TableCell>
                        <TableCell>{formatCurrency(p.setup_fee)}</TableCell>
                        <TableCell>{formatCurrency(p.monthly_fee)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {viewCount > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-sm cursor-default">
                                  <Eye className="h-3.5 w-3.5 text-purple-400" />
                                  {viewCount}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>First opened: {firstViewed ? format(new Date(firstViewed), "MMM d, yyyy h:mm a") : "—"}</p>
                                <p>Last viewed: {lastViewed ? format(new Date(lastViewed), "MMM d, yyyy h:mm a") : "—"}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {p.signed_at ? format(new Date(p.signed_at), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {p.paid_at ? format(new Date(p.paid_at), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {format(new Date(p.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => setEmailDialog({ open: true, token: p.token, email: p.client_email, name: clientName })}>
                                  <Mail className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Email proposal link</TooltipContent>
                            </Tooltip>
                            <Button variant="ghost" size="icon" asChild>
                              <a href={`/proposal/${p.token}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <QuickCreateDialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen} onCreated={() => refetch()} />
      <EmailProposalDialog
        open={emailDialog.open}
        onOpenChange={(o) => setEmailDialog((prev) => ({ ...prev, open: o }))}
        proposalToken={emailDialog.token}
        clientEmail={emailDialog.email}
        clientName={emailDialog.name}
      />
    </div>
  );
}
