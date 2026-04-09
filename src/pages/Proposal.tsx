import { useEffect, useState, useRef } from "react";
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
}

type Step = "info" | "nda" | "nda-sign" | "review" | "sign" | "pay" | "done";

const STEP_CONFIG: Record<Step, { label: string; num: number; total: number }> = {
  info: { label: "Your Information", num: 1, total: 5 },
  nda: { label: "Non-Disclosure Agreement", num: 2, total: 5 },
  "nda-sign": { label: "Sign NDA", num: 2, total: 5 },
  review: { label: "Review Contract", num: 3, total: 5 },
  sign: { label: "Sign Contract", num: 3, total: 5 },
  pay: { label: "Payment", num: 4, total: 5 },
  done: { label: "Complete", num: 5, total: 5 },
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
  const [ndaSigned, setNdaSigned] = useState(false);
  const [ndaSignature, setNdaSignature] = useState<{ type: "typed"; value: string } | null>(null);
  const [contractSignature, setContractSignature] = useState<{ type: "typed"; value: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  // Theme: default to light for proposals
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("proposal-theme");
      if (saved === "dark") return "dark";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("proposal-theme", theme);
  }, [theme]);

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

      if (p.paid_at || searchParams.get("paid") === "true") setStep("done");
      else if (p.signed_at) setStep("pay");
      else setStep("info");

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
    setStep("review");
    toast.success("NDA signed successfully!");
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
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.message || "Failed to start payment");
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

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
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {section.content}
              </div>
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
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              >
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
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
                <div className="flex justify-end">
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
          {step === "pay" && (
            <Card className="flex-1">
              <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-6 min-h-[300px]">
                <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Contract Signed!</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Signed by <strong>{proposal.signed_name || contractSignature?.value || clientName}</strong> on{" "}
                    {new Date(proposal.signed_at || Date.now()).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    A copy of the signed contract has been sent to your email.
                  </p>
                </div>
                <Separator />
                {proposal.setup_fee > 0 ? (
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Complete your setup payment of <strong className="text-foreground">{fmt(proposal.setup_fee)}</strong> to get started.
                    </p>
                    <Button size="lg" onClick={handlePay}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Pay {fmt(proposal.setup_fee)} — Get Started
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your monthly service fee of <strong className="text-foreground">{fmt(proposal.monthly_fee)}/mo</strong> will be invoiced separately.
                    </p>
                    <Button size="lg" onClick={handlePay}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Set Up Payment Method
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
