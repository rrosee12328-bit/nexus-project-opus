## Goal

Rename the "Hourly Invoices" area to just **Invoices**, and add a second invoice type — **Flat-fee invoice** — so you can bill an agreed price (e.g. Jeremy Ford / Jey Link App = $1,750) without needing timesheets or an hourly rate. You'll pick the type when creating the invoice.

## What you'll see in the portal

Admin → **Invoices** page gets a new "Create invoice" dialog with a type toggle at the top:

```text
 Create invoice
 ┌─────────────────────────────────────────────┐
 │  Client:   [ Jeremy Ford ▾ ]                │
 │                                             │
 │  Invoice type:                              │
 │  ( ) Hourly  — bill from timesheets/calendar│
 │  (•) Flat fee — one or more fixed line items│
 │                                             │
 │  ── Flat-fee mode ──                        │
 │  Line items:                                │
 │   • Jey Link App — phase 2 delivery  $1,750 │
 │   [ + Add line ]                            │
 │                                             │
 │  Notes / description: [_________________]   │
 │  Due in: [14] days   [ ] Send immediately   │
 │                                             │
 │            [ Cancel ]   [ Create invoice ]  │
 └─────────────────────────────────────────────┘
```

Hourly mode keeps today's behavior (pick timesheets + calendar entries, multiply by rate). Flat mode skips all of that — you just add line items with a description and dollar amount, hit create, and it generates a Stripe invoice you can send from the portal exactly like the hourly ones.

The invoice list will show a small badge next to each row (`Hourly` / `Flat`) so you can tell them apart at a glance, and the page heading changes from "Hourly invoices" to "Invoices".

## Implementation

1. **DB**: add `invoice_type text not null default 'hourly'` to `hourly_invoices` (keep the table name to avoid breaking everything; only labels change). Allowed values: `hourly` | `flat`.
2. **New edge function `create-flat-invoice`**: takes `client_id`, `line_items: [{ description, amount }]`, `notes`, `days_until_due`, `auto_finalize`. Creates Stripe customer if missing, creates draft invoice + items, inserts a row in `hourly_invoices` with `invoice_type='flat'`, `total_hours=0`, `hourly_rate=0`, `amount_due=sum(line_items)`. No timesheet/calendar touching.
3. **`src/pages/admin/Invoices.tsx`**:
   - Rename headings/labels: "Hourly Invoices" → "Invoices", "Hourly rate" stays only inside the Hourly tab.
   - Add a radio toggle (Hourly | Flat fee) in the create dialog.
   - Flat mode: dynamic list of `{description, amount}` rows with add/remove, total auto-summed. Disable timesheet selection UI in this mode.
   - Send to `create-flat-invoice` when flat, otherwise existing `create-hourly-invoice`.
   - Add a "Type" column / badge in the invoices table reading `invoice_type`.
4. **Edit / duplicate / void / finalize / preview** functions already operate on `hourly_invoices` rows and Stripe line items — they work as-is for flat invoices (line items are just descriptions + amounts). No changes needed there.
5. **Client portal billing** already lists invoices via the same table; flat invoices will appear automatically.

## Out of scope

- No rename of the underlying `hourly_invoices` table (would force regenerating every edge function for zero user benefit).
- No change to milestone/phase-based auto-billing — this is a manual "send invoice now" flow you trigger from the portal.