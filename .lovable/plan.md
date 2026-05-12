## Goal
On a sent (open) invoice, let me void the original and immediately spawn an editable duplicate that:
1. Keeps all the timesheet & calendar hours from the original (no time lost), and
2. Lets me add a credit line for what the client already paid for elsewhere, so the new invoice's total = original − credit.

## How it works in Stripe
- Void cancels the original (Stripe `void_invoice`).
- The new draft gets the same line items copied over, plus one or more **negative-amount invoice items** acting as the credit (Stripe supports negative `invoice_items.amount` natively — total floors at $0).
- The timesheet/calendar rows that pointed at the voided invoice get re-linked to the new draft so we don't double-bill them and we don't lose the work.

## Changes

### 1. `void-hourly-invoice` edge function — add `release_entries` flag
- New optional `release_entries: boolean` (default `true` to keep existing behavior).
- When `false`, void in Stripe and flip status to `void` in DB, but **do not** clear `invoiced_at` / `hourly_invoice_id` on linked `timesheets` and `calendar_events`. Keeps the work attached so the duplicate flow can claim it.

### 2. `duplicate-hourly-invoice` edge function — add `transfer_entries` flag
- New optional `transfer_entries: boolean` (default `false`).
- When `true`, after creating the new draft row + Stripe draft, re-point all `timesheets` and `calendar_events` rows that have `hourly_invoice_id = <original.id>` to the new draft (`hourly_invoice_id = <new.id>`, `stripe_invoice_id = <new.stripe_invoice_id>`). The work stays "billed", just on the new invoice.

### 3. New combined UI action: "Void & duplicate with credit"
In the History row dropdown, when status is `open` (sent), add a new item above Duplicate:

```text
Edit invoice            (drafts only)
Duplicate as draft      (any)
─────────────────
Void & duplicate with credit   ← new, open invoices only
Void / Cancel
```

Clicking it runs (in one go):
1. `void-hourly-invoice` with `release_entries: false`
2. `duplicate-hourly-invoice` with `transfer_entries: true`
3. Opens the Edit dialog on the new draft with a clear empty "Credit" line ready to fill in.

### 4. Edit dialog — first-class "Add credit" button
Right next to the existing "Add line" button, add an "Add credit" button that inserts a new line pre-filled with:
- description: `"Credit — "` (cursor placed for me to type the reason)
- amount: `0` but stored as the **negative** of whatever I enter (UI shows positive number with a "Credit" badge; payload sends `-amount` to the edge function)

The existing `update-hourly-invoice` already passes `amount` straight through to Stripe, so negative amounts work without backend changes. We just need the UI to render credit lines clearly (red minus, separate row style) and convert sign on save.

### 5. Footer math in Edit dialog
Show "Subtotal", "Credits", "Total" so I can see the credit applied before saving.

## Files touched
- `supabase/functions/void-hourly-invoice/index.ts` — add `release_entries` param
- `supabase/functions/duplicate-hourly-invoice/index.ts` — add `transfer_entries` param + UPDATE on timesheets/calendar_events
- `src/pages/admin/Invoices.tsx`:
  - History row: new "Void & duplicate with credit" menu item for `open` invoices
  - `EditHourlyInvoiceDialog`: "Add credit" button, sign handling, credit-line styling, Subtotal / Credits / Total footer

## Out of scope
- No real Stripe Credit Note (those only apply to finalized/paid invoices). We're modelling the credit as a negative line item on the new draft, which is the standard pattern when nothing was actually paid yet.
- Refunds (nothing was paid, so nothing to refund).
- DB migrations — not needed.
