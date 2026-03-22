import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, CheckCircle, CreditCard, Clock, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Sent", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  signed: { label: "Signed", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  paid: { label: "Paid", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

export default function AdminProposals() {
  const { data: proposals, isLoading } = useQuery({
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
  const sent = all.filter((p) => p.status === "draft").length;
  const signed = all.filter((p) => p.status === "signed").length;
  const paid = all.filter((p) => p.status === "paid").length;

  const stats = [
    { label: "Total Sent", value: all.length, icon: FileText, color: "text-amber-400" },
    { label: "Signed", value: signed, icon: CheckCircle, color: "text-blue-400" },
    { label: "Paid", value: paid, icon: CreditCard, color: "text-emerald-400" },
    { label: "Awaiting", value: sent, icon: Clock, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Proposals</h1>
        <p className="text-sm text-muted-foreground hidden sm:block">Track proposals from sent to signed to paid.</p>
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
                    <TableHead>Signed</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {all.map((p) => {
                    const cfg = statusConfig[p.status] ?? statusConfig.draft;
                    const clientName = (p as any).clients?.name ?? p.client_name ?? "—";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{clientName}</TableCell>
                        <TableCell>{formatCurrency(p.setup_fee)}</TableCell>
                        <TableCell>{formatCurrency(p.monthly_fee)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
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
                          <Button variant="ghost" size="icon" asChild>
                            <a href={`/proposal/${p.token}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
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
    </div>
  );
}
