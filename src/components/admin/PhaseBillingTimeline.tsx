import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Circle, Clock, FileText, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  clientId: string;
  setupFee: number;
}

type Milestone = {
  key: "discovery" | "development" | "deploy";
  label: string;
  pct: number;
  amount: number;
};

export default function PhaseBillingTimeline({ clientId, setupFee }: Props) {
  const { user } = useAuth();
  const [paid, setPaid] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Record<string, { id: string; status: string; stripe_invoice_id: string | null }>>({});
  const [invoiceUrls, setInvoiceUrls] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [{ data: payments }, { data: projects }, { data: msRows }, roleRes] = await Promise.all([
        supabase
          .from("client_payments")
          .select("amount, notes")
          .eq("client_id", clientId),
        supabase
          .from("projects")
          .select("current_phase, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("phase_milestone_invoices")
          .select("id, phase, status, amount, stripe_invoice_id")
          .eq("client_id", clientId),
        user?.id
          ? supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      const total = (payments ?? [])
        .filter((p: any) => p.notes !== "Projected")
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      setPaid(total);
      setCurrentPhase((projects?.[0] as any)?.current_phase ?? null);
      setMilestones(
        Object.fromEntries(
          (msRows ?? []).map((m: any) => [m.phase, { id: m.id, status: m.status, stripe_invoice_id: m.stripe_invoice_id }])
        )
      );
      setIsAdmin(!!(roleRes as any)?.data);

      // Resolve hosted invoice URLs for any invoiced rows
      const invoiceIds = (msRows ?? []).map((m: any) => m.stripe_invoice_id).filter(Boolean);
      if (invoiceIds.length) {
        const { data: invs } = await supabase
          .from("stripe_invoices")
          .select("stripe_invoice_id, hosted_invoice_url")
          .in("stripe_invoice_id", invoiceIds);
        setInvoiceUrls(
          Object.fromEntries((invs ?? []).map((i: any) => [i.stripe_invoice_id, i.hosted_invoice_url]))
        );
      } else {
        setInvoiceUrls({});
      }
      setLoading(false);
    };
    load();
  }, [clientId, user?.id, reloadKey]);

  const milestoneDefs: Milestone[] = [
    { key: "discovery", label: "Discovery — Down Payment", pct: 50, amount: setupFee * 0.5 },
    { key: "development", label: "Development", pct: 25, amount: setupFee * 0.25 },
    { key: "deploy", label: "Deploy", pct: 25, amount: setupFee * 0.25 },
  ];

  // Determine paid status by cumulative threshold
  let cumulative = 0;
  const withStatus = milestoneDefs.map((m) => {
    cumulative += m.amount;
    const row = milestones[m.key];
    const isPaid = row?.status === "paid" || paid + 0.01 >= cumulative;
    const isInvoiced = row?.status === "invoiced" && !isPaid;
    const isCurrent = currentPhase === m.key;
    return { ...m, isPaid, isCurrent, isInvoiced, row };
  });

  const handleGenerate = async (milestoneId: string | undefined, phaseKey: string) => {
    if (!milestoneId) {
      toast.error("Milestone not yet recorded — advance the project to this phase first.");
      return;
    }
    setBusy(phaseKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-milestone-invoice", {
        body: { milestone_id: milestoneId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Stripe invoice generated and sent");
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate invoice");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Phase Billing Timeline</CardTitle>
          <div className="text-sm text-muted-foreground">
            ${paid.toLocaleString()} paid of ${setupFee.toLocaleString()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-6">
            {withStatus.map((m) => (
              <li key={m.key} className="ml-6">
                <span
                  className={cn(
                    "absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background",
                    m.isPaid
                      ? "bg-primary text-primary-foreground"
                      : m.isCurrent
                      ? "bg-amber-500 text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {m.isPaid ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : m.isCurrent ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </span>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.pct}% · ${m.amount.toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {m.isCurrent && !m.isPaid && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        Current phase
                      </Badge>
                    )}
                    {m.isPaid ? (
                      <Badge className="bg-primary">Paid</Badge>
                    ) : m.isInvoiced ? (
                      <>
                        <Badge variant="outline" className="border-blue-500 text-blue-600">Invoiced</Badge>
                        {invoiceUrls[m.row?.stripe_invoice_id ?? ""] && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 gap-1"
                            onClick={() => window.open(invoiceUrls[m.row!.stripe_invoice_id!], "_blank")}
                          >
                            <ExternalLink className="h-3 w-3" /> View
                          </Button>
                        )}
                      </>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                    {isAdmin && !m.isPaid && !m.isInvoiced && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 gap-1"
                        disabled={busy === m.key || !m.row?.id}
                        onClick={() => handleGenerate(m.row?.id, m.key)}
                        title={!m.row?.id ? "Advance project to this phase first" : "Generate Stripe invoice"}
                      >
                        {busy === m.key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                        Generate Invoice
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}