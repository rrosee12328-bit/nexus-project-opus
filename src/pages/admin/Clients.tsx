import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, UserCheck, UserPlus, DollarSign } from "lucide-react";

const statusColor: Record<string, string> = {
  active: "bg-success/20 text-success border-success/30",
  onboarding: "bg-warning/20 text-warning border-warning/30",
  closed: "bg-muted text-muted-foreground border-border",
  prospect: "bg-primary/20 text-primary border-primary/30",
  lead: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

export default function AdminClients() {
  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["client-payments-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payments")
        .select("client_id, amount");
      if (error) throw error;
      return data;
    },
  });

  const ytdByClient = (payments ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.client_id] = (acc[p.client_id] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  const activeClients = clients?.filter((c) => c.status === "active") ?? [];
  const onboardingClients = clients?.filter((c) => c.status === "onboarding") ?? [];
  const mrr = activeClients.reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const pendingSetup = (clients ?? []).reduce((s, c) => s + (c.balance_due ?? 0), 0);

  const stats = [
    { label: "Total Clients", value: clients?.length ?? 0, icon: Users },
    { label: "Active", value: activeClients.length, icon: UserCheck },
    { label: "Onboarding", value: onboardingClients.length, icon: UserPlus },
    { label: "Monthly Recurring", value: formatCurrency(mrr), icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Client Management</h1>
        <p className="text-muted-foreground">View and manage all clients, payments, and services.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Clients</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead className="text-right">Setup Fee</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Monthly Fee</TableHead>
                    <TableHead className="text-right">YTD Payments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(clients ?? []).map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-muted-foreground">{client.type ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor[client.status] ?? ""}>
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {client.start_date ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(client.setup_fee)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {(client.balance_due ?? 0) > 0 ? (
                          <span className="text-warning">{formatCurrency(client.balance_due)}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(client.monthly_fee)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(ytdByClient[client.id] ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {pendingSetup > 0 && (
        <Card className="border-warning/30">
          <CardContent className="flex items-center gap-3 py-4">
            <DollarSign className="h-5 w-5 text-warning" />
            <span className="text-sm text-warning">
              Pending setup payments: <span className="font-mono font-bold">{formatCurrency(pendingSetup)}</span>
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
