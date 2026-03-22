import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderContract } from "@/lib/contractTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileSignature, CheckCircle2, CreditCard, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
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

export default function ProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [clientName, setClientName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // Steps
  const [step, setStep] = useState<"info" | "review" | "sign" | "pay" | "done">("info");
  const [signedName, setSignedName] = useState("");
  const [signing, setSigning] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

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

      if (p.paid_at) setStep("done");
      else if (p.signed_at) setStep("pay");
      else if (p.status === "viewed") setStep("review");
      else setStep("info");

      setLoading(false);
    };
    void load();
  }, [token]);

  const handleInfoSubmit = () => {
    if (!clientName.trim() || !clientEmail.trim()) {
      toast.error("Please fill in your name and email");
      return;
    }
    setStep("review");
  };

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSign = async () => {
    if (!signedName.trim()) {
      toast.error("Please type your full legal name to sign");
      return;
    }
    if (!proposal) return;
    setSigning(true);
    try {
      const { error: signError } = await supabase.functions.invoke("sign-proposal", {
        body: {
          token: proposal.token,
          signed_name: signedName.trim(),
          client_name: clientName.trim(),
          company_name: companyName.trim(),
          client_address: clientAddress.trim(),
          client_email: clientEmail.trim(),
        },
      });
      if (signError) throw signError;
      setProposal((p) => p ? { ...p, signed_at: new Date().toISOString(), signed_name: signedName } : p);
      setStep("pay");
      toast.success("Contract signed successfully!");
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
        body: {
          proposal_token: proposal.token,
        },
      });
      if (payError) throw payError;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start payment");
    }
  };

  const contractSections = renderContract({
    clientName: clientName || "_______________",
    companyName: companyName || "_______________",
    clientAddress: clientAddress || "_______________",
    clientEmail: clientEmail || "_______________",
    setupFee: proposal?.setup_fee ?? 0,
    monthlyFee: proposal?.monthly_fee ?? 0,
    servicesDescription: proposal?.services_description || undefined,
  });

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Vektiss LLC</h1>
              <p className="text-sm text-muted-foreground">AI & Automation Services Contract</p>
            </div>
            <Badge
              variant={step === "done" ? "default" : "secondary"}
              className="text-xs"
            >
              {step === "info" && "Step 1 of 3 — Your Info"}
              {step === "review" && "Step 2 of 3 — Review Contract"}
              {step === "sign" && "Step 2 of 3 — Sign Contract"}
              {step === "pay" && "Step 3 of 3 — Payment"}
              {step === "done" && "Complete"}
            </Badge>
          </div>

          {/* Financial Summary */}
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Setup Fee:</span>{" "}
              <span className="font-semibold font-mono">{fmt(proposal.setup_fee)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Monthly:</span>{" "}
              <span className="font-semibold font-mono">{fmt(proposal.monthly_fee)}/mo</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Step 1: Client Info */}
        {step === "info" && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Your Information</h2>
                <p className="text-sm text-muted-foreground">Please fill in your contact details to generate the contract.</p>
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
                <Button onClick={handleInfoSubmit} disabled={!clientName.trim() || !clientEmail.trim()}>
                  Review Contract →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Review & Sign */}
        {(step === "review" || step === "sign") && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">AI & Automation Services Contract</h2>
                  <Button variant="outline" size="sm" onClick={() => setStep("info")}>
                    ← Edit Info
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-6">
                  This Contract is entered into by Vektiss LLC and the undersigned client. Please review all sections carefully.
                </p>

                <div className="space-y-2">
                  {contractSections.map((section, idx) => {
                    const isExpanded = expandedSections.has(idx);
                    return (
                      <div key={idx} className="border border-border rounded-lg overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                          onClick={() => toggleSection(idx)}
                        >
                          <span className="text-sm font-medium">{section.title}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line border-t border-border pt-3">
                            {section.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Signing area */}
            <Card className="border-primary/30">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileSignature className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Sign Contract</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  By typing your full legal name below, you acknowledge that you have read, understood, and agree to be bound by all terms above.
                </p>
                <div className="space-y-1.5">
                  <Label>Full Legal Name</Label>
                  <Input
                    value={signedName}
                    onChange={(e) => {
                      setSignedName(e.target.value);
                      if (step !== "sign") setStep("sign");
                    }}
                    placeholder="Type your full legal name"
                    className="text-lg font-serif italic"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                  <Button
                    onClick={handleSign}
                    disabled={!signedName.trim() || signing}
                    size="lg"
                  >
                    {signing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileSignature className="h-4 w-4 mr-2" />
                    )}
                    {signing ? "Signing..." : "Sign & Continue to Payment"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Payment */}
        {step === "pay" && (
          <Card>
            <CardContent className="pt-6 text-center space-y-6">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Contract Signed!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Signed by <strong>{proposal.signed_name || signedName}</strong> on{" "}
                  {new Date(proposal.signed_at || Date.now()).toLocaleDateString("en-US", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Complete your setup payment of <strong className="text-foreground">{fmt(proposal.setup_fee)}</strong> to get started.
                </p>
                <Button size="lg" onClick={handlePay}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay {fmt(proposal.setup_fee)} — Get Started
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Done */}
        {step === "done" && (
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold">All Set!</h2>
              <p className="text-sm text-muted-foreground">
                Your contract is signed and payment has been received. You'll receive an email with your portal access shortly.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vektiss LLC · 525 N Sam Houston Pkwy E, Suite 670, Houston, TX 77060
        </div>
      </footer>
    </div>
  );
}
