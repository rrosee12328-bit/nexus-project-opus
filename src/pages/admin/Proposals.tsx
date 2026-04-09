import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, CheckCircle, CreditCard, ExternalLink, Eye, Plus, Mail, Send, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Sent", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  signed: { label: "Signed", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  paid: { label: "Paid", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

function QuickCreateDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [setupFee, setSetupFee] = useState("");
  const [billingSchedule, setBillingSchedule] = useState("monthly");
  const [servicesDescription, setServicesDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [proposalUrl, setProposalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const reset = () => {
    setClientName(""); setClientEmail(""); setCompanyName("");
    setMonthlyFee(""); setSetupFee(""); setBillingSchedule("monthly");
    setServicesDescription(""); setProposalUrl(null); setCopied(false);
    setCreating(false);
  };

  const handleOpen = (o: boolean) => {
    if (o) reset();
    onOpenChange(o);
  };

  const handleCreate = async () => {
    if (!user || !clientName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.from("proposals").insert({
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        company_name: companyName.trim() || null,
        monthly_fee: Number(monthlyFee) || 0,
        setup_fee: Number(setupFee) || 0,
        services_description: servicesDescription.trim() || null,
        billing_schedule: billingSchedule,
        status: "draft",
        created_by: user.id,
      } as any).select("token").single();
      if (error) throw error;
      const url = `${window.location.origin}/proposal/${data.token}`;
      setProposalUrl(url);
      onCreated();
      toast.success("Proposal created!");
      logActivity("created_proposal", "proposal", undefined, `Created proposal for "${clientName}"`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create proposal");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!proposalUrl) return;
    await navigator.clipboard.writeText(proposalUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = async () => {
    if (!proposalUrl || !clientEmail.trim()) {
      toast.error("Client email is required to send");
      return;
    }
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          event: "proposal_link",
          eventData: {
            recipient_email: clientEmail.trim(),
            client_name: clientName,
            proposal_url: proposalUrl,
          },
        },
      });
      if (error) throw error;
      toast.success(`Proposal link sent to ${clientEmail}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Quick Create Proposal
          </DialogTitle>
          <DialogDescription>Enter client details and fees to generate a proposal link instantly.</DialogDescription>
        </DialogHeader>

        {!proposalUrl ? (
          <>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Client Name *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Greg McCann" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Company Name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Crown & Associates" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client Email</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Setup Fee</Label>
                  <Input type="number" min={0} value={setupFee} onChange={(e) => setSetupFee(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Monthly Fee</Label>
                  <Input type="number" min={0} value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder="e.g. 625" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Billing Schedule</Label>
                <Select value={billingSchedule} onValueChange={setBillingSchedule}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly (full amount)</SelectItem>
                    <SelectItem value="bimonthly">Bi-monthly (15th & 30th)</SelectItem>
                  </SelectContent>
                </Select>
                {billingSchedule === "bimonthly" && monthlyFee && Number(monthlyFee) > 0 && (
                  <p className="text-xs text-muted-foreground">Two payments of ${(Number(monthlyFee) / 2).toFixed(2)} each</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Services Description (optional)</Label>
                <Textarea value={servicesDescription} onChange={(e) => setServicesDescription(e.target.value)} placeholder="Describe specific services..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !clientName.trim()}>
                {creating ? "Creating..." : <><Send className="h-4 w-4 mr-2" /> Generate</>}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">Proposal created! Copy the link or send it via email.</p>
              <div className="flex gap-2">
                <Input value={proposalUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {clientEmail.trim() && (
                <Button variant="default" className="w-full" onClick={handleSendEmail} disabled={sendingEmail}>
                  <Mail className="h-4 w-4 mr-2" />
                  {sendingEmail ? "Sending..." : `Send to ${clientEmail}`}
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmailProposalDialog({ open, onOpenChange, proposalToken, clientEmail: defaultEmail, clientName }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proposalToken: string;
  clientEmail?: string | null;
  clientName: string;
}) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    const proposalUrl = `${window.location.origin}/proposal/${proposalToken}`;
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          event: "proposal_link",
          eventData: {
            recipient_email: email.trim(),
            client_name: clientName,
            proposal_url: proposalUrl,
          },
        },
      });
      if (error) throw error;
      toast.success(`Proposal sent to ${email}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Email Proposal</DialogTitle>
          <DialogDescription>Send the proposal link to {clientName}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !email.trim()}>
            {sending ? "Sending..." : <><Send className="h-4 w-4 mr-2" /> Send</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminProposals() {
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; token: string; email?: string | null; name: string }>({
    open: false, token: "", name: "",
  });

  const { data: proposals, isLoading, refetch } = useQuery({
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
  
  const signed = all.filter((p) => p.status === "signed").length;
  const paid = all.filter((p) => p.status === "paid").length;
  const viewed = all.filter((p) => (p as any).view_count > 0).length;

  const stats = [
    { label: "Total Sent", value: all.length, icon: FileText, color: "text-amber-400" },
    { label: "Opened", value: viewed, icon: Eye, color: "text-purple-400" },
    { label: "Signed", value: signed, icon: CheckCircle, color: "text-blue-400" },
    { label: "Paid", value: paid, icon: CreditCard, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Proposals</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">Track proposals from sent to signed to paid.</p>
        </div>
        <Button onClick={() => setQuickCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Proposal
        </Button>
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
                    <TableHead>Views</TableHead>
                    <TableHead>Signed</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {all.map((p) => {
                    const cfg = statusConfig[p.status] ?? statusConfig.draft;
                    const clientName = (p as any).clients?.name ?? p.client_name ?? "—";
                    const viewCount = (p as any).view_count ?? 0;
                    const firstViewed = (p as any).first_viewed_at;
                    const lastViewed = (p as any).last_viewed_at;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{clientName}</TableCell>
                        <TableCell>{formatCurrency(p.setup_fee)}</TableCell>
                        <TableCell>{formatCurrency(p.monthly_fee)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {viewCount > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-sm cursor-default">
                                  <Eye className="h-3.5 w-3.5 text-purple-400" />
                                  {viewCount}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>First opened: {firstViewed ? format(new Date(firstViewed), "MMM d, yyyy h:mm a") : "—"}</p>
                                <p>Last viewed: {lastViewed ? format(new Date(lastViewed), "MMM d, yyyy h:mm a") : "—"}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
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
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => setEmailDialog({ open: true, token: p.token, email: p.client_email, name: clientName })}>
                                  <Mail className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Email proposal link</TooltipContent>
                            </Tooltip>
                            <Button variant="ghost" size="icon" asChild>
                              <a href={`/proposal/${p.token}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
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

      <QuickCreateDialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen} onCreated={() => refetch()} />
      <EmailProposalDialog
        open={emailDialog.open}
        onOpenChange={(o) => setEmailDialog((prev) => ({ ...prev, open: o }))}
        proposalToken={emailDialog.token}
        clientEmail={emailDialog.email}
        clientName={emailDialog.name}
      />
    </div>
  );
}
