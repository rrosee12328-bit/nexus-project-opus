import { useState } from "react";
import AICommandCenter from "@/components/AICommandCenter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Target, DollarSign, TrendingUp } from "lucide-react";
import { ClientFormDialog } from "@/components/ClientFormDialog";
import { DeleteClientDialog } from "@/components/DeleteClientDialog";
import { LeadPipelineKanban } from "@/components/leads/LeadPipelineKanban";
import { motion } from "framer-motion";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

export default function AdminLeads() {
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const leads = clients?.filter((c) => c.status === "lead") ?? [];
  const totalPipelineValue = leads.reduce((s, c) => s + (c.monthly_fee ?? 0) * 12 + (c.setup_fee ?? 0), 0);
  const wonLeads = leads.filter((c) => c.pipeline_stage === "won").length;
  const conversionRate = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

  const openEdit = (c: Client) => { setEditClient(c); setFormOpen(true); };
  const openAddLead = () => {
    setEditClient(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <AICommandCenter pageContext={{ pageType: "leads", title: "Sales Pipeline" }} />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">Track leads from prospect to client conversion.</p>
        </div>
        <Button onClick={openAddLead} size="sm" className="shrink-0 self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" /> Add Lead
        </Button>
      </motion.div>

      {/* Pipeline Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total Leads", value: leads.length, icon: Target, color: "text-purple-400" },
          { label: "Pipeline Value", value: formatCurrency(totalPipelineValue), icon: DollarSign, color: "text-emerald-400" },
          { label: "Conversion Rate", value: `${conversionRate}%`, icon: TrendingUp, color: "text-primary" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
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

      {/* Kanban Board */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-400" />
              Pipeline Board
              {leads.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{leads.length} leads</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeadPipelineKanban
              leads={leads}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          </CardContent>
        </Card>
      </motion.div>

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editClient} />
      <DeleteClientDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        clientId={deleteTarget?.id ?? ""}
        clientName={deleteTarget?.name ?? ""}
      />
    </div>
  );
}
