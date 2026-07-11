import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ClipboardList, Copy, Eye, Mail, Plus, Trash2, ExternalLink,
} from "lucide-react";

interface IntakeFormRow {
  id: string;
  token: string;
  client_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  sent_at: string;
  viewed_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  clients?: { name: string } | null;
}

interface IntakeResponse {
  id: string;
  intake_form_id: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  social_accounts: Array<{ platform: string; handle: string }>;
  inspirations: Array<{ platform: string; handle: string; notes: string }>;
  visual_style_notes: string | null;
  company_description: string | null;
  target_demographic: string | null;
  competitors: string | null;
  brand_voice: string | null;
  brand_guidelines: string | null;
  differentiators: string | null;
  active_platforms: string | null;
  expansion_platforms: string | null;
  primary_goals: string | null;
  dream_deliverables: string | null;
  turnaround_expectations: string | null;
  approval_process: string | null;
  success_kpis: string | null;
  submitted_at: string;
}

function publicUrl(token: string) {
  return `${window.location.origin}/intake/${token}`;
}

function randomToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(24);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

export default function AdminIntakes() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState<IntakeFormRow | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["intake-forms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intake_forms")
        .select("*, clients(name)")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IntakeFormRow[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("intake_forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake-forms"] });
      toast.success("Intake link deleted");
    },
  });

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(publicUrl(token));
    toast.success("Link copied to clipboard");
  };

  const resendEmail = async (row: IntakeFormRow) => {
    if (!row.recipient_email) {
      toast.error("No recipient email on file. Copy the link and send manually.");
      return;
    }
    const url = publicUrl(row.token);
    const name = row.recipient_name || "there";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background-color:#ffffff; padding: 40px 25px;">
  <h1 style="font-size:24px; font-weight:bold; color:#0d0d0d; margin:0 0 20px;">Business Media Intake Form</h1>
  <p style="font-size:14px; color:#6b6b6b; line-height:1.6; margin:0 0 20px;">Hi ${name}, thanks for working with Vektiss. Please take a few minutes to complete our short intake form so we can craft the right strategy and editing timeline for your brand.</p>
  <a href="${url}" style="display:inline-block; background-color:hsl(213,100%,58%); color:#ffffff; font-size:14px; font-weight:600; border-radius:6px; padding:12px 24px; text-decoration:none;">Open Intake Form</a>
  <p style="font-size:12px; color:#999999; margin:30px 0 0;">Or paste this link in your browser: ${url}</p>
</body></html>`;
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        to: row.recipient_email,
        subject: "Vektiss Business Media — quick intake form",
        html,
        text: `Hi ${name}, please complete our intake form: ${url}`,
        label: "intake_form_invite",
      },
    });
    if (error) {
      console.error(error);
      toast.error("Couldn't send the email. Copy the link and share manually.");
      return;
    }
    toast.success("Email sent");
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      sent: "bg-muted text-foreground",
      viewed: "bg-primary/10 text-primary",
      completed: "bg-success/15 text-success",
    };
    return <Badge className={map[s] || ""} variant="outline">{s}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Intake Forms
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send the Business Media intake form to prospects and clients, and review their responses here.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Intake Link
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : !rows?.length ? (
            <p className="p-6 text-sm text-muted-foreground">
              No intake links yet. Click "New Intake Link" to generate one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.recipient_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.recipient_email || ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.clients?.name || <span className="text-muted-foreground">Prospect</span>}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.sent_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.completed_at ? format(new Date(r.completed_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" title="Copy link" onClick={() => copyLink(r.token)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Open link" asChild>
                          <a href={publicUrl(r.token)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                        {r.recipient_email && (
                          <Button size="icon" variant="ghost" title="Send email" onClick={() => resendEmail(r)}>
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                        {r.status === "completed" && (
                          <Button size="icon" variant="ghost" title="View response" onClick={() => setViewing(r)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Delete this intake link and any submitted response?")) {
                              deleteMut.mutate(r.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewIntakeDialog open={newOpen} onOpenChange={setNewOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["intake-forms"] })} />
      <ViewResponseDialog form={viewing} onOpenChange={(o) => !o && setViewing(null)} />
    </div>
  );
}

function NewIntakeDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdRow, setCreatedRow] = useState<{ token: string; email: string | null; name: string | null } | null>(null);

  const { data: clients } = useQuery({
    queryKey: ["intake-client-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, email")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const reset = () => {
    setName(""); setEmail(""); setClientId("none"); setCreatedUrl(null); setCreatedRow(null);
  };

  const create = async () => {
    if (!name.trim() && clientId === "none") {
      toast.error("Enter a recipient name or pick a client.");
      return;
    }
    setSaving(true);
    const token = randomToken();
    const chosenClient = clients?.find((c) => c.id === clientId);
    const finalName = name.trim() || chosenClient?.name || null;
    const finalEmail = email.trim() || chosenClient?.email || null;
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("intake_forms")
      .insert([{
        token,
        client_id: clientId === "none" ? null : clientId,
        recipient_name: finalName,
        recipient_email: finalEmail,
        created_by: user.user?.id ?? null,
      }])
      .select()
      .single();
    setSaving(false);
    if (error || !data) {
      console.error(error);
      toast.error("Couldn't create the intake link.");
      return;
    }
    const url = `${window.location.origin}/intake/${token}`;
    setCreatedUrl(url);
    setCreatedRow({ token, email: finalEmail, name: finalName });
    onCreated();
  };

  const sendEmail = async () => {
    if (!createdRow?.email || !createdUrl) return;
    const nm = createdRow.name || "there";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background-color:#ffffff; padding: 40px 25px;">
  <h1 style="font-size:24px; font-weight:bold; color:#0d0d0d; margin:0 0 20px;">Business Media Intake Form</h1>
  <p style="font-size:14px; color:#6b6b6b; line-height:1.6; margin:0 0 20px;">Hi ${nm}, thanks for working with Vektiss. Please take a few minutes to complete our short intake form so we can craft the right strategy and editing timeline for your brand.</p>
  <a href="${createdUrl}" style="display:inline-block; background-color:hsl(213,100%,58%); color:#ffffff; font-size:14px; font-weight:600; border-radius:6px; padding:12px 24px; text-decoration:none;">Open Intake Form</a>
  <p style="font-size:12px; color:#999999; margin:30px 0 0;">Or paste this link in your browser: ${createdUrl}</p>
</body></html>`;
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        to: createdRow.email,
        subject: "Vektiss Business Media — quick intake form",
        html,
        text: `Hi ${nm}, please complete our intake form: ${createdUrl}`,
        label: "intake_form_invite",
      },
    });
    if (error) {
      console.error(error);
      toast.error("Couldn't send the email.");
      return;
    }
    toast.success("Email sent");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Intake Link</DialogTitle>
        </DialogHeader>
        {!createdUrl ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Link to existing client (optional)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="No client — prospect" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client — prospect</SelectItem>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recipient Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label>Recipient Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
              <p className="text-xs text-muted-foreground">Leave empty to just copy a link and share manually.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Your intake link is ready. Copy it or send it directly.</p>
            <div className="flex items-center gap-2">
              <Input value={createdUrl} readOnly className="text-xs" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(createdUrl); toast.success("Copied"); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          {!createdUrl ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create Link"}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { onOpenChange(false); }}>Done</Button>
              {createdRow?.email && <Button onClick={sendEmail} className="gap-2"><Mail className="h-4 w-4" /> Send Email</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewResponseDialog({
  form, onOpenChange,
}: { form: IntakeFormRow | null; onOpenChange: (o: boolean) => void }) {
  const { data: response, isLoading } = useQuery({
    queryKey: ["intake-response", form?.id],
    queryFn: async () => {
      if (!form) return null;
      const { data, error } = await supabase
        .from("intake_responses")
        .select("*")
        .eq("intake_form_id", form.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as IntakeResponse | null;
    },
    enabled: !!form,
  });

  const section = (title: string, body: React.ReactNode) => (
    <div className="space-y-1">
      <h4 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">{title}</h4>
      <div className="text-sm">{body}</div>
    </div>
  );

  const line = (label: string, val?: string | null) =>
    val ? (
      <div className="grid grid-cols-[140px_1fr] gap-2 py-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm whitespace-pre-wrap">{val}</span>
      </div>
    ) : null;

  return (
    <Dialog open={!!form} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Intake Response</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : !response ? (
          <p className="text-sm text-muted-foreground py-6">No response submitted yet.</p>
        ) : (
          <div className="space-y-6 py-2">
            {section("Client Information", (
              <div>
                {line("Business", response.business_name)}
                {line("Contact", response.contact_name)}
                {line("Email", response.email)}
                {line("Phone", response.phone)}
                {line("Website", response.website)}
              </div>
            ))}
            {response.social_accounts?.length > 0 && section("Social Media Presence", (
              <ul className="space-y-1">
                {response.social_accounts.map((s, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-muted-foreground w-24 inline-block">{s.platform}</span>
                    <span>{s.handle}</span>
                  </li>
                ))}
              </ul>
            ))}
            {response.inspirations?.length > 0 && section("Inspiration", (
              <ul className="space-y-2">
                {response.inspirations.map((s, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-medium">{s.platform} — {s.handle}</div>
                    {s.notes && <div className="text-muted-foreground text-xs mt-0.5">{s.notes}</div>}
                  </li>
                ))}
              </ul>
            ))}
            {response.visual_style_notes && section("Visual style notes", <p className="whitespace-pre-wrap">{response.visual_style_notes}</p>)}
            {(response.company_description || response.target_demographic || response.competitors) && section("Discovery", (
              <div className="space-y-3">
                {response.company_description && <div><div className="text-xs text-muted-foreground">Company</div><p className="whitespace-pre-wrap">{response.company_description}</p></div>}
                {response.target_demographic && <div><div className="text-xs text-muted-foreground">Demographic</div><p className="whitespace-pre-wrap">{response.target_demographic}</p></div>}
                {response.competitors && <div><div className="text-xs text-muted-foreground">Competitors</div><p className="whitespace-pre-wrap">{response.competitors}</p></div>}
              </div>
            ))}
            {(response.brand_voice || response.brand_guidelines || response.differentiators) && section("Design", (
              <div className="space-y-3">
                {response.brand_voice && <div><div className="text-xs text-muted-foreground">Voice</div><p className="whitespace-pre-wrap">{response.brand_voice}</p></div>}
                {response.brand_guidelines && <div><div className="text-xs text-muted-foreground">Guidelines</div><p className="whitespace-pre-wrap">{response.brand_guidelines}</p></div>}
                {response.differentiators && <div><div className="text-xs text-muted-foreground">Differentiators</div><p className="whitespace-pre-wrap">{response.differentiators}</p></div>}
              </div>
            ))}
            {(response.active_platforms || response.expansion_platforms || response.primary_goals || response.dream_deliverables) && section("Direction", (
              <div className="space-y-3">
                {response.active_platforms && <div><div className="text-xs text-muted-foreground">Active on</div><p className="whitespace-pre-wrap">{response.active_platforms}</p></div>}
                {response.expansion_platforms && <div><div className="text-xs text-muted-foreground">Expanding to</div><p className="whitespace-pre-wrap">{response.expansion_platforms}</p></div>}
                {response.primary_goals && <div><div className="text-xs text-muted-foreground">Goals</div><p className="whitespace-pre-wrap">{response.primary_goals}</p></div>}
                {response.dream_deliverables && <div><div className="text-xs text-muted-foreground">Dream deliverables</div><p className="whitespace-pre-wrap">{response.dream_deliverables}</p></div>}
              </div>
            ))}
            {(response.turnaround_expectations || response.approval_process || response.success_kpis) && section("Deployment", (
              <div className="space-y-3">
                {response.turnaround_expectations && <div><div className="text-xs text-muted-foreground">Turnaround</div><p className="whitespace-pre-wrap">{response.turnaround_expectations}</p></div>}
                {response.approval_process && <div><div className="text-xs text-muted-foreground">Approval process</div><p className="whitespace-pre-wrap">{response.approval_process}</p></div>}
                {response.success_kpis && <div><div className="text-xs text-muted-foreground">KPIs</div><p className="whitespace-pre-wrap">{response.success_kpis}</p></div>}
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2 border-t">Submitted {format(new Date(response.submitted_at), "PPp")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
