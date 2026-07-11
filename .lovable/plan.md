## Business Media Intake Form

Send a branded intake form to prospects/clients to capture business info, inspirations, brand direction, social strategy goals, and editing/deployment timeline. Admin generates a unique link, client fills it out (no login), responses are stored and viewable in a new admin page.

### 1. Database (one migration)

**`intake_forms`** — one row per generated link
- `client_id` (nullable — can send to a prospect before they're a client)
- `recipient_name`, `recipient_email` (optional pre-fill)
- `token` (unique, url-safe, used in public link)
- `status` (`sent` | `viewed` | `completed`)
- `sent_at`, `viewed_at`, `completed_at`, `expires_at` (nullable)
- `created_by` (admin user_id)

**`intake_responses`** — one row per submission
- `intake_form_id` (FK)
- `client_id` (denormalized for filtering)
- `business_name`, `contact_name`, `email`, `phone`, `website`
- `social_accounts` (jsonb: `[{platform, handle}]`)
- `inspirations` (jsonb: `[{platform, handle, notes}]`)
- `visual_style_notes` (text)
- `company_description`, `target_demographic`, `competitors` (text)
- `brand_voice`, `brand_guidelines`, `differentiators` (text)
- `active_platforms`, `expansion_platforms`, `primary_goals`, `dream_deliverables` (text)
- `turnaround_expectations`, `approval_process`, `success_kpis` (text)
- `submitted_at`

RLS:
- `intake_forms`: admins/ops full access; public (anon) SELECT by token only.
- `intake_responses`: admins/ops full access; public (anon) INSERT when a matching un-completed token exists; clients can SELECT their own.
- GRANTs for `anon`, `authenticated`, `service_role` per policies.

### 2. Public form page — `/intake/:token`

- Route added in `App.tsx` outside AdminLayout (no auth required).
- Loads the token, marks `viewed_at` on first load, shows the intake form styled to match Vektiss brand (Inter font, primary blue, light/dark aware).
- Sections mirror the PDF exactly:
  1. Client Information
  2. Social Media Presence (repeatable rows across 8 platforms + Other)
  3. Inspiration (repeatable rows: platform / handle / what you love)
  4. Visual style notes
  5. Discovery (company, demographic, competitors)
  6. Design (voice, guidelines, differentiators)
  7. Direction (platforms, goals, deliverables)
  8. Deployment (deadlines, approval, KPIs)
- Zod validation, autosave-free single submit, success screen after post.
- Duplicate-submit guard on already-`completed` tokens.

### 3. Admin page — `/admin/intakes`

New sidebar entry "Intake Forms" under Business Media area (uses `ClipboardList` icon).

**List view:**
- Table of all intake forms: recipient, linked client (if any), status pill (sent/viewed/completed), sent date, completed date.
- Buttons: "New Intake Link", "Copy Link", "Resend Email", "View Response", "Delete".

**"New Intake Link" dialog:**
- Optional client picker (searchable) or free-form recipient name/email for prospects.
- Optional expiration date.
- Generates token, saves row, shows copyable public URL, and offers "Send via email" (uses existing `send-transactional-email` infra with a new `intake-form-invite` template).

**Response detail dialog:**
- Read-only rendering of the submitted answers grouped by section.
- "Download PDF" button (uses existing PDF pipeline patterns).
- If linked to a client, deep-link to that client's detail page.

### 4. Email template

New app email template `intake-form-invite.tsx` in `_shared/transactional-email-templates/`:
- Subject: "Vektiss Business Media — quick intake form"
- Button links to `https://portal.vektiss.com/intake/{token}`
- Registered in `registry.ts`.

### 5. Notifications

- On submission: create in-app notification for all admins + email via existing queue ("New intake response from {name}").
- Auto-mark linked client's `last_contact_date`.

### Technical notes

- Public route uses the anon Supabase client with token-scoped RLS — no service role in the browser.
- Reuse `PdfPreview`, phase/brand tokens, and existing `Dialog`/`Card` shadcn patterns.
- No changes to existing tables or triggers besides adding the new ones.
- Files touched (approx):
  - `supabase/migrations/<new>.sql`
  - `supabase/functions/_shared/transactional-email-templates/intake-form-invite.tsx` (+ registry)
  - `src/pages/admin/Intakes.tsx` (new)
  - `src/pages/IntakeForm.tsx` (new public page)
  - `src/components/admin/IntakeLinkDialog.tsx`, `IntakeResponseDialog.tsx` (new)
  - `src/App.tsx` (routes)
  - `src/components/AdminSidebar.tsx` (nav entry)
