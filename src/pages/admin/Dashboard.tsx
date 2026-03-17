import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FolderKanban, DollarSign, TrendingUp } from "lucide-react";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

export default function AdminDashboard() {
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["client-payments-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_payments").select("amount");
      if (error) throw error;
      return data;
    },
  });

  const activeClients = clients?.filter((c) => c.status === "active").length ?? 0;
  const totalClients = clients?.length ?? 0;
  const mrr = (clients ?? [])
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const ytdRevenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const stats = [
    { label: "Active Clients", value: activeClients, icon: Users },
    { label: "Total Clients", value: totalClients, icon: FolderKanban },
    { label: "Monthly Recurring", value: formatCurrency(mrr), icon: DollarSign },
    { label: "YTD Revenue", value: formatCurrency(ytdRevenue), icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of your agency operations.</p>
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
    </div>
  );
}
