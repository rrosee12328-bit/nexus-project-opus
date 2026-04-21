import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderContract } from "@/lib/contractTemplate";
import { renderNda } from "@/lib/ndaTemplate";
import SignaturePad from "@/components/proposal/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, FileSignature, CheckCircle2, CreditCard, AlertCircle,
  ShieldCheck, ScrollText, ArrowRight, ArrowLeft, Sun, Moon,
  FileText, Lock, Zap, ExternalLink, Save,
} from "lucide-react";
import { toast } from "sonner";

interface ProposalData {
  id: string;
  token: string;
  status: string;
  client_name: string | null;
  company_name: string | null;
  client_address: string | null;
  client_email: string | null;
  setup_fee: number;
  monthly_fee: number;
  services_description: string | null;
  signed_at: string | null;
  signed_name: string | null;
  paid_at: string | null;
  proposal_type?: string | null;
  hourly_rate?: number | null;
  project_total?: number | null;
  scope_description?: string | null;
  deliverables?: string | null;
  timeline?: string | null;
  project_name?: string | null;
  project_number?: string | null;
  billing_schedule?: string | null;
  cost_analysis_url?: string | null;
}

type Step = "overview" | "info" | "nda" | "nda-sign" | "nda-done" | "review" | "sign" | "pay" | "done";

const STEP_CONFIG: Record<Step, { label: string; num: number; total: number }> = {
  overview: { label: "Proposal Overview", num: 1, total: 7 },
  info: { label: "Your Information", num: 2, total: 7 },
  nda: { label: "Non-Disclosure Agreement", num: 3, total: 7 },
  "nda-sign": { label: "Sign NDA", num: 3, total: 7 },
  "nda-done": { label: "NDA Complete", num: 4, total: 7 },
  review: { label: "Review Contract", num: 5, total: 7 },
  sign: { label: "Sign Contract", num: 5, total: 7 },
  pay: { label: "Payment", num: 6, total: 7 },
  done: { label: "Complete", num: 7, total: 7 },
};

export default function ProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const [step, setStep] = useState<Step>("info");

  // Scroll to top only on major step changes (not sub-steps like nda→nda-sign or review→sign)
  const prevStepRef = useRef<Step | null>(null);
  useEffect(() => {
    const subStepTransitions: Record<string, string[]> = {
      "nda-sign": ["nda"],
      "sign": ["review"],
    };
    const isSubStep = subStepTransitions[step]?.includes(prevStepRef.current || "");
    if (!isSubStep) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
    prevStepRef.current = step;
  }, [step]);
  const [ndaSigned, setNdaSigned] = useState(false);
  const [ndaSignature, setNdaSignature] = useState<{ type: "typed"; value: string } | null>(null);
  const [contractSignature, setContractSignature] = useState<{ type: "typed"; value: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  // Theme: default to light for proposals
  const { theme: appTheme, setTheme: setAppTheme } = useTheme();

  // Detect if the current viewer is an admin (only admins see internal links)
  const [isAdmin, setIsAdmin] = useState(false);
  const [costAnalysisInput, setCostAnalysisInput] = useState("");
  const [savingCostUrl, setSavingCostUrl] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { if (active) setIsAdmin(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (active) setIsAdmin(!!data);
    })();
    return () => { active = false; };
  }, []);

  // Default proposal to light mode on first visit
  useEffect(() => {
    const saved = localStorage.getItem("proposal-theme");
    if (!saved) {
      setAppTheme("light");
      localStorage.setItem("proposal-theme", "light");
    }
  }, []);

  const toggleProposalTheme = useCallback(() => {
    const next = appTheme === "dark" ? "light" : "dark";
    setAppTheme(next);
    localStorage.setItem("proposal-theme", next);
  }, [appTheme, setAppTheme]);

  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from("proposals")
        .select("*")
        .eq("token", token)
        .single();
      if (fetchError || !data) {
        setError("This proposal link is invalid or has expired.");
        setLoading(false);
        return;
      }
      const p = data as unknown as ProposalData;
      setProposal(p);
      setClientName(p.client_name || "");
      setCompanyName(p.company_name || "");
      setClientAddress(p.client_address || "");
      setClientEmail(p.client_email || "");
      setCostAnalysisInput(p.cost_analysis_url || "");

      if (p.paid_at || searchParams.get("paid") === "true") setStep("done");
      else if (p.signed_at) setStep("pay");
      else setStep("overview");

      setLoading(false);

      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/track-proposal-view`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_token: token }) }
        );
      } catch (_) {}
    };
    void load();
  }, [token]);

  const handleDocScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom && !scrolledToBottom) setScrolledToBottom(true);
  };

  const resetScroll = () => {
    setScrolledToBottom(false);
    setTimeout(() => docRef.current?.scrollTo({ top: 0 }), 50);
  };

  const handleInfoSubmit = () => {
    if (!clientName.trim() || !clientEmail.trim()) {
      toast.error("Please fill in your name and email");
      return;
    }
    resetScroll();
    setStep("nda");
  };

  const handleNdaSign = () => {
    if (!ndaSignature) {
      toast.error("Please check the agreement box to sign the NDA");
      return;
    }
    setNdaSigned(true);
    resetScroll();
    setStep("nda-done");
  };

  const handleSign = async () => {
    if (!contractSignature) {
      toast.error("Please check the agreement box to sign");
      return;
    }
    if (!proposal) return;
    setSigning(true);
    try {
      const signedName = contractSignature.value;

      const { error: signError } = await supabase.functions.invoke("sign-proposal", {
        body: {
          token: proposal.token,
          signed_name: signedName,
          client_name: clientName.trim(),
          company_name: companyName.trim(),
          client_address: clientAddress.trim(),
          client_email: clientEmail.trim(),
        },
      });
      if (signError) throw signError;
      setProposal((p) => p ? { ...p, signed_at: new Date().toISOString(), signed_name: signedName } : p);
      setStep("pay");
      toast.success("Contract signed! A copy has been sent to your email.");
    } catch (err: any) {
      toast.error(err.message || "Failed to sign. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  const handlePay = async () => {
    if (!proposal) return;
    try {
      const { data, error: payError } = await supabase.functions.invoke("create-checkout", {
        body: { proposal_token: proposal.token },
      });
      if (payError) throw payError;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start payment");
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

  const handleSaveCostAnalysis = async () => {
    if (!proposal) return;
    const url = costAnalysisInput.trim();
    setSavingCostUrl(true);
    try {
      const { error: upErr } = await supabase
        .from("proposals")
        .update({ cost_analysis_url: url || null })
        .eq("id", proposal.id);
      if (upErr) throw upErr;
      setProposal((p) => p ? { ...p, cost_analysis_url: url || null } : p);
      toast.success(url ? "Cost analysis link saved" : "Cost analysis link removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to save link");
    } finally {
      setSavingCostUrl(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold">Proposal Not Found</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const contractSections = renderContract({
    clientName: clientName || "_______________",
    companyName: companyName || "_______________",
    clientAddress: clientAddress || "_______________",
    clientEmail: clientEmail || "_______________",
    setupFee: proposal.setup_fee,
    monthlyFee: proposal.monthly_fee,
    servicesDescription: proposal.services_description || undefined,
    proposalType: (proposal.proposal_type as any) || "retainer",
    hourlyRate: proposal.hourly_rate || 0,
    projectTotal: proposal.project_total || 0,
    scopeDescription: proposal.scope_description || undefined,
    deliverables: proposal.deliverables || undefined,
    timeline: proposal.timeline || undefined,
  });

  const ndaSections = renderNda({
    clientName: clientName || "_______________",
    companyName: companyName || "_______________",
  });

  const stepCfg = STEP_CONFIG[step];
  const progress = (stepCfg.num / stepCfg.total) * 100;

  const renderDocumentView = (
    sections: { title: string; content: string }[],
    heading: string,
    icon: React.ReactNode
  ) => (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border bg-card px-4 sm:px-6 py-3 flex items-center gap-3">
        {icon}
        <div>
          <h2 className="text-base sm:text-lg font-bold">{heading}</h2>
          <p className="text-xs text-muted-foreground">Scroll to read the entire document</p>
        </div>
      </div>

      <div
        ref={docRef}
        onScroll={handleDocScroll}
        className="flex-1 overflow-y-auto bg-card"
        style={{ maxHeight: "calc(100vh - 320px)", minHeight: 300 }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
          <div className="text-center pb-6 border-b border-border">
            <h1 className="text-xl sm:text-2xl font-bold mb-2">{heading}</h1>
            <p className="text-sm text-muted-foreground">
              Between <strong>Vektiss LLC</strong> and <strong>{clientName || "Client"}</strong>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Effective Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          {sections.map((section, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="text-sm font-bold text-foreground">{section.title}</h3>
              <div
                className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line"
                dangerouslySetInnerHTML={{
                  __html: section.content.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>'),
                }}
              />
              {idx < sections.length - 1 && <Separator className="mt-4" />}
            </div>
          ))}

          <div className="border-t-2 border-border pt-6 mt-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">— End of Document —</p>
            <p className="text-xs text-muted-foreground">Please sign below to acknowledge and agree to the terms above.</p>
          </div>
        </div>
      </div>

      {!scrolledToBottom && (
        <div className="shrink-0 border-t border-border bg-muted/50 px-4 py-2 text-center">
          <p className="text-xs text-muted-foreground animate-pulse">↓ Scroll down to read the full document before signing ↓</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Vektiss LLC</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Service Agreement</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleProposalTheme}
                title={appTheme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {appTheme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
              <Badge variant={step === "done" ? "default" : "secondary"} className="text-[10px] sm:text-xs shrink-0">
                Step {stepCfg.num} of {stepCfg.total} — {stepCfg.label}
              </Badge>
            </div>
          </div>
          <Progress value={progress} className="mt-3 h-1.5" />
          <div className="mt-3 flex gap-4 sm:gap-6 text-xs sm:text-sm">
            {proposal.setup_fee > 0 && (
              <div>
                <span className="text-muted-foreground">Setup:</span>{" "}
                <span className="font-semibold font-mono">{fmt(proposal.setup_fee)}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Monthly:</span>{" "}
              <span className="font-semibold font-mono">{fmt(proposal.monthly_fee)}/mo</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 flex-1 flex flex-col">
          {/* Step 0: Proposal Overview — Document-style Preview */}
          {step === "overview" && (() => {
            const setupAmt = proposal.setup_fee;
            const monthlyAmt = proposal.monthly_fee;
            // Strip markdown bold/italic so AI-polished text reads cleanly
            const cleanText = (t: string) =>
              t.replace(/\*\*(.+?)\*\*/g, '$1')
               .replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, '$1')
               .replace(/^#+\s+/gm, '');
            const today = new Date().toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            });
            const ptype = (proposal.proposal_type || "retainer").toLowerCase();
            const billing = (proposal.billing_schedule || "monthly").toLowerCase();
            const billingLabel = billing === "bimonthly" ? "Bi-monthly (15th & 30th)" : "Monthly";

            return (
              <Card className="flex-1">
                <CardContent className="pt-8 pb-8 px-4 sm:px-10">
                  <div className="max-w-3xl mx-auto space-y-8">
                    {/* Document header */}
                    <div className="text-center pb-6 border-b border-border space-y-2">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Service Proposal</p>
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI &amp; Automation Services</h1>
                      {proposal.project_name && (
                        <p className="text-base sm:text-lg font-semibold text-foreground pt-1">
                          {proposal.project_name}
                        </p>
                      )}
                      {proposal.project_number && (
                        <p className="text-xs font-mono text-muted-foreground">
                          Project No. {proposal.project_number}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Between <strong className="text-foreground">Vektiss LLC</strong> and{" "}
                        <strong className="text-foreground">{clientName || proposal.client_name || "Client"}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground">Effective Date: {today}</p>
                    </div>

                    {/* Admin-only: Cost analysis link */}
                    {/* Admin-only: Cost Analysis section (editable) */}
                    {isAdmin && (
                      <section className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <ScrollText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-semibold text-foreground">Cost Analysis (Admin Only)</p>
                            <p className="text-xs text-muted-foreground">
                              Paste the Google Sheets URL with this project's cost analysis. Visible only to admins — never shown to the client.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            type="url"
                            value={costAnalysisInput}
                            onChange={(e) => setCostAnalysisInput(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="flex-1 bg-background"
                          />
                          <Button
                            onClick={handleSaveCostAnalysis}
                            disabled={savingCostUrl || costAnalysisInput.trim() === (proposal.cost_analysis_url || "")}
                            size="sm"
                          >
                            {savingCostUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                          </Button>
                        </div>
                        {proposal.cost_analysis_url && (
                          <a
                            href={proposal.cost_analysis_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            Open current spreadsheet <ArrowRight className="h-3 w-3" />
                          </a>
                        )}
                      </section>
                    )}

                    {/* Parties */}
                    <section className="space-y-2">
                      <h2 className="text-sm font-bold">Prepared For</h2>
                      <div className="text-sm text-muted-foreground leading-relaxed">
                        {(clientName || proposal.client_name) && (
                          <p><span className="text-foreground font-medium">{clientName || proposal.client_name}</span></p>
                        )}
                        {(companyName || proposal.company_name) && (
                          <p>{companyName || proposal.company_name}</p>
                        )}
                        <p className="text-xs mt-1">
                          Engagement Type:{" "}
                          <span className="text-foreground font-medium capitalize">
                            {ptype === "retainer" ? "Monthly Retainer" : ptype === "project" ? "Fixed Project" : "Hourly"}
                          </span>
                        </p>
                      </div>
                    </section>

                    <Separator />

                    {/* Services */}
                    <section className="space-y-2">
                      <h2 className="text-sm font-bold">Project Overview</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                        {cleanText(
                          proposal.services_description ||
                          proposal.scope_description ||
                          "AI & Automation services tailored to your business needs. Full details are outlined in the contract on the following page."
                        )}
                      </p>
                    </section>

                    {/* Detailed scope (if separate from services_description) */}
                    {proposal.scope_description && proposal.services_description && (
                      <section className="space-y-2">
                        <h2 className="text-sm font-bold">Scope of Services</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                          {cleanText(proposal.scope_description)}
                        </p>
                      </section>
                    )}

                    {/* Deliverables */}
                    {proposal.deliverables && (
                      <section className="space-y-2">
                        <h2 className="text-sm font-bold">Deliverables</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                          {cleanText(proposal.deliverables)}
                        </p>
                      </section>
                    )}

                    {/* Timeline */}
                    {proposal.timeline && (
                      <section className="space-y-2">
                        <h2 className="text-sm font-bold">Timeline</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                          {cleanText(proposal.timeline)}
                        </p>
                      </section>
                    )}

                    <Separator />

                    {/* Investment */}
                    <section className="space-y-3">
                      <h2 className="text-sm font-bold">Investment</h2>
                      <div className="space-y-2 text-sm">
                        {ptype === "retainer" && setupAmt > 0 && (
                          <div className="flex items-baseline justify-between border-b border-border/60 pb-2">
                            <span className="text-muted-foreground">One-Time Setup Fee</span>
                            <span className="font-mono font-semibold">{fmt(setupAmt)}</span>
                          </div>
                        )}
                        {ptype === "retainer" && (
                          <>
                            <div className="flex items-baseline justify-between">
                              <span className="text-muted-foreground">Monthly Service Fee</span>
                              <span className="font-mono font-semibold">{fmt(monthlyAmt)}<span className="text-xs text-muted-foreground font-normal"> /mo</span></span>
                            </div>
                            <div className="flex items-baseline justify-between border-t border-border/60 pt-2">
                              <span className="text-muted-foreground">Billing Schedule</span>
                              <span className="font-medium text-foreground">{billingLabel}</span>
                            </div>
                            {billing === "bimonthly" && monthlyAmt > 0 && (
                              <p className="text-xs text-muted-foreground pt-1">
                                Two payments of {fmt(monthlyAmt / 2)} each — on the 15th and 30th of every month.
                              </p>
                            )}
                          </>
                        )}
                        {ptype === "project" && (
                          <div className="flex items-baseline justify-between">
                            <span className="text-muted-foreground">Project Total (Fixed)</span>
                            <span className="font-mono font-semibold">{fmt(proposal.project_total || 0)}</span>
                          </div>
                        )}
                        {ptype === "project" && (
                          <p className="text-xs text-muted-foreground pt-1">
                            50% due upfront to begin work, 50% due on delivery.
                          </p>
                        )}
                        {ptype === "hourly" && (
                          <div className="flex items-baseline justify-between">
                            <span className="text-muted-foreground">Hourly Rate</span>
                            <span className="font-mono font-semibold">{fmt(proposal.hourly_rate || 0)}<span className="text-xs text-muted-foreground font-normal"> /hr</span></span>
                          </div>
                        )}
                        {ptype === "hourly" && (
                          <p className="text-xs text-muted-foreground pt-1">
                            Time tracked and invoiced as work is completed.
                          </p>
                        )}
                      </div>
                    </section>

                    <Separator />

                    {/* Next steps */}
                    <section className="space-y-3">
                      <h2 className="text-sm font-bold">Next Steps</h2>
                      <ol className="text-sm text-muted-foreground leading-relaxed list-decimal list-inside space-y-1">
                        <li>Provide your contact details</li>
                        <li>Review &amp; sign the mutual Non-Disclosure Agreement</li>
                        <li>Review &amp; sign the AI &amp; Automation Services Contract</li>
                        <li>{setupAmt > 0 ? "Complete the setup payment to begin onboarding" : "Set up monthly billing to begin onboarding"}</li>
                      </ol>
                    </section>

                    <div className="flex justify-center pt-4">
                      <Button onClick={() => setStep("info")} size="lg" className="px-8">
                        Get Started <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}


          {/* Step 1: Client Info */}
          {step === "info" && (
            <Card className="flex-1">
              <CardContent className="pt-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Your Information</h2>
                  <p className="text-sm text-muted-foreground">Please fill in your contact details to proceed.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Full Name *</Label>
                    <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Company Name</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Business Address</Label>
                    <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="123 Main St, City, State ZIP" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Email Address *</Label>
                    <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="john@company.com" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={() => setStep("overview")}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button onClick={handleInfoSubmit} disabled={!clientName.trim() || !clientEmail.trim()} size="lg">
                    Continue to NDA <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: NDA Review & Sign */}
          {(step === "nda" || step === "nda-sign") && (
            <div className="flex-1 flex flex-col gap-4">
              <Card className="flex-1 overflow-hidden flex flex-col">
                {renderDocumentView(
                  ndaSections,
                  "Mutual Non-Disclosure Agreement",
                  <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                )}
              </Card>

              <Card className="shrink-0 border-primary/30">
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Sign NDA</h3>
                  </div>
                  <SignaturePad
                    signerName={clientName}
                    onSignatureChange={(sig) => {
                      setNdaSignature(sig);
                      if (sig && step !== "nda-sign") setStep("nda-sign");
                    }}
                  />
                  <div className="flex items-center justify-between pt-2">
                    <Button variant="outline" size="sm" onClick={() => { resetScroll(); setStep("info"); }}>
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                    <Button onClick={handleNdaSign} disabled={!ndaSignature} size="lg">
                      Sign NDA & Continue <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* NDA Signed — Transition Screen */}
          {step === "nda-done" && (
            <Card className="flex-1">
              <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                  className="h-20 w-20 rounded-full bg-emerald-500/20 flex items-center justify-center"
                >
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="space-y-2"
                >
                  <h2 className="text-xl font-bold">NDA Signed Successfully!</h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Your Non-Disclosure Agreement has been signed. Next, you'll review and sign the Service Agreement contract.
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.4 }}
                >
                  <Separator className="w-48 mx-auto" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1, duration: 0.4 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ScrollText className="h-4 w-4 text-primary" />
                    <span>Up next: AI & Automation Services Contract</span>
                  </div>
                  <Button size="lg" onClick={() => { resetScroll(); setStep("review"); }}>
                    Review Contract <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Contract Review & Sign */}
          {(step === "review" || step === "sign") && (
            <div className="flex-1 flex flex-col gap-4">
              <Card className="flex-1 overflow-hidden flex flex-col">
                {renderDocumentView(
                  contractSections,
                  "AI & Automation Services Contract",
                  <ScrollText className="h-5 w-5 text-primary shrink-0" />
                )}
              </Card>

              <Card className="shrink-0 border-primary/30">
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Sign Contract</h3>
                  </div>
                  <SignaturePad
                    signerName={clientName}
                    onSignatureChange={(sig) => {
                      setContractSignature(sig);
                      if (sig && step !== "sign") setStep("sign");
                    }}
                  />
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => { resetScroll(); setStep("nda"); }}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Back
                      </Button>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                    <Button onClick={handleSign} disabled={!contractSignature || signing} size="lg">
                      {signing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing...</>
                      ) : (
                        <><FileSignature className="h-4 w-4 mr-2" /> Sign & Continue</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Payment */}
          {step === "pay" && (() => {
            const hasSetup = proposal.setup_fee > 0;
            const hasMonthly = proposal.monthly_fee > 0;
            const halfAmount = proposal.monthly_fee / 2;
            // Determine next 15th & 30th for display
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            let next15 = new Date(y, m, 15);
            if (next15 <= now) next15 = new Date(y, m + 1, 15);
            let next30 = new Date(y, m, 30);
            if (next30 <= now) next30 = new Date(y, m + 1, 30);
            const dateFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

            return (
              <Card className="flex-1">
                <CardContent className="pt-6 space-y-6">
                  {/* Contract signed confirmation */}
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className="h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                    </div>
                    <h2 className="text-xl font-bold">Contract Signed!</h2>
                    <p className="text-sm text-muted-foreground">
                      Signed by <strong>{proposal.signed_name || contractSignature?.value || clientName}</strong> on{" "}
                      {new Date(proposal.signed_at || Date.now()).toLocaleDateString("en-US", {
                        year: "numeric", month: "long", day: "numeric",
                      })}
                    </p>
                  </div>

                  <Separator />

                  {/* Billing Summary */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Payment Summary</h3>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      {hasSetup && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">One-Time Setup Fee</span>
                          <span className="text-sm font-bold font-mono">{fmt(proposal.setup_fee)}</span>
                        </div>
                      )}
                      {hasMonthly && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Monthly Service Fee</span>
                          <span className="text-sm font-bold font-mono">{fmt(proposal.monthly_fee)}/mo</span>
                        </div>
                      )}

                      {hasMonthly && !hasSetup && (
                        <>
                          <Separator />
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-foreground">Billing Schedule</p>
                            <p className="text-xs text-muted-foreground">
                              Two payments of <strong className="text-foreground">{fmt(halfAmount)}</strong> each month:
                            </p>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div className="bg-background rounded p-2 text-center">
                                <p className="text-[10px] text-muted-foreground">1st Payment</p>
                                <p className="text-xs font-semibold">{fmt(halfAmount)}</p>
                                <p className="text-[10px] text-muted-foreground">on the 15th</p>
                                <p className="text-[10px] text-primary font-medium">starts {dateFmt(next15)}</p>
                              </div>
                              <div className="bg-background rounded p-2 text-center">
                                <p className="text-[10px] text-muted-foreground">2nd Payment</p>
                                <p className="text-xs font-semibold">{fmt(halfAmount)}</p>
                                <p className="text-[10px] text-muted-foreground">on the 30th</p>
                                <p className="text-[10px] text-primary font-medium">starts {dateFmt(next30)}</p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* CTA */}
                  <div className="flex flex-col items-center text-center space-y-3">
                    {hasSetup ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Complete your setup payment of <strong className="text-foreground">{fmt(proposal.setup_fee)}</strong> to get started.
                        </p>
                        <Button size="lg" onClick={handlePay}>
                          <CreditCard className="h-4 w-4 mr-2" />
                          Pay {fmt(proposal.setup_fee)} — Get Started
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          You'll be redirected to our secure payment provider to save your card. Your first charge of{" "}
                          <strong className="text-foreground">{fmt(halfAmount)}</strong> will be on{" "}
                          <strong className="text-foreground">{dateFmt(next15 < next30 ? next15 : next30)}</strong>.
                        </p>
                        <Button size="lg" onClick={handlePay}>
                          <CreditCard className="h-4 w-4 mr-2" />
                          Set Up Payment — {fmt(proposal.monthly_fee)}/mo
                        </Button>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Secure payment powered by Stripe
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Done */}
          {step === "done" && (
            <Card className="flex-1">
              <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-4 min-h-[300px]">
                <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold">All Set!</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Your NDA and contract are signed, and payment has been received. You'll receive an email with your portal access shortly.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vektiss LLC · 525 N Sam Houston Pkwy E, Suite 670, Houston, TX 77060
        </div>
      </footer>
    </div>
  );
}
