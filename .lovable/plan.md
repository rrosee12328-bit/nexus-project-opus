

## Calendly Webhook Integration

You've shared your Calendly API token. Here's the plan to build the full integration so Calendly bookings automatically appear on your portal calendar.

### Overview

1. **Store the Calendly API token** as a backend secret
2. **Create a `calendly-webhook` edge function** that receives Calendly webhook events and inserts/deletes rows in `calendar_events`
3. **Register the webhook** with Calendly's API using a one-time script
4. **Add a "calendly" event type** to the calendar UI so Calendly bookings render with a distinct icon/color

### Step 1 — Store the API token

Use the secrets tool to store `CALENDLY_API_TOKEN` so the edge function can use it to verify webhook ownership and for the initial registration call.

### Step 2 — Create `calendly-webhook` edge function

**File:** `supabase/functions/calendly-webhook/index.ts`

- **Public endpoint** (no JWT required — Calendly sends unsigned POST requests)
- Handles two Calendly events:
  - `invitee.created` → insert a new row into `calendar_events` with `event_type = 'calendly'`, mapping the event name, date, start/end times, and invitee name/email into the title and description
  - `invitee.canceled` → delete the matching `calendar_events` row (matched by storing the Calendly event URI in a metadata column or by convention in the title)
- Uses the service role key to write to `calendar_events`
- Stores `calendly_event_uri` in an existing nullable field or appends it to the description for later matching on cancellation

**Config:** Add `[functions.calendly-webhook] verify_jwt = false` to `supabase/config.toml`

### Step 3 — Register the webhook with Calendly

After the edge function is deployed, run a one-time call from the edge function (or a setup script) to:
1. `GET https://api.calendly.com/users/me` → retrieve the organization URI
2. `POST https://api.calendly.com/webhook_subscriptions` → subscribe to `invitee.created` and `invitee.canceled` pointing at `https://xtftehtsfnxsdsfmwkew.supabase.co/functions/v1/calendly-webhook`

### Step 4 — Calendar UI update

**File:** `src/pages/admin/Calendar.tsx`

- Add `"calendly"` to the `CalendarEvent` type union and `TYPE_CONFIG` with a distinct icon (e.g., `Video` or a calendar icon) and color (e.g., indigo)
- Include it in `activeFilters` defaults and filter chips
- No new query needed — Calendly events are stored in `calendar_events` and already fetched by the existing custom events query; just map `event_type === 'calendly'` to the new type

### Files changed
- `supabase/functions/calendly-webhook/index.ts` (new)
- `supabase/config.toml` (add function config)
- `src/pages/admin/Calendar.tsx` (add calendly type to UI)

