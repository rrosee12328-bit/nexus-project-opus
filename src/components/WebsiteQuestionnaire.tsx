import { useState } from "react";
import { WEBSITE_QUESTIONS } from "@/lib/websiteQuestionnaire";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import "@/styles/staff-workspace.css";

export function WebsiteQuestionnaire({ token, recipientName, onDone }: { token: string; recipientName: string | null; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!Object.values(answers).some(value => value.trim())) { toast.error("Please answer at least one question before submitting."); return; }
    setBusy(true);
    try {
      const sections = WEBSITE_QUESTIONS.map(section => ({ title: section.title, questions: section.questions.map(q => ({ key: q.key, label: q.label, answer: answers[q.key]?.trim() || null })) }));
      sections.push({ title: "Required materials", questions: [{ key: "materials", label: "Shared materials links", answer: answers.materials?.trim() || null }] });
      const { error } = await supabase.rpc("submit_intake_response", { _token: token, _response: { business_name: answers.q1?.trim() || recipientName, response_payload: { form_type: "website_development", title: "Website Development Questionnaire", sections } } });
      if (error) throw error;
      onDone();
    } catch { toast.error("Your answers could not be submitted. Please try again; your entries are still here."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground"><div className="mx-auto max-w-3xl space-y-6">
    <header className="rounded-xl border border-primary/25 bg-card p-6 space-y-4"><span className="staff-wordmark"><img src="/vektiss-logo.png" alt="Vektiss" /></span><p className="text-sm text-primary">{recipientName || "Website planning"}</p><h1 className="text-3xl font-bold">Website Development Questionnaire</h1><p>Thank you for choosing Vektiss. Tell us about your company, services, branding, and website needs.</p><p className="text-sm text-muted-foreground">All questions are optional. Leave anything you are unsure about blank. Answers are saved when you submit; keep this page open until then.</p></header>
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">Do not include patient records, medical histories, passwords, or sensitive patient information. Arrange domain access separately through a secure method.</div>
    {WEBSITE_QUESTIONS.map((section, index) => <section key={section.title} className="rounded-xl border border-border bg-card p-5 sm:p-7 space-y-5"><h2 className="text-lg font-bold border-b border-border pb-3"><span className="text-primary mr-2">{index + 1}.</span>{section.title}</h2>{section.questions.map(q => <div key={q.key} className="space-y-2"><label htmlFor={q.key} className="block text-sm font-medium">{q.key.slice(1)}. {q.label}</label>{q.options.length > 0 && <p className="text-xs text-muted-foreground">Options to consider: {q.options.join("; ")}. Enter your selection(s) below.</p>}<Textarea id={q.key} maxLength={5000} rows={3} value={answers[q.key] || ""} onChange={e => setAnswers(current => ({ ...current, [q.key]: e.target.value }))} /></div>)}</section>)}
    <section className="rounded-xl border border-border bg-card p-6 space-y-3"><h2 className="text-lg font-bold">Required materials, if available</h2><p className="text-sm">Company logo, brand colors or guide, company/team photographs, service descriptions or brochures, leadership photos and biographies, recruitment requirements, social links, and domain information.</p><label htmlFor="materials" className="block text-sm">Paste shared file or folder links (Dropbox, Google Drive, or similar). Direct uploads are not available on this form.</label><Textarea id="materials" rows={4} maxLength={5000} value={answers.materials || ""} onChange={e => setAnswers(current => ({ ...current, materials: e.target.value }))} /></section>
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-6 space-y-3"><h2 className="text-lg font-bold">Next steps</h2><p>Vektiss will review your responses and materials before beginning development.</p><p className="text-sm">Your website project includes professional website design, mobile optimization, service pages, a nurse recruitment application, contact forms, basic SEO, and website launch.</p><p className="text-sm">Project timeline: within 7 calendar days of full payment, provided all required materials and approvals are received promptly.</p><Button disabled={busy} onClick={submit}>{busy ? "Submitting..." : "Submit questionnaire"}</Button></section>
  </div></main>;
}
