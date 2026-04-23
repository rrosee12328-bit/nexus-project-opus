## Situation

The database currently has **no record of Jeremy Ford** — no proposal, no client, no signed contract, no payment. The summary you provided describes the desired state, but none of it exists in the portal yet. To get Jeremy logged in, tracked, and able to upload assets, we need to create everything from scratch and link it together.

Verified by querying the database directly:
- `proposals` table: no row matching Jeremy / `/jlink` / his email
- `clients` table: no row for Jeremy Ford
- `client_contracts` table: no signed contract for him
- `client_payments`: no $3,500 milestone payment

## Goal

Bring Jeremy fully into the portal so he can:
1. Log in to the client portal
2. See his Jey Link project with Phase 1 (Discovery) active
3. View his signed NDA + contract
4. See his $3,500 Milestone 1 payment
5. Upload brand assets and message the team

## Plan

### 1. Create client record
Insert a row into `clients` with:
- Name: Jeremy Ford
- Email: jeremy.f.ford@outlook.com
- Type: `jlink-app` (so onboarding template / future logic can branch)
- Status: `onboarding` (so the auto-invite guard treats him correctly)
- Setup fee: $7,000, Monthly fee: $700, Setup paid: $3,500, Balance due: $3,500

### 2. Backfill the signed NDA + contract
Insert two rows into `client_contracts` linked to the new client_id:
- **NDA** — title "Mutual NDA", signed_by `jeremy.f.ford@outlook.com`, signed_at `2026-04-22 20:35 UTC`, file_path `ndas/Jeremy-Ford-f7f40359-533d-4b5a-9719-bb0ed3d0fa4b.pdf`
- **Contract** — title "Digital Automation, AI & Technical Integration Services Agreement (Jey Link)", signed_at `2026-04-22 20:39 UTC`, setup_fee 7000, monthly_fee 700, file_path `contracts/Jeremy-Ford-06a0d02a-cc94-4990-bf73-b7873f5f866b.pdf`

(Note: these PDF paths assume the files already exist in the `client-assets` storage bucket. If they don't, the contract will appear in the UI but the download button will fail — let me know and I'll either upload placeholder files or remove the file_path so the download button is hidden.)

### 3. Record the $3,500 Milestone 1 payment
Insert into `client_payments`:
- amount: 3500, payment_month: 4, payment_year: 2026
- notes: "Milestone 1 — Discovery / Down Payment (50%)"
- payment_source: `manual`

This will NOT trigger the auto-invite (because we set status=`onboarding` first, which blocks the trigger guard). We'll send the invite manually in step 5.

### 4. Create the Jey Link project
Insert into `projects`:
- Name: "Jey Link — Universal Scheduling Aggregator"
- Description: scope summary from the contract (mobile + web app, calendar/API integrations, hosted by Vektiss until handoff)
- Status: `in_progress`, current_phase: `discovery`, progress: 0
- Start date: today

Then insert the standard 3 phase rows into `project_phases` (Discovery in_progress, Develop not_started, Deploy not_started) and a kickoff entry into `project_activity_log`.

### 5. Send the portal invite
Invoke the existing `invite-client` edge function with `client_id` = Jeremy's new id. This:
- Creates his auth user
- Sends the welcome email with a "Set Your Password" link
- Creates onboarding checklist steps

### 6. Verify
After running the inserts, query back the records and confirm:
- Client visible at `/admin/clients`
- Project visible on his client dashboard once he logs in
- Contract + NDA appear in `/portal/contracts`
- Payment appears in `/portal/payments`

## Notes / decisions you may want to weigh in on

- **PDF files**: I'm assuming `contracts/Jeremy-Ford-06a0d02a-...pdf` and `ndas/Jeremy-Ford-f7f40359-...pdf` already exist in storage. If not, I can either skip the file_path (UI will hide the download button) or you can upload them after.
- **Project number**: will auto-generate (e.g. `PR-XXX`) from the existing sequence — no action needed.
- **No code changes** are required for this. It's pure data backfill + one edge function call. The invite flow, contract UI, payment UI, and project tracker all already exist and will pick this up automatically.
