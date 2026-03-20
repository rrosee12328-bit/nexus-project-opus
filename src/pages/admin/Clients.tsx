import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { UserCheck, UserPlus, DollarSign, PhoneCall, Plus, MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, FileText, Calendar, Briefcase, Users, Send, RefreshCw } from "lucide-react";
import { ClientFormDialog } from "@/components/ClientFormDialog";
import { DeleteClientDialog } from "@/components/DeleteClientDialog";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

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

/** Parse notes into structured sections (Services:, Deliverables:, etc.) */
function parseNotes(notes: string | null): { services?: string; deliverables?: string; status?: string; raw?: string } {
  if (!notes) return {};
  const parts: Record<string, string> = {};

  const servicesMatch = notes.match(/Services:\s*(.+?)(?=Deliverables:|Current Status:|$)/s);
  const deliverablesMatch = notes.match(/Deliverables:\s*(.+?)(?=Current Status:|$)/s);
  

  if (servicesMatch) parts.services = servicesMatch[1].trim().replace(/\.$/, "");
  if (deliverablesMatch) parts.deliverables = deliverablesMatch[1].trim().replace(/\.$/, "");

  // Extract status note — last sentence(s) of notes
  const sentences = notes.split(". ").filter(Boolean);
  const statusSentences = sentences.filter((s) =>
    /progress|established|optimistic|schedule|underway|project|waiting|active|closed|campaign|ended/i.test(s)
  );
  if (statusSentences.length > 0) parts.status = statusSentences.join(". ").trim();

  if (!parts.services && !parts.deliverables) parts.raw = notes;

  return parts;
}

export default function AdminClients() {
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [invitingIds, setInvitingIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const toggleExpanded = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["client-payments-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_payments").select("client_id, amount");
      if (error) throw error;
      return data;
    },
  });

  const { data: clientCosts } = useQuery({
    queryKey: ["client-costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_costs").select("*");
      if (error) throw error;
      return data;
    },
  });

  const costsByClient = (clientCosts ?? []).reduce<Record<string, typeof clientCosts>>((acc, c) => {
    const key = c.client_id;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(c);
    return acc;
  }, {});

  const ytdByClient = (payments ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.client_id] = (acc[p.client_id] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  const actualClients = clients?.filter((c) => c.status !== "lead") ?? [];
  const leads = clients?.filter((c) => c.status === "lead") ?? [];
  const activeClients = actualClients.filter((c) => c.status === "active");
  const onboardingClients = actualClients.filter((c) => c.status === "onboarding");
  const mrr = activeClients.reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const pendingSetup = actualClients.reduce((s, c) => s + (c.balance_due ?? 0), 0);

  const stats = [
    { label: "Active Clients", value: activeClients.length, icon: UserCheck, color: "text-primary" },
    { label: "Onboarding", value: onboardingClients.length, icon: UserPlus, color: "text-warning" },
    { label: "Leads", value: leads.length, icon: PhoneCall, color: "text-purple-400" },
    { label: "Monthly Recurring", value: formatCurrency(mrr), icon: DollarSign, color: "text-emerald-400" },
  ];

  const openEdit = (c: Client) => { setEditClient(c); setFormOpen(true); };
  const openAdd = () => { setEditClient(null); setFormOpen(true); };

  const handleSendInvite = async (client: Client, resend = false) => {
    if (!client.email) return;
    if (!resend && client.user_id) return;
    setInvitingIds((prev) => new Set(prev).add(client.id));
    try {
      const { error } = await supabase.functions.invoke("invite-client", {
        body: { client_id: client.id, resend },
      });
      if (error) throw error;
      toast.success(resend ? `Invite resent to ${client.email}` : `Invite sent to ${client.email}`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invite");
    } finally {
      setInvitingIds((prev) => {
        const next = new Set(prev);
        next.delete(client.id);
        return next;
      });
    }
  };

  const ActionMenu = ({ client }: { client: Client }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openEdit(client)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        {client.email && !client.user_id && (
          <DropdownMenuItem onClick={() => handleSendInvite(client)}>
            <Send className="mr-2 h-4 w-4" /> Send Invite
          </DropdownMenuItem>
        )}
        {client.email && client.user_id && (
          <DropdownMenuItem onClick={() => handleSendInvite(client, true)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Resend Invite
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setDeleteTarget(client)} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Management</h1>
          <p className="text-muted-foreground">View and manage all clients, payments, and services.</p>
        </div>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Client</Button>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
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

      {/* Clients with expandable summaries */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Clients
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : actualClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Users className="h-8 w-8 text-primary/40" />
              </div>
              <div className="text-center">
                <p className="font-semibold">No clients yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add your first client to get started.</p>
              </div>
              <Button onClick={openAdd} size="sm"><Plus className="mr-2 h-4 w-4" /> Add Client</Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {actualClients.map((client) => {
                const isExpanded = expandedClients.has(client.id);
                const parsed = parseNotes(client.notes);
                const hasNotes = !!client.notes;

                return (
                  <Collapsible key={client.id} open={isExpanded} onOpenChange={() => toggleExpanded(client.id)}>
                    {/* Header row */}
                    <div className="flex items-center gap-4 px-6 py-4 hover:bg-accent/50 transition-colors">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{client.name}</p>
                            <p className="text-xs text-muted-foreground">{client.type ?? "No type set"}</p>
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <Badge variant="outline" className={`shrink-0 ${statusColor[client.status] ?? ""}`}>
                        {client.status}
                      </Badge>

                      {client.user_id && (
                        <Badge variant="outline" className="shrink-0 bg-primary/10 text-primary border-primary/20 text-xs">
                          Invited
                        </Badge>
                      )}

                      <div className="hidden md:flex items-center gap-6 shrink-0 text-sm">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Monthly</p>
                          <p className="font-mono font-medium">{formatCurrency(client.monthly_fee)}</p>
                        </div>
                        {(client.balance_due ?? 0) > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Balance</p>
                            <p className="font-mono font-medium text-warning">{formatCurrency(client.balance_due)}</p>
                          </div>
                        )}
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">YTD</p>
                          <p className="font-mono font-medium">{formatCurrency(ytdByClient[client.id] ?? 0)}</p>
                        </div>
                      </div>

                      {hasNotes && (
                        <FileText className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      )}

                      <ActionMenu client={client} />
                    </div>

                    {/* Expanded detail panel */}
                    <CollapsibleContent>
                      <div className="px-6 pb-5 pt-1 ml-[3.25rem]">
                        <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-4">
                          {/* Financial summary row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Monthly Fee</p>
                              <p className="font-mono font-semibold">{formatCurrency(client.monthly_fee)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Setup Fee</p>
                              <p className="font-mono font-semibold">{formatCurrency(client.setup_fee)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Setup Paid</p>
                              <p className="font-mono font-semibold">{formatCurrency(client.setup_paid)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Balance Due</p>
                              <p className={`font-mono font-semibold ${(client.balance_due ?? 0) > 0 ? "text-warning" : ""}`}>
                                {formatCurrency(client.balance_due)}
                              </p>
                            </div>
                          </div>

                          <Separator />

                          {/* Dates */}
                          <div className="flex items-center gap-6 text-sm">
                            {client.start_date && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>Started {new Date(client.start_date + "T00:00:00").toLocaleDateString()}</span>
                              </div>
                            )}
                            {client.email && (
                              <span className="text-muted-foreground">{client.email}</span>
                            )}
                            {client.phone && (
                              <span className="text-muted-foreground">{client.phone}</span>
                            )}
                          </div>

                          {/* Services & Deliverables */}
                          {parsed.services && (
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <Briefcase className="h-3.5 w-3.5 text-primary" />
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Services</p>
                              </div>
                              <p className="text-sm leading-relaxed">{parsed.services}</p>
                            </div>
                          )}

                          {parsed.deliverables && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Deliverables</p>
                              <ul className="text-sm space-y-1 leading-relaxed">
                                {parsed.deliverables.split(/,\s*(?=[A-Z])/).map((item, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-primary mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                    <span>{item.trim()}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {parsed.status && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Current Status</p>
                              <p className="text-sm leading-relaxed text-muted-foreground italic">{parsed.status}</p>
                            </div>
                          )}

                          {/* Profitability breakdown */}
                          {(() => {
                            const costs = costsByClient[client.id] ?? [];
                            if (costs.length === 0) return null;
                            const totalCosts = costs.reduce((s, c) => s + Number(c.amount), 0);
                            const revenue = Number(client.monthly_fee ?? 0);
                            const profit = revenue - totalCosts;
                            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
                            const isMonthly = costs.some((c) => c.is_monthly);

                            return (
                              <>
                                <Separator />
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                    {isMonthly ? "Monthly" : "Project"} Cost Breakdown
                                  </p>
                                  <div className="space-y-1.5">
                                    {costs.map((cost) => (
                                      <div key={cost.id} className="flex items-center justify-between text-sm">
                                        <div>
                                          <span>{cost.category}</span>
                                          {cost.details && (
                                            <span className="text-xs text-muted-foreground ml-2">— {cost.details}</span>
                                          )}
                                        </div>
                                        <span className="font-mono shrink-0">{formatCurrency(Number(cost.amount))}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <Separator className="my-3" />
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">{isMonthly ? "Monthly" : "Project"} Revenue</p>
                                      <p className="font-mono font-semibold">{formatCurrency(revenue)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">Direct Costs</p>
                                      <p className="font-mono font-semibold text-destructive">{formatCurrency(totalCosts)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">Contribution Profit</p>
                                      <p className={`font-mono font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}>
                                        {formatCurrency(profit)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">Margin</p>
                                      <p className={`font-mono font-semibold ${margin >= 50 ? "text-success" : margin >= 20 ? "text-warning" : "text-destructive"}`}>
                                        {margin.toFixed(1)}%
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </>
                            );
                          })()}

                          {parsed.raw && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
                              <p className="text-sm leading-relaxed text-muted-foreground">{parsed.raw}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* Leads */}
      {leads.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-purple-400" />
              Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {leads.map((lead) => (
                <Card key={lead.id} className="hover:border-primary/20 transition-colors">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{lead.type ?? "No type"}</p>
                        {lead.email && <p className="text-xs text-muted-foreground mt-1">{lead.email}</p>}
                      </div>
                      <ActionMenu client={lead} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {/* Pending Setup Alert */}
      {pendingSetup > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="pt-4 pb-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-warning/20 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="font-semibold">Pending Setup Payments</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono font-medium text-warning">{formatCurrency(pendingSetup)}</span> in outstanding setup fees across {actualClients.filter((c) => (c.balance_due ?? 0) > 0).length} clients
              </p>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editClient} />
      <DeleteClientDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} clientId={deleteTarget?.id ?? ""} clientName={deleteTarget?.name ?? ""} />
    </div>
  );
}
