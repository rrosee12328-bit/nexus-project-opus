## What's actually happening

The edge function ran fine — it rejected the request on purpose. From the logs:

```
create-flat-invoice error: Error: Billing is paused for this client
```

The client you picked (Jeremy Ford / Jey Link App) has `billing_paused_until` set to a future date in the `clients` table, so `create-flat-invoice` refuses to create the invoice. The frontend only shows the generic "Edge Function returned a non-2xx status code" because it doesn't read the error body.

## Fix

Two small changes, both UI-side. No business-logic change unless you want one.

1. **Show the real error in the toast** in `src/pages/admin/Invoices.tsx`. When `supabase.functions.invoke` returns an error, also read `data?.error` (the edge function already returns `{ error: "..." }` with status 400) and surface that string in the toast — so next time you'd see "Billing is paused for this client" instead of the generic message. Apply the same fix to the hourly create path while we're in there.

2. **Add an "Override billing pause" checkbox** to the Flat invoice form (admin-only, off by default). When checked, the request sends `force: true`; `create-flat-invoice` skips the `billing_paused_until` guard in that case. Same toggle can be added to hourly later if you want.

If you'd rather just unpause Jeremy Ford's account instead of adding the override, say the word and I'll skip step 2 and instead clear `billing_paused_until` for that client.

## Technical details

- `src/pages/admin/Invoices.tsx` — wrap the `createFlatInvoice` / `createHourlyInvoice` mutations to extract `error.context?.body` (Supabase v2 puts the function's JSON response there) or refetch via `error.message`, then `toast.error(parsedError)`.
- `supabase/functions/create-flat-invoice/index.ts` — accept optional `force: boolean` in the body; only bypass the `billing_paused_until` check when `force === true` and the caller is admin (already verified above).
- No DB migration, no change to hourly function unless you ask.

## Out of scope

- Auto-unpausing the client.
- Changing how `billing_paused_until` gets set elsewhere.
