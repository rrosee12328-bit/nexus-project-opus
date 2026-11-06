import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type Overview = {
  id: string; company_name: string; recipient_email: string; title: string;
  content: string; share_token: string; published: boolean; expires_at: string; created_at: string;
  discovery_answers: string[] | null; discovery_submitted_at: string | null;
};
export type PublicOverview = Pick<Overview, "company_name" | "title" | "content" | "expires_at">;
type OverviewDatabase = Omit<Database, "public"> & { public: Omit<Database["public"], "Tables" | "Functions"> & {
  Tables: Database["public"]["Tables"] & { business_overviews: {
    Row: Overview;
    Insert: Pick<Overview, "company_name" | "recipient_email" | "title" | "content"> & Partial<Overview>;
    Update: Partial<Overview>; Relationships: [];
  }};
  Functions: Database["public"]["Functions"] & { read_business_overview: {
    Args: { p_token: string }; Returns: PublicOverview | null;
  }; submit_overview_discovery: { Args: { p_token: string; p_answers: string[] }; Returns: string } };
}};
export const overviewDb = supabase as unknown as SupabaseClient<OverviewDatabase>;
export const overviewLink = (token: string) => `${window.location.origin}/overview/${token}`;

export const imhOverview = {
  company_name: "Integrated Mobile Health",
  title: "Business Operations & Growth Overview",
  content: `## Your opportunity
Based on our initial conversation, we identified three potential ways to support Integrated Mobile Health: customer communication, mobile provider coordination, and pharmacy partnership research. These are discovery-stage recommendations, not a final scope or commitment.

## 01 / Vektiss Voice: Virtual Front Desk
**Opportunity:** Reduce routine administrative work and missed booking opportunities.

- Answer common service questions using information your team approves.
- Capture appointment requests and guide callers to the next step.
- Provide reminders and confirmed appointment or provider-status updates.
- Route sensitive, urgent, or medical questions to qualified staff.
- Give management clear communication summaries.

We will confirm call volume, after-hours needs, booking tools, and escalation procedures before defining the scope.

## 02 / Field Operations Portal
**Opportunity:** Give office and field teams a shared view of daily work.

- Appointment calendar, staff assignments, and provider availability.
- Mobile-friendly progress updates: assigned, en route, arrived, in progress, completed.
- Internal coordination and notifications when appointments change.
- Operational completion records and management reporting.

Discovery will establish which existing systems should remain in place. Clinical documentation and patient information are outside this preliminary overview and require a separate privacy and security review before implementation.

## 03 / Pharmacy Partner Discovery
**Opportunity:** Make partnership research and qualification more repeatable.

- Identify potential pharmacies in your selected service areas.
- Organize public business information and evidence of potential fit.
- Track required products, capabilities, questions, and qualification status.
- Prepare outreach for your team's review and track follow-up.

Product availability, sourcing, and suitability must be confirmed directly with each pharmacy. Any automated outreach requires a separately reviewed and approved process.

## A practical starting point
Together, we will select the priority with the clearest near-term value. Customer communication could be first, followed by field operations and partnership discovery; the order will depend on your team's needs.

## Next step
Complete the discovery questionnaire below to help us understand your current processes and priorities. Vektiss will review your answers before preparing a separate proposal with recommended scope, timeline, and investment.

Please discuss business processes only. Do not send patient details or sensitive medical information through this overview.

Company website: https://imhealthiv.com/`,
};
