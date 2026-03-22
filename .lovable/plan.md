

# Resume: Stripe Billing Integration

We left off at Step 1 — enabling Stripe. This is required before any edge functions or billing code can be written, as it provisions the Stripe secret key and unlocks Stripe-specific tooling.

## Immediate Next Step

**Enable Stripe** — This will prompt you to connect your Stripe account and provide a restricted API key. Once connected, the secret key becomes available to edge functions automatically.

After Stripe is enabled, implementation proceeds in this order:

1. **Database migration** — Add `stripe_customer_id` to `clients`, `payment_source`/`stripe_invoice_id` to `client_payments`, create `stripe_subscriptions` and `stripe_invoices` tables with RLS
2. **Edge functions** — `stripe-webhook`, `create-checkout`, `stripe-portal`
3. **Client Billing page** — Replace Payments with full Billing UI (overview cards, invoice history, subscription status, Stripe Portal buttons)
4. **Admin billing controls** — Add invoice creation and payment link tools to Client Detail / Financials
5. **Route updates** — Rename nav items, add redirects

## To Proceed

Approve this plan and I will enable Stripe as the first action.

