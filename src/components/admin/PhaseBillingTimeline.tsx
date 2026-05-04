import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [paid, setPaid] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: payments }, { data: projects }] = await Promise.all([
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
      ]);
      const total = (payments ?? [])
        .filter((p: any) => p.notes !== "Projected")
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      setPaid(total);
      setCurrentPhase((projects?.[0] as any)?.current_phase ?? null);
      setLoading(false);
    };
    load();
  }, [clientId]);

  const milestones: Milestone[] = [
    { key: "discovery", label: "Discovery — Down Payment", pct: 50, amount: setupFee * 0.5 },
    { key: "development", label: "Development", pct: 25, amount: setupFee * 0.25 },
    { key: "deploy", label: "Deploy", pct: 25, amount: setupFee * 0.25 },
  ];

  // Determine paid status by cumulative threshold
  let cumulative = 0;
  const withStatus = milestones.map((m) => {
    cumulative += m.amount;
    const isPaid = paid + 0.01 >= cumulative;
    const isCurrent = currentPhase === m.key;
    return { ...m, isPaid, isCurrent };
  });

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
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
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