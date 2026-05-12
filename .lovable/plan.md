## Goal
Add Edit, Duplicate, and Void/Cancel actions to each row in the Hourly Invoices History table on `/admin/invoices`, so you can fix mistakes on a draft, kill an invoice that was sent in error, or copy an existing invoice into a new editable draft (e.g. to credit work toward something else the client already paid for).

## Why three actions instead of just "edit"
Stripe enforces hard rules we can't bend:
- **Draft** invoices → fully editable (line items, amounts, descriptions, notes, rate). Safe to change.
- **Open** (sent, unpaid) → can't edit. Only option is **Void** (cancel) and start over.
- **Paid** → can't edit or void. Need a refund/credit + a fresh invoice (Duplicate covers this).

So the right pattern is:
- Edit on drafts
- Duplicate on anything (creates a new editable draft from the old one)
- Void on draft/open

## UI changes (`src/pages/admin/Invoices.tsx`)

In the History tab table, add an Actions column with a small dropdown menu per row:

```text
Invoice  Client  Amount  Status  Date  [⋯]
                                        ├─ Preview        (existing)
                                        ├─ Edit           (drafts only)
                                        ├─ Duplicate      (any status)
                                        └─ Void / Cancel  (draft + open)
```

New `EditHourlyInvoiceDialog` component:
- Loads the invoice + its line items (reuse `preview-hourly-invoice` for the read).
- Editable fields: hourly rate, notes, and per-line `description` + `amount` (with add/remove row).
- Save calls a new edge function `update-hourly-invoice` (draft only). On success, refresh history + preview.

New `DuplicateInvoiceDialog` (lightweight confirm):
- "Create a new draft copy of INV-1234?" with optional new client picker (default = same client).
- Calls new edge function `duplicate-hourly-invoice`, then opens the new draft in the edit dialog so you can adjust before sending.

Void confirm dialog:
- Warns that the invoice will be cancelled in Stripe and the underlying timesheet / calendar entries will be released back to "unbilled" so they can be re-invoiced.
- Calls new edge function `void-hourly-invoice`.

## New edge functions

All three follow the same pattern as `create-hourly-invoice` (admin auth check, service-role client, Stripe SDK).

1. **`supabase/functions/update-hourly-invoice/index.ts`**
   - Input: `hourly_invoice_id`, `hourly_rate?`, `notes?`, `line_items?: [{ stripe_item_id?, description, amount, delete? }]`.
   - Guard: `status === 'draft'` only — otherwise return 400.
   - For each line: `stripe.invoiceItems.update / create / del`.
   - Update Stripe invoice `description` (notes).
   - Refresh totals from Stripe and write back to `hourly_invoices` (`amount_due`, `total_hours` if rate changed, `notes`, `hourly_rate`).

2. **`supabase/functions/duplicate-hourly-invoice/index.ts`**
   - Input: `hourly_invoice_id`, `target_client_id?` (defaults to original).
   - Loads original invoice + Stripe line items.
   - Creates a new `hourly_invoices` row (status `draft`, no timesheet/calendar links — this is intentional so the original entries stay marked invoiced and the copy is a free-form credit/adjustment invoice).
   - Creates a fresh Stripe draft invoice + copies each line item (description + amount).
   - Returns new `hourly_invoice_id` so the UI can pop the edit dialog.

3. **`supabase/functions/void-hourly-invoice/index.ts`**
   - Input: `hourly_invoice_id`.
   - Guard: status must be `draft` or `open`. Paid invoices return a clear error pointing the user to Duplicate (so they can issue a credit).
   - For draft → `stripe.invoices.del`. For open → `stripe.invoices.voidInvoice`.
   - Set `hourly_invoices.status = 'void'`.
   - Release linked entries: `UPDATE timesheets / calendar_events SET invoiced_at = NULL, hourly_invoice_id = NULL, stripe_invoice_id = NULL WHERE hourly_invoice_id = <id>`.

## Out of scope
- No refund flow for paid invoices (Stripe Dashboard handles partial refunds better; Duplicate covers the "credit toward something else" case).
- No bulk actions.

## Files touched
- `src/pages/admin/Invoices.tsx` — actions menu, edit dialog, duplicate confirm, void confirm.
- `supabase/functions/update-hourly-invoice/index.ts` (new)
- `supabase/functions/duplicate-hourly-invoice/index.ts` (new)
- `supabase/functions/void-hourly-invoice/index.ts` (new)

No DB migrations required — `hourly_invoices.status = 'void'` is already supported.
