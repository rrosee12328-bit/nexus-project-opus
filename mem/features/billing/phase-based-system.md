---
name: Phase-based billing system
description: Phase milestones, billing_model flag, paused billing gating, automation triggers
type: feature
---
# Phase-Based Billing

## Source of truth
- `clients.billing_model` enum: 'monthly' | 'phase_based' | 'hybrid'. Auto-synced via trigger from monthly_fee/setup_fee. ALWAYS read this field — never re-infer from fees.
- `phase_milestone_invoices` table tracks Discovery (50%) / Development (25%) / Deploy (25%) milestones per (client_id, project_id, phase). Status: pending | invoiced | paid | skipped.

## Pause rule
- `clients.billing_paused_until > now()` blocks `create-checkout` (returns 403). All money-moving edge functions MUST honor this gate.
- Date `2099-12-31` = indefinite pause; auto-cleared by phase advance trigger.

## Triggers (DB)
- `trg_project_phase_advance`: on projects.current_phase change → inserts next milestone, notifies admins, logs to admin_activity_log, clears indefinite pause.
- `trg_touch_client_on_calendar_event`: keeps clients.last_contact_date fresh.
- `trg_sync_client_billing_model`: keeps billing_model derived from fees.

## Calendly webhook
Auto-links calendar_events.client_id by matching invitee email to clients.email.

## AI Watcher rules (4-hourly)
- `paused_billing_stalled`: phase_based/hybrid client paused with no updated_at movement in 14d → medium risk
- `milestone_invoice_pending`: phase_milestone_invoices.status='pending' for 24h+ → high risk

## UI surfaces
- Admin: PhaseBillingTimeline shown on ClientDetail when billing_model in (phase_based, hybrid).
- Client portal: Same component mirrored on /portal/billing.
- Component reads phase_milestone_invoices for status; falls back to cumulative client_payments threshold.
