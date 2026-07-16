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
  form_type: "business_media" | "funding_app";
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

const FUNDING_APP_SECTIONS = [
  {
    title: "Branding & Identity",
    questions: [
      { key: "app_name", label: "What do you want to name the app?" },
      { key: "tagline", label: "Do you have a tagline or one-liner that describes what the app does?" },
      { key: "brand_guidelines", label: "What colors, fonts, or brand guidelines should the app follow?" },
      { key: "logo_status", label: "Do you have a logo ready, or does one need to be created?" },
      { key: "app_feeling", label: "What feeling should the app give users — professional and corporate, or friendly and approachable?" },
    ],
  },
  {
    title: "Purpose & Goals",
    questions: [
      { key: "primary_goal", label: "What is the primary goal of the app — to pre-qualify leads, collect applications, or both?" },
      { key: "education_flow", label: "Should the app educate users on funding types before they apply, or go straight to the form?" },
      { key: "funding_scope", label: "Is this app for business funding only, or personal funding as well?" },
    ],
  },
  {
    title: "Qualification Logic",
    questions: [
      { key: "hot_lead_requirements", label: "What are the minimum requirements to be considered a \"hot lead\"? (e.g., credit score, revenue, time in business)" },
      { key: "funding_types", label: "What funding types should the app match people to? (e.g., business lines of credit, SBA loans, equipment financing, merchant cash advances, business credit cards)" },
      { key: "funding_criteria", label: "What are the qualifying criteria for each funding type?" },
      { key: "not_qualified_path", label: "What happens to someone who does not qualify — do they get redirected, offered another service, or added to a nurture list?" },
    ],
  },
  {
    title: "Applicant Information & Documents",
    questions: [
      { key: "personal_information", label: "What personal information should the applicant provide? (e.g., name, address, SSN, date of birth)" },
      { key: "business_information", label: "What business information is required? (e.g., business name, EIN, industry, years in business, monthly revenue)" },
      { key: "document_uploads", label: "Should applicants upload documents? If so, which ones? (e.g., bank statements, tax returns, credit report PDF, EIN letter)" },
      { key: "credit_report_handling", label: "How should the credit report be handled — self-reported score, uploaded PDF, or a third-party pull?" },
    ],
  },
  {
    title: "Results & User Experience",
    questions: [
      { key: "results_delivery", label: "Should applicants see their results immediately on screen, or receive them by email/phone call?" },
      { key: "qualified_experience", label: "What should a qualified applicant see or receive after submitting?" },
      { key: "non_qualified_experience", label: "What should a non-qualified applicant see or receive after submitting?" },
      { key: "account_requirement", label: "Should applicants create an account/login, or is it a one-time form submission?" },
    ],
  },
  {
    title: "Lead Routing & Notifications",
    questions: [
      { key: "hot_lead_destination", label: "Where should hot leads be sent — email, SMS, a CRM (like GoHighLevel or HubSpot), or a dashboard inside the app?" },
      { key: "notification_recipients", label: "Who on your team receives the hot lead notification?" },
      { key: "notification_speed", label: "How quickly does your team need to be notified after a hot lead submits?" },
      { key: "lead_assignment", label: "Should leads be automatically assigned to a specific team member or go to a general inbox?" },
    ],
  },
  {
    title: "Admin & Management",
    questions: [
      { key: "admin_dashboard", label: "Do you need an admin dashboard to view and manage all submissions?" },
      { key: "lead_status_filters", label: "Should the admin be able to filter leads by status — hot, warm, cold, not qualified?" },
      { key: "export_integrations", label: "Do you want to export lead data to a spreadsheet or connect to any existing tools?" },
      { key: "team_access", label: "Will multiple team members need access, or just one admin?" },
    ],
  },
  {
    title: "Timeline & Launch",
    questions: [
      { key: "ready_by", label: "When do you need the app ready by?" },
      { key: "launch_date", label: "Do you have a specific launch date or campaign tied to this app?" },
      { key: "budget", label: "Is there a budget set for the build?" },
    ],
  },
] as const;

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
  const [fundingAnswers, setFundingAnswers] = useState<Record<string, string>>({});

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
      setForm(data as unknown as IntakeForm);
      setContactName(data.recipient_name ?? "");
      setEmail(data.recipient_email ?? "");
      if (data.status === "sent") {
        await (supabase.rpc as any)("mark_intake_viewed", { _token: token });
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

  const updateFundingAnswer = (key: string, value: string) =>
    setFundingAnswers((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form) return;
    if (form.form_type === "funding_app") {
      const appName = fundingAnswers.app_name?.trim();
      if (!appName) {
        toast.error("Please fill in the app name before submitting.");
        return;
      }
      setSubmitting(true);
      const sections = FUNDING_APP_SECTIONS.map((section) => ({
        title: section.title,
        questions: section.questions.map((q) => ({
          key: q.key,
          label: q.label,
          answer: fundingAnswers[q.key]?.trim() || null,
        })),
      }));
      const answers = Object.fromEntries(
        sections.flatMap((section) =>
          section.questions.map((q) => [q.key, q.answer])
        )
      );
      const { error: e } = await (supabase.rpc as any)("submit_intake_response", {
        _token: token!,
        _response: {
          business_name: appName,
          contact_name: contactName.trim() || form.recipient_name || null,
          email: email.trim() || form.recipient_email || null,
          brand_guidelines: fundingAnswers.brand_guidelines?.trim() || null,
          primary_goals: fundingAnswers.primary_goal?.trim() || null,
          turnaround_expectations: fundingAnswers.ready_by?.trim() || null,
          success_kpis: fundingAnswers.hot_lead_requirements?.trim() || null,
          response_payload: {
            form_type: "funding_app",
            title: "Funding App Client Discovery Questions",
            answers,
            sections,
          },
        },
      });
      setSubmitting(false);
      if (e) {
        console.error(e);
        toast.error("Something went wrong submitting the form. Please try again.");
        return;
      }
      setDone(true);
      return;
    }

    if (!businessName.trim() || !contactName.trim() || !email.trim()) {
      toast.error("Please fill in your business name, contact name, and email.");
      return;
    }
    setSubmitting(true);
    const cleanSocials = socials.filter((s) => s.handle.trim());
    const cleanInspirations = inspirations.filter(
      (s) => s.platform.trim() || s.handle.trim() || s.notes.trim()
    );
    const { error: e } = await (supabase.rpc as any)("submit_intake_response", {
      _token: token!,
      _response: {
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
      },
    });
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
    const isFundingApp = form?.form_type === "funding_app";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Thank you!</h1>
            <p className="text-sm text-muted-foreground">
              {isFundingApp
                ? "Your funding app discovery answers have been submitted. The Vektiss team will review them and map the app flow, qualification logic, and launch plan."
                : "Your intake has been submitted. The Vektiss team will review your answers and craft a strategy and editing timeline tailored to your brand and goals."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (form?.form_type === "funding_app") {
    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <img src="/vektiss-logo.png" alt="Vektiss" className="h-14 mx-auto object-contain" />
            <h1 className="text-2xl sm:text-3xl font-bold">Funding App Client Discovery Questions</h1>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Share the details we need to shape the funding application experience, qualification logic, lead routing, and launch plan.
            </p>
          </div>

          {FUNDING_APP_SECTIONS.map((section) => (
            <Card key={section.title}>
              <CardHeader><CardTitle className="text-base">{section.title}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {section.questions.map((question) => {
                  const value = fundingAnswers[question.key] ?? "";
                  const isShort = question.key === "app_name" || question.key === "tagline" || question.key === "ready_by" || question.key === "launch_date" || question.key === "budget";
                  return (
                    <div key={question.key} className="space-y-2">
                      <Label>{question.label}{question.key === "app_name" ? " *" : ""}</Label>
                      {isShort ? (
                        <Input value={value} onChange={(e) => updateFundingAnswer(question.key, e.target.value)} />
                      ) : (
                        <Textarea rows={3} value={value} onChange={(e) => updateFundingAnswer(question.key, e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end pt-2 pb-8">
            <Button size="lg" onClick={submit} disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
              ) : (
                "Submit Discovery Form"
              )}
            </Button>
          </div>
        </div>
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
