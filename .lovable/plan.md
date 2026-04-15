

# Outlook Calendar Sync + Central Time Fix

## What's Happening Now

1. **No Outlook integration** — the calendar only pulls from internal DB tables and Calendly.
2. **Timezone bug** — the Calendly webhook converts times via `.toISOString()`, which outputs UTC. Your events are stored in UTC but displayed as-is, so a 2 PM CT meeting shows as 7 PM (or similar offset).

## Plan

### 1. Connect Microsoft Outlook

- Use the **Microsoft Outlook connector** to link your Outlook account. This provides gateway credentials for reading calendar events.
- Create a new Edge Function **`sync-outlook-calendar`** that:
  - Calls the Microsoft Graph API via the connector gateway (`/me/calendarView?startDateTime=...&endDateTime=...`)
  - Fetches events for a rolling 60-day window (30 past, 30 future)
  - Upserts them into `calendar_events` with `event_type = 'outlook'` and stores the Outlook event ID in the description for dedup
  - Converts all times to **America/Chicago** before storing
- Create a new Edge Function **`push-outlook-event`** that:
  - When a custom event is created/updated in the portal, pushes it to Outlook via `POST /me/events`
  - Stores the returned Outlook event ID back on the `calendar_events` row for future sync
- Set up a **cron job** (pg_cron) to run `sync-outlook-calendar` every 15 minutes for automatic pull sync
- Wire the portal's "Create Event" / "Update Event" flow to also call `push-outlook-event` so changes go both directions

### 2. Fix Timezone Handling

- Update **`calendly-webhook`** Edge Function to convert UTC times to `America/Chicago` before storing `event_date`, `start_time`, and `end_time`
- Update the **Calendar UI** (`AdminCalendar`, `CalendarEventDialog`, `DayViewDialog`) to treat all stored times as Central Time
- Add a timezone indicator ("CT") next to time displays so it's clear

### 3. Add Outlook to Calendar UI

- Add a new event type `"outlook"` to `TYPE_CONFIG` with a distinct icon and color (e.g., blue Microsoft icon)
- Include it in the filter row alongside Calendly, Tasks, etc.
- Outlook events will be read-only in the day view (clicking opens in Outlook) unless they originated from the portal

### Technical Details

- **Connector**: `microsoft_outlook` — provides `MICROSOFT_OUTLOOK_API_KEY` + `LOVABLE_API_KEY` for gateway calls
- **Gateway URL**: `https://connector-gateway.lovable.dev/microsoft_outlook/me/calendarView`
- **DB change**: Add `outlook` to the `calendar_events.event_type` allowed values (or keep as text since it's already flexible)
- **New secrets needed**: None — the connector handles OAuth token refresh automatically
- **Files modified**: `calendly-webhook/index.ts`, `Calendar.tsx`, `CalendarEventDialog.tsx`, `DayViewDialog.tsx`
- **Files created**: `supabase/functions/sync-outlook-calendar/index.ts`, `supabase/functions/push-outlook-event/index.ts`

