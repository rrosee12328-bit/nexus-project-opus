

# Stripe Billing Integration Plan

## Overview
Replace the current manual payment tracking with a Stripe-powered billing system. Stripe handles all payment processing, card storage, and PCI compliance. The portal becomes the billing experience layer — displaying data from Stripe and routing actions to Stripe-hosted pages.

## Architecture

```text
┌─────────────────────┐     ┌──────────────────────┐
│   Client Portal     │     │   Admin Portal        │
│  (Billing page)     │     │  (Billing dashboard)  │
└────────┬────────────┘     └────────┬─────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────┐
│         Edge Functions (backend)                │
│  create-checkout  │  stripe-portal  │  billing  │
└────────┬──────────┴────────┬────────┴───────────┘
         │                   │
         ▼                   ▼
┌──────────────┐    ┌──────────────────┐
│  Stripe API  │◄───│  stripe-webhook  │
│  (payments,  │    │  (events sync)   │
│  customers,  │    └──────────────────┘
│  invoices)   │
└──────────────┘
```

**Key principle**: No card data touches the app. Stripe Checkout for payments, Stripe Customer Portal for card management, Stripe webhooks to sync state back.

## Step 1: Enable Stripe
Use the Stripe enablement tool. This connects the Stripe account and exposes the secret key as an environment variable for edge functions.

## Step 2: Database Changes (single migration)

**New columns on `clients`:**
- `stripe_customer_id` (text, nullable) — links client to Stripe Customer

**New columns on `client_payments`:**
- `stripe_invoice_id` (text, nullable) — Stripe invoice ID
- `payment_source` (text, default `'manual'`) — `'stripe'` or `'manual'`

**New table `stripe_subscriptions`:**
- `id` (uuid, PK)
- `client_id` (uuid, FK → clients)
- `stripe_subscription_id` (text, unique)
- `stripe_price_id` (text)
- `status` (text) — mirrors Stripe status: active, past_due, canceled, etc.
- `current_period_start` (timestamptz)
- `current_period_end` (timestamptz)
- `cancel_at_period_end` (boolean, default false)
- `created_at`, `updated_at`

**New table `stripe_invoices`:**
- `id` (uuid, PK)
- `client_id` (uuid, FK → clients)
- `stripe_invoice_id` (text, unique)
- `stripe_invoice_number` (text)
- `amount_due` (integer) — cents
- `amount_paid` (integer) — cents
- `currency` (text, default `'usd'`)
- `status` (text) — draft, open, paid, void, uncollectible
- `due_date` (timestamptz)
- `paid_at` (timestamptz)
- `hosted_invoice_url` (text) — Stripe-hosted payment page
- `invoice_pdf` (text) — downloadable receipt
- `description` (text)
- `period_start` (timestamptz)
- `period_end` (timestamptz)
- `created_at`, `updated_at`

**RLS policies:**
- Admins: full access on both new tables
- Clients: SELECT on own rows (via `client_id = get_client_id_for_user(auth.uid())`)
- Ops: SELECT on both tables (read-only billing visibility)

## Step 3: Edge Functions

### `stripe-webhook` (verify_jwt = false)
- Verifies Stripe webhook signature
- Handles events:
  - `customer.created` → update `clients.stripe_customer_id`
  - `invoice.created/updated/paid/payment_failed` → upsert into `stripe_invoices`; on `paid`, also insert into `client_payments` with `payment_source = 'stripe'`
  - `customer.subscription.created/updated/deleted` → upsert into `stripe_subscriptions`
- Idempotency via `stripe_invoice_id` unique constraint

### `create-checkout`
- Auth-required (validates JWT)
- Accepts `client_id`, `mode` (subscription | payment), `price_id` or `amount`
- Creates/reuses Stripe Customer (stores `stripe_customer_id` on client)
- Returns Stripe Checkout Session URL
- Used by admin to generate payment links, or by client to pay open invoices

### `stripe-portal`
- Auth-required
- Accepts `client_id`
- Creates Stripe Customer Portal session for card/subscription management
- Returns portal URL

### `billing-data`
- Auth-required
- Accepts `client_id`
- Returns aggregated billing summary: current plan, next payment date, outstanding balance, autopay status
- Pulls from local `stripe_subscriptions` + `stripe_invoices` tables (no Stripe API call needed for reads)

## Step 4: Client Portal — Billing Page

Replace the current `Payments.tsx` with a full **Billing** page (`/portal/billing`). Keep the old `/portal/payments` route as a redirect.

**Sections:**

1. **Billing Overview Cards** (top row)
   - Current Plan / Service name + status badge
   - Outstanding Balance (sum of open invoices)
   - Next Payment Date (from subscription `current_period_end`)
   - Autopay Status (active subscription = autopay on)

2. **Quick Actions**
   - "Pay Now" button → opens Stripe Checkout for the oldest open invoice
   - "Manage Payment Method" → opens Stripe Customer Portal
   - "Download Receipt" on each paid invoice row

3. **Invoice History Table**
   - Invoice number, date, due date, amount, status badge (paid/open/past_due/void), actions
   - Status badges: green=paid, yellow=open, red=past_due, gray=void
   - "Pay" button on open/past_due invoices → `hosted_invoice_url`
   - "Receipt" link on paid invoices → `invoice_pdf`

4. **Subscription Section** (if applicable)
   - Plan name, billing cycle, next renewal, cancel-at-period-end indicator
   - "Manage Subscription" → Stripe Portal

## Step 5: Admin Portal — Billing Dashboard

Add a **Billing** tab or section to the existing Financials page or Client Detail page:

- Per-client: Stripe customer link, subscription status, invoice list, "Create Invoice" button, "Send Payment Link" button
- Overview: clients with past-due invoices, MRR from active subscriptions, payment source breakdown (Stripe vs manual)

## Step 6: Navigation Updates

- Client layout: rename "Payments" → "Billing" in nav, update route
- Admin sidebar: ensure Financials page has billing data integrated
- Update `App.tsx` routes: add `/portal/billing`, redirect `/portal/payments` → `/portal/billing`

## Step 7: Automation Hooks

The webhook already inserts into `client_payments` on successful Stripe payment, so the existing `auto_invite_on_first_payment` trigger continues to work. Future automation (pause access on overdue, unlock onboarding on deposit) can key off `stripe_invoices.status` and `stripe_subscriptions.status`.

## Build Order (V1)

1. Enable Stripe (tool call)
2. Run database migration (new tables + columns)
3. Build `stripe-webhook` edge function
4. Build `create-checkout` edge function
5. Build `stripe-portal` edge function
6. Build client Billing page UI
7. Add admin billing controls to Client Detail / Financials
8. Update navigation and routes
9. End-to-end test with Stripe test mode

## Technical Details

- All amounts stored in cents (Stripe standard), formatted to dollars in UI
- Stripe Customer created lazily on first checkout or admin action
- No raw card data stored — all PCI scope handled by Stripe
- Webhook endpoint uses `Stripe-Signature` header verification
- The existing `client_payments` table remains the single source of truth for payment history — Stripe payments are recorded there with `payment_source = 'stripe'`, manual entries keep `payment_source = 'manual'`

