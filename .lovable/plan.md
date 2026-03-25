

## Problem

The calendar currently does NOT display `time_entries` (timesheet data) -- the records you've been logging with start/end times for client work, video edits, portal work, etc. It only shows tasks (which have a due date but no time), follow-ups, project milestones, meetings, and custom calendar events.

So all those logged time blocks (e.g. "Goodland Church video edit 11:00-12:00") are invisible on the calendar.

## Plan

### 1. Fetch time_entries on the calendar page

Add a new `useQuery` hook in `AdminCalendar` to fetch from the `time_entries` table, pulling `id`, `entry_date`, `start_time`, `end_time`, `description`, `category`, and `user_id`.

### 2. Add a new event type for time entries

Add a `"time_block"` type to the calendar's `TYPE_CONFIG` with a distinct icon (e.g. Clock) and color (e.g. teal). Add it to the filter chips so time blocks can be toggled on/off.

### 3. Map time_entries into CalendarEvent objects

In the `allEvents` memo, iterate over fetched time entries and create `CalendarEvent` objects with:
- `date` from `entry_date`
- `startTime` / `timeRange` from `start_time` and `end_time`
- `title` from `description`
- `type: "time_block"`

### 4. Update the CalendarEvent interface and filter state

- Add `"time_block"` to the `type` union and `TYPE_CONFIG`
- Include it in the default `activeFilters` set
- Add it to the filter/summary row

### Files modified
- `src/pages/admin/Calendar.tsx` -- all changes in this single file

