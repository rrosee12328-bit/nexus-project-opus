import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BusinessOverviewDocument } from "@/components/BusinessOverviewDocument";
import { discoveryGroups } from "@/lib/discoveryQuestions";
import { imhOverview, overviewDb, overviewLink, type Overview } from "@/lib/businessOverviews";

const blank = { company_name: "", recipient_email: "", title: "Business Operations & Growth Overview", content: "" };
export default function BusinessOverviews() {
  const [rows, setRows] = useState<Overview[]>([]);
  const [selected, setSelected] = useState<Overview | null>(null);
  const [form, setForm] = useState(blank);
  const [days, setDays] = useState("30");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  async function refresh() {
    const { data, error } = await overviewDb.from("business_overviews").select("*").order("created_at", { ascending: false });
    if (error) setError("Could not load overviews. Confirm the business-overviews database migration is deployed, then retry.");
    else { setRows(data || []); setError(""); }
  }
  useEffect(() => { void refresh(); }, []);
  function change(key: keyof typeof blank, value: string) {
    setForm(previous => ({ ...previous, [key]: value })); setReviewed(false); setDirty(true);
  }
  function open(row: Overview | null) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSelected(row); setForm(row ? { company_name: row.company_name, recipient_email: row.recipient_email, title: row.title, content: row.content } : blank);
    setReviewed(false); setDirty(false); setPreview(false);
  }
  async function save(publish: boolean) {
    if (publish && !reviewed) { toast.error("Review and approve the company-facing content first."); return; }
    const expires = Number(days);
    if (!Number.isInteger(expires) || expires < 1 || expires > 365) { toast.error("Link lifetime must be 1 to 365 days."); return; }
    setBusy(true);
    try {
      const values = { ...form, company_name: form.company_name.trim(), recipient_email: form.recipient_email.trim(), title: form.title.trim(), content: form.content.trim(), published: publish, expires_at: new Date(Date.now() + expires * 86400000).toISOString() };
      if (!values.company_name || !values.title || !values.content || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.recipient_email)) throw new Error("Enter a company, valid recipient email, title, and overview.");
      const query = selected ? overviewDb.from("business_overviews").update(values).eq("id", selected.id) : overviewDb.from("business_overviews").insert(values);
      const { data, error } = await query.select().single();
      if (error) throw error;
      setSelected(data); setDirty(false); setReviewed(false); await refresh();
      toast.success(publish ? "Link published. No email has been sent." : "Draft saved. Public access is off.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save overview. Please retry."); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!selected) return;
    setBusy(true);
    try {
      const { data, error } = await overviewDb.from("business_overviews").update({ published: false, share_token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "") }).eq("id", selected.id).select().single();
      if (error) throw error;
      setSelected(data); await refresh(); toast.success("Previous link revoked. Publish again for a new link.");
    } catch { toast.error("Could not revoke the link. Please retry."); }
    finally { setBusy(false); }
  }
  const shareable = selected?.published && new Date(selected.expires_at).getTime() > Date.now();
  return <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-widest text-primary">Vektiss / Sales</p><h1 className="mt-2 text-3xl font-semibold">Business Overviews</h1><p className="mt-2 text-sm text-muted-foreground">A clear next step before a proposal. No client account required.</p></div>
      <Button variant="outline" disabled={busy} onClick={() => open(null)}>New overview</Button>
    </header>
    {error && <div role="alert" className="rounded-xl border border-destructive p-4">{error}<Button variant="outline" className="ml-3" onClick={refresh}>Retry</Button></div>}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-2"><h2 className="mb-3 text-sm font-medium">Saved overviews</h2>{rows.length === 0 && !error && <p className="text-sm text-muted-foreground">No saved overviews yet.</p>}
        {rows.map(row => <button key={row.id} disabled={busy} onClick={() => open(row)} className={`block w-full rounded-xl border p-3 text-left ${selected?.id === row.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
          <span className="block break-words font-medium">{row.company_name}</span><span className="text-xs text-muted-foreground">{!row.published ? "Draft / not shared" : new Date(row.expires_at).getTime() <= Date.now() ? "Expired" : "Link active"}</span>
        </button>)}
      </aside>
      <section className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6">
        {selected?.discovery_submitted_at && <section className="space-y-4 rounded-xl border border-primary/30 p-4">
          <h2 className="text-xl font-semibold">Discovery answers received</h2>
          <p className="text-sm text-muted-foreground">Submitted {new Date(selected.discovery_submitted_at).toLocaleString()}. Submitted through the shared link; recipient identity is not verified.</p>
          {discoveryGroups.map((group, groupIndex) => {
            const start = discoveryGroups.slice(0, groupIndex).reduce((total, item) => total + item.questions.length, 0);
            return <details key={group.title}><summary className="cursor-pointer font-semibold">{group.title}</summary><dl className="mt-3 space-y-3">{group.questions.map((question, index) => <div key={question}><dt className="text-sm font-medium">{question}</dt><dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{selected.discovery_answers?.[start + index] || "Not answered"}</dd></div>)}</dl></details>;
          })}
        </section>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => {
          if (dirty && !window.confirm("Replace unsaved content with the IMH example?")) return;
          setSelected(null); setForm({ ...imhOverview, recipient_email: "" }); setReviewed(false); setDirty(true);
        }}>Use Integrated Mobile Health example</Button><Button variant="outline" onClick={() => setPreview(!preview)}>{preview ? "Edit content" : "Preview company view"}</Button></div>
        <p className="text-sm text-muted-foreground">Anyone with the published link can read this overview. Do not include internal notes, pricing calculations, passwords, or patient information. The recipient email is staff-only.</p>
        {preview ? <BusinessOverviewDocument preview overview={{ ...form, expires_at: selected?.expires_at || "" }} /> : <div className="space-y-4">
          <label className="block text-sm">Company<Input className="mt-2" value={form.company_name} maxLength={200} onChange={e => change("company_name", e.target.value)} /></label>
          <label className="block text-sm">Recipient email<Input className="mt-2" type="email" value={form.recipient_email} maxLength={254} onChange={e => change("recipient_email", e.target.value)} placeholder="Contact's email; no account needed" /></label>
          <label className="block text-sm">Overview title<Input className="mt-2" value={form.title} maxLength={200} onChange={e => change("title", e.target.value)} /></label>
          <label className="block text-sm">Company-facing overview<Textarea className="mt-2 min-h-80" value={form.content} maxLength={40000} onChange={e => change("content", e.target.value)} placeholder="Needs, recommended solutions, outcomes, priorities, and next steps. Markdown headings and lists supported." /></label>
        </div>}
        <label className="block text-sm">Link valid for (days after publishing)<Input className="mt-2 max-w-40" type="number" min={1} max={365} value={days} onChange={e => setDays(e.target.value)} /></label>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the company-facing content and approve sharing it.</label>
        {selected?.published && <p className="text-sm text-amber-500">Saving as draft turns off the current public page. Publishing updates the existing link; revoking invalidates it permanently.</p>}
        <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => save(false)}>Save draft</Button><Button disabled={busy || !reviewed} onClick={() => save(true)}>{busy ? "Saving..." : "Publish link"}</Button>{selected?.published && <Button variant="outline" disabled={busy} onClick={revoke}>Revoke link</Button>}</div>
        {shareable && <div className="space-y-3 rounded-lg border border-primary/30 p-4">
          <p className="text-sm">Ready to share with {selected.recipient_email}. No email sent.</p>
          {dirty && <p className="text-sm text-amber-500">Publish your unsaved changes before copying the link.</p>}
          <Input aria-label="Published overview link" readOnly value={overviewLink(selected.share_token)} />
          <Button disabled={dirty || busy} onClick={async () => { try { await navigator.clipboard.writeText(overviewLink(selected.share_token)); toast.success("Link copied"); } catch { toast.error("Copy failed. Select and copy the link above."); } }}>Copy link</Button>
          <p className="text-xs text-muted-foreground">Expires {new Date(selected.expires_at).toLocaleString()}. No login, signature, or payment is requested.</p>
        </div>}
      </section>
    </div>
  </div>;
}
