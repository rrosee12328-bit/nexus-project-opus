import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";

interface IntakeForm {
  id: string;
  token: string;
  status: string;
  recipient_name: string | null;
  recipient_email: string | null;
  expires_at: string | null;
  client_id: string | null;
}

const DEFAULT_PLATFORMS = [
  "Instagram", "TikTok", "Facebook", "YouTube",
  "LinkedIn", "X (Twitter)", "Pinterest", "Other",
];

export default function IntakeFormPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // form fields
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");

  const [socials, setSocials] = useState(
    DEFAULT_PLATFORMS.map((p) => ({ platform: p, handle: "" }))
  );
  const [inspirations, setInspirations] = useState([
    { platform: "", handle: "", notes: "" },
    { platform: "", handle: "", notes: "" },
    { platform: "", handle: "", notes: "" },
  ]);
  const [visualStyleNotes, setVisualStyleNotes] = useState("");

  const [companyDescription, setCompanyDescription] = useState("");
  const [targetDemographic, setTargetDemographic] = useState("");
  const [competitors, setCompetitors] = useState("");

  const [brandVoice, setBrandVoice] = useState("");
  const [brandGuidelines, setBrandGuidelines] = useState("");
  const [differentiators, setDifferentiators] = useState("");

  const [activePlatforms, setActivePlatforms] = useState("");
  const [expansionPlatforms, setExpansionPlatforms] = useState("");
  const [primaryGoals, setPrimaryGoals] = useState("");
  const [dreamDeliverables, setDreamDeliverables] = useState("");

  const [turnaroundExpectations, setTurnaroundExpectations] = useState("");
  const [approvalProcess, setApprovalProcess] = useState("");
  const [successKpis, setSuccessKpis] = useState("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: rows, error: e } = await supabase
        .rpc("get_intake_form_by_token", { _token: token });
      const data = Array.isArray(rows) ? rows[0] : rows;
      if (e || !data) {
        setError("This intake link is invalid or has been removed.");
        setLoading(false);
        return;
      }
      if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
        setError("This intake link has expired.");
        setLoading(false);
        return;
      }
      if (data.status === "completed") {
        setError("This intake form has already been submitted. Thank you!");
        setLoading(false);
        return;
      }
      setForm(data as IntakeForm);
      setContactName(data.recipient_name ?? "");
      setEmail(data.recipient_email ?? "");
      if (data.status === "sent") {
        await supabase.rpc("mark_intake_viewed", { _token: token });
      }
      setLoading(false);
    })();
  }, [token]);

  const updateSocial = (i: number, field: "platform" | "handle", v: string) =>
    setSocials((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: v } : s)));

  const updateInspiration = (i: number, field: "platform" | "handle" | "notes", v: string) =>
    setInspirations((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: v } : s)));

  const addInspiration = () =>
    setInspirations((prev) => [...prev, { platform: "", handle: "", notes: "" }]);

  const removeInspiration = (i: number) =>
    setInspirations((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!form) return;
    if (!businessName.trim() || !contactName.trim() || !email.trim()) {
      toast.error("Please fill in your business name, contact name, and email.");
      return;
    }
    setSubmitting(true);
    const cleanSocials = socials.filter((s) => s.handle.trim());
    const cleanInspirations = inspirations.filter(
      (s) => s.platform.trim() || s.handle.trim() || s.notes.trim()
    );
    const { error: e } = await supabase.from("intake_responses").insert([{
      intake_form_id: form.id,
      client_id: form.client_id,
      business_name: businessName.trim(),
      contact_name: contactName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      website: website.trim() || null,
      social_accounts: cleanSocials,
      inspirations: cleanInspirations,
      visual_style_notes: visualStyleNotes.trim() || null,
      company_description: companyDescription.trim() || null,
      target_demographic: targetDemographic.trim() || null,
      competitors: competitors.trim() || null,
      brand_voice: brandVoice.trim() || null,
      brand_guidelines: brandGuidelines.trim() || null,
      differentiators: differentiators.trim() || null,
      active_platforms: activePlatforms.trim() || null,
      expansion_platforms: expansionPlatforms.trim() || null,
      primary_goals: primaryGoals.trim() || null,
      dream_deliverables: dreamDeliverables.trim() || null,
      turnaround_expectations: turnaroundExpectations.trim() || null,
      approval_process: approvalProcess.trim() || null,
      success_kpis: successKpis.trim() || null,
    }]);
    setSubmitting(false);
    if (e) {
      console.error(e);
      toast.error("Something went wrong submitting the form. Please try again.");
      return;
    }
    setDone(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Thank you!</h1>
            <p className="text-sm text-muted-foreground">
              Your intake has been submitted. The Vektiss team will review your answers and craft a strategy and editing timeline tailored to your brand and goals.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <img src="/vektiss-logo.png" alt="Vektiss" className="h-14 mx-auto object-contain" />
          <h1 className="text-2xl sm:text-3xl font-bold">Business Media Client Intake Form</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Tell us about your business and the look you want on social. Your answers shape the strategy and editing timeline we build for you.
          </p>
        </div>

        {/* Client Information */}
        <Card>
          <CardHeader><CardTitle className="text-base">Client Information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Business Name *</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Primary Contact Name *</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Website URL</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            </div>
          </CardContent>
        </Card>

        {/* Social Media Presence */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Social Media Presence</CardTitle>
            <p className="text-xs text-muted-foreground">
              Include platform and your exact handle or page URL so we can review your current presence.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {socials.map((s, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[160px_1fr]">
                <Input value={s.platform} onChange={(e) => updateSocial(i, "platform", e.target.value)} />
                <Input value={s.handle} onChange={(e) => updateSocial(i, "handle", e.target.value)} placeholder="@handle or URL" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Inspiration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inspiration — Identifying Your Influences</CardTitle>
            <p className="text-xs text-muted-foreground">
              List creators or brands whose content style, aesthetic, or energy resonates with you.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {inspirations.map((s, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[140px_1fr_1.5fr_auto] items-start">
                <Input value={s.platform} onChange={(e) => updateInspiration(i, "platform", e.target.value)} placeholder="Platform" />
                <Input value={s.handle} onChange={(e) => updateInspiration(i, "handle", e.target.value)} placeholder="Handle / Page" />
                <Input value={s.notes} onChange={(e) => updateInspiration(i, "notes", e.target.value)} placeholder="What you love about it" />
                <Button variant="ghost" size="icon" onClick={() => removeInspiration(i)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addInspiration} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add row
            </Button>
            <Separator />
            <div className="space-y-2">
              <Label>Visual styles or ideas that inspire you</Label>
              <Textarea rows={3} value={visualStyleNotes} onChange={(e) => setVisualStyleNotes(e.target.value)} placeholder="e.g. cinematic reels, bold typography, minimalist layouts, fast-paced cuts" />
            </div>
          </CardContent>
        </Card>

        {/* Discovery */}
        <Card>
          <CardHeader><CardTitle className="text-base">Discovery — Delving into Your Domain</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Describe your core company</Label>
              <Textarea rows={3} value={companyDescription} onChange={(e) => setCompanyDescription(e.target.value)} placeholder="Primary products, services, and mission." />
            </div>
            <div className="space-y-2">
              <Label>Your distinct demographic</Label>
              <Textarea rows={3} value={targetDemographic} onChange={(e) => setTargetDemographic(e.target.value)} placeholder="Age, interests, and the problems you solve for them." />
            </div>
            <div className="space-y-2">
              <Label>Direct competitors</Label>
              <Textarea rows={3} value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Main competitors and what sets you apart." />
            </div>
          </CardContent>
        </Card>

        {/* Design */}
        <Card>
          <CardHeader><CardTitle className="text-base">Design — Developing Your Digital Identity</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Desired demeanor / brand voice</Label>
              <Textarea rows={2} value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="Professional, playful, authoritative, approachable…" />
            </div>
            <div className="space-y-2">
              <Label>Design directives</Label>
              <Textarea rows={3} value={brandGuidelines} onChange={(e) => setBrandGuidelines(e.target.value)} placeholder="Existing brand guidelines, logos, color palettes, visual elements." />
            </div>
            <div className="space-y-2">
              <Label>Definitive differentiators</Label>
              <Textarea rows={2} value={differentiators} onChange={(e) => setDifferentiators(e.target.value)} placeholder="Visual or tonal elements that make you instantly recognizable." />
            </div>
          </CardContent>
        </Card>

        {/* Direction */}
        <Card>
          <CardHeader><CardTitle className="text-base">Direction — Defining Social Media Strategy</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Currently active on</Label>
              <Textarea rows={2} value={activePlatforms} onChange={(e) => setActivePlatforms(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Looking to expand into</Label>
              <Textarea rows={2} value={expansionPlatforms} onChange={(e) => setExpansionPlatforms(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Primary goals</Label>
              <Textarea rows={2} value={primaryGoals} onChange={(e) => setPrimaryGoals(e.target.value)} placeholder="Brand awareness, lead gen, community, sales…" />
            </div>
            <div className="space-y-2">
              <Label>Dream deliverables</Label>
              <Textarea rows={3} value={dreamDeliverables} onChange={(e) => setDreamDeliverables(e.target.value)} placeholder="Short-form videos, educational graphics, BTS, testimonials…" />
            </div>
          </CardContent>
        </Card>

        {/* Deployment */}
        <Card>
          <CardHeader><CardTitle className="text-base">Deployment — Timelines &amp; Tactics</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Delivery deadlines / turnaround expectations</Label>
              <Textarea rows={2} value={turnaroundExpectations} onChange={(e) => setTurnaroundExpectations(e.target.value)} placeholder="Expected turnaround, launch dates, upcoming campaigns…" />
            </div>
            <div className="space-y-2">
              <Label>Approval / review process</Label>
              <Textarea rows={2} value={approvalProcess} onChange={(e) => setApprovalProcess(e.target.value)} placeholder="How often you want to review content before it goes live." />
            </div>
            <div className="space-y-2">
              <Label>Success KPIs</Label>
              <Textarea rows={2} value={successKpis} onChange={(e) => setSuccessKpis(e.target.value)} placeholder="How you'll measure success." />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-2 pb-8">
          <Button size="lg" onClick={submit} disabled={submitting}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
            ) : (
              "Submit Intake Form"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
