const VEKTISS_INTERNAL_CLIENT_ID = "7662c4e3-bf78-494e-b203-40a9ba06fb27";

// Match a Fathom meeting to a client by external invitee email/domain.
// Returns the client_id if matched, otherwise the internal Vektiss client id.
function matchClientId(
  meeting: any,
  clientsByEmail: Map<string, string>,
  clientsByDomain: Map<string, string>,
): string {
  const invitees: any[] = Array.isArray(meeting?.calendar_invitees) ? meeting.calendar_invitees : [];
  const externals = invitees.filter((i) => i?.is_external);

  // 1. Try exact email match on any external invitee
  for (const inv of externals) {
    const email = (inv?.email ?? "").toLowerCase().trim();
    if (email && clientsByEmail.has(email)) return clientsByEmail.get(email)!;
  }
  // 2. Try domain match
  for (const inv of externals) {
    const domain = (inv?.email_domain ?? "").toLowerCase().trim();
    if (domain && clientsByDomain.has(domain)) return clientsByDomain.get(domain)!;
  }
  // 3. Fallback: internal Vektiss client (covers internal-only meetings)
  return VEKTISS_INTERNAL_CLIENT_ID;
}
// Fathom sync: pulls meeting share URL + transcript by fathom_meeting_id
// and writes them to call_intelligence. Admin/Ops only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { authorizedStaff } from "../_shared/staff-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FATHOM_BASE = "https://api.fathom.ai/external/v1";

async function fathomGet(path: string, apiKey: string) {
  const res = await fetch(`${FATHOM_BASE}${path}`, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    throw new Error(`Fathom ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return json;
}

function transcriptArrayToText(arr: any): string | null {
  // Tolerate string input (already-formatted) or JSON-string input
  if (typeof arr === "string") {
    const s = arr.trim();
    if (!s) return null;
    if (s.startsWith("[") || s.startsWith("{")) {
      try { arr = JSON.parse(s); } catch { return s; }
    } else {
      return s;
    }
  }
  if (!Array.isArray(arr)) return null;
  return arr
    .map((t: any) => {
      const speaker = t?.speaker?.display_name ?? t?.speaker ?? "";
      const text = t?.text ?? "";
      const ts = t?.timestamp ? `[${t.timestamp}] ` : "";
      return `${ts}${speaker}: ${text}`.trim();
    })
    .join("\n");
}

// Normalize a Fathom summary value (which may arrive as an object, a JSON
// string of an object, or already-clean markdown) into a markdown string.
function normalizeSummary(val: any): string | null {
  if (val == null) return null;
  if (typeof val === "object") {
    return val.markdown_formatted ?? val.summary ?? val.text ?? null;
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;
    if (s.startsWith("{")) {
      try {
        const parsed = JSON.parse(s);
        return parsed.markdown_formatted ?? parsed.summary ?? parsed.text ?? s;
      } catch { return s; }
    }
    return s;
  }
  return null;
}

// Detect suspicious money amounts in the Fathom summary that are very likely
// transcription errors (e.g. "$6.76" when the speaker said "six seventy-six" → $676,
// or "$12.50" when they said "twelve fifty" → $1,250).
// Heuristic: a $X.XX amount under $50 that appears within 60 chars of money/deal context words.
function detectSuspiciousAmounts(summary: string | null): Array<{ value: string; context: string; suggestion: string }> {
  if (!summary) return [];
  const flagged: Array<{ value: string; context: string; suggestion: string }> = [];
  const ctxRegex = /(agreed|proposal|month|monthly|quote|quoted|charge|charged|budget|fee|price|priced|paid|pays|pay|retainer|setup|deal|signed|sold|cost|costs|invoice|rate|amount|down\s*payment)/i;
  const moneyRegex = /\$(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = moneyRegex.exec(summary)) !== null) {
    const intPart = parseInt(m[1].replace(/,/g, ""), 10);
    const decPart = m[2];
    if (intPart >= 50) continue; // only flag tiny amounts
    const start = Math.max(0, m.index - 60);
    const end = Math.min(summary.length, m.index + m[0].length + 60);
    const context = summary.slice(start, end);
    if (!ctxRegex.test(context)) continue;
    // Suggest interpretations:
    //  - "$X.YZ" → $XYZ  (e.g. $6.76 → $676)
    //  - "$X.50" / "$X.00" → $X,Y50 / $X,Y00  (e.g. $12.50 → $1,250)
    const concatenated = `$${intPart}${decPart}`; // $676
    let alt = "";
    if (decPart === "50" || decPart === "00") {
      alt = ` or $${intPart.toLocaleString()},${decPart === "50" ? "250" : "000"}`.replace("$", "$");
      // simpler form: $12.50 → $1,250
      const asThousands = intPart * 100 + parseInt(decPart, 10);
      alt = ` or $${asThousands.toLocaleString()}`;
    }
    flagged.push({
      value: m[0],
      context: context.trim(),
      suggestion: `Likely meant ${concatenated}${alt}`,
    });
  }
  return flagged;
}

// Paginate /meetings until we've found all target ids (or hit a safety cap / cursor end).
async function fetchMeetingsForTargets(
  apiKey: string,
  targetIds: Set<string>,
  createdAfter?: string,
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ include_summary: "true" });
    if (createdAfter) qs.set("created_after", createdAfter);
    if (cursor) qs.set("cursor", cursor);
    const resp: any = await fathomGet(`/meetings?${qs.toString()}`, apiKey);
    const items = resp?.items ?? [];
    for (const m of items) {
      if (m?.recording_id != null) {
        const key = String(m.recording_id);
        if (targetIds.has(key)) map.set(key, m);
      }
    }
    cursor = resp?.next_cursor ?? null;
    pages++;
    // Stop early if we have everything we asked for, or hit safety cap.
    if (map.size >= targetIds.size) break;
    if (pages > 30) break;
  } while (cursor);
  return map;
}

// List ALL Fathom meetings since createdAfter (used to discover meetings that
// don't yet have a call_intelligence row).
async function listAllMeetings(
  apiKey: string,
  createdAfter?: string,
  maxPages = 20,
): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ include_summary: "true" });
    if (createdAfter) qs.set("created_after", createdAfter);
    if (cursor) qs.set("cursor", cursor);
    const resp: any = await fathomGet(`/meetings?${qs.toString()}`, apiKey);
    const items = resp?.items ?? [];
    out.push(...items);
    cursor = resp?.next_cursor ?? null;
    pages++;
    if (pages >= maxPages) break;
  } while (cursor);
  return out;
}

function pickCallDate(meeting: any): string {
  return (
    meeting?.scheduled_start_time
    ?? meeting?.recording_start_time
    ?? meeting?.created_at
    ?? new Date().toISOString()
  );
}

function pickCallType(meeting: any): "client_facing" | "internal" {
  const invitees: any[] = Array.isArray(meeting?.calendar_invitees) ? meeting.calendar_invitees : [];
  const hasExternal = invitees.some((i) => i?.is_external);
  return hasExternal ? "client_facing" : "internal";
}

function pickDurationMinutes(meeting: any): number | null {
  const s = meeting?.recording_start_time ?? meeting?.scheduled_start_time;
  const e = meeting?.recording_end_time ?? meeting?.scheduled_end_time;
  if (!s || !e) return null;
  const ms = new Date(e).getTime() - new Date(s).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60000);
}

function getCentralTimeParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    day: value("weekday"),
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
  };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours * 60) + minutes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FATHOM_API_KEY = Deno.env.get("FATHOM_API_KEY");
    if (!FATHOM_API_KEY) {
      return new Response(JSON.stringify({ error: "FATHOM_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A real admin/ops session is required. Service and scheduler credentials
    // cannot import meetings or trigger analysis.
    const userId = await authorizedStaff(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Admin or ops access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { call_id, fathom_meeting_id, sync_all_missing, lookback_days, date_from, date_to } = body ?? {};
    if ((date_from || date_to) && (!/^\d{4}-\d{2}-\d{2}$/.test(date_from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(date_to || "") || !Number.isFinite(Date.parse(date_from)) || !Number.isFinite(Date.parse(date_to)) || date_from > date_to)) {
      return Response.json({ error: "Choose a valid start and end date" }, { status: 400, headers: corsHeaders });
    }
    const through = date_to ? new Date(Date.parse(`${date_to}T00:00:00Z`) + 86400000).toISOString() : null;

    // Build list of (callRowId, meetingId) tuples to process
    let targets: Array<{ id: string; meeting_id: string }> = [];

    let earliestCallDate: string | null = null;
    // Set when sync_all_missing: lower bound for discovering NEW meetings.
    let discoverAfter: string | null = null;

    if (sync_all_missing) {
      const days = Number.isFinite(Number(lookback_days)) ? Number(lookback_days) : 60;
      discoverAfter = date_from ? `${date_from}T00:00:00.000Z` : new Date(Date.now() - Math.max(1, Math.min(365, days)) * 86400000).toISOString();
      const { data: rows, error } = await admin
        .from("call_intelligence")
        .select("id, fathom_meeting_id, fathom_url, transcript, call_date")
        .not("fathom_meeting_id", "is", null)
        .or("fathom_url.is.null,transcript.is.null,client_id.is.null")
        .gte("call_date", discoverAfter)
        .lt("call_date", through || new Date().toISOString())
        .order("call_date", { ascending: false, nullsFirst: false })
        .limit(25);
      if (error) throw error;
      targets = (rows ?? [])
        .filter((r: any) => r.fathom_meeting_id)
        .map((r: any) => ({ id: r.id, meeting_id: String(r.fathom_meeting_id) }));
      const dates = (rows ?? [])
        .map((r: any) => r.call_date)
        .filter((d: any) => !!d)
        .sort();
      if (dates.length > 0) {
        // Subtract 1 day for safety
        const d = new Date(dates[0]);
        d.setUTCDate(d.getUTCDate() - 1);
        earliestCallDate = d.toISOString();
      }
      // Default: look back 60 days (override via lookback_days) for new meetings.
    } else if (call_id) {
      const { data: row, error } = await admin
        .from("call_intelligence")
        .select("id, fathom_meeting_id")
        .eq("id", call_id)
        .maybeSingle();
      if (error) throw error;
      if (!row?.fathom_meeting_id) {
        return new Response(JSON.stringify({ error: "Call has no fathom_meeting_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targets = [{ id: row.id, meeting_id: String(row.fathom_meeting_id) }];
    } else if (fathom_meeting_id) {
      // Find call row by meeting id (must already exist)
      const { data: row } = await admin
        .from("call_intelligence")
        .select("id")
        .eq("fathom_meeting_id", String(fathom_meeting_id))
        .maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: "No call row found for that meeting id" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targets = [{ id: row.id, meeting_id: String(fathom_meeting_id) }];
    } else {
      return new Response(JSON.stringify({ error: "Provide call_id, fathom_meeting_id, or sync_all_missing" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fathom has no GET /meetings/{id}; we must list and match by recording_id.
    const targetIds = new Set(targets.map((t) => t.meeting_id));
    let meetingsMap: Map<string, any>;
    let allListed: any[] = [];
    if (discoverAfter) {
      // Discovery mode: pull every meeting in the window, then match.
      allListed = await listAllMeetings(FATHOM_API_KEY, discoverAfter);
      if (through) allListed = allListed.filter(m => pickCallDate(m) < through!);
      meetingsMap = new Map();
      for (const m of allListed) {
        if (m?.recording_id != null) meetingsMap.set(String(m.recording_id), m);
      }
    } else {
      meetingsMap = await fetchMeetingsForTargets(
        FATHOM_API_KEY,
        targetIds,
        earliestCallDate ?? undefined,
      );
    }

    // Load all clients for invitee → client matching
    const { data: allClients } = await admin
      .from("clients")
      .select("id, name, email");
    const clientsByEmail = new Map<string, string>();
    const clientsByDomain = new Map<string, string>();
    const clientNamesById = new Map<string, string>();
    const GENERIC_DOMAINS = new Set([
      "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
      "proton.me", "protonmail.com", "live.com", "aol.com", "msn.com",
    ]);
    for (const c of allClients ?? []) {
      clientNamesById.set(c.id, c.name);
      const email = (c.email ?? "").toLowerCase().trim();
      if (!email) continue;
      clientsByEmail.set(email, c.id);
      const domain = email.split("@")[1];
      if (domain && !GENERIC_DOMAINS.has(domain) && !clientsByDomain.has(domain)) {
        clientsByDomain.set(domain, c.id);
      }
    }

    const { data: meetingCode } = await admin
      .from("time_tracking_codes")
      .select("id")
      .eq("code", "TC-206")
      .eq("is_active", true)
      .maybeSingle();

    // Discovery: insert call_intelligence rows for Fathom meetings we don't have yet.
    let inserted = 0;
    const newlyInsertedCallIds = new Set<string>();
    if (discoverAfter && allListed.length > 0) {
      const ids = allListed
        .map((m: any) => (m?.recording_id != null ? String(m.recording_id) : null))
        .filter((x): x is string => !!x);
      const existing = new Map<string, string>();
      if (ids.length > 0) {
        // Keep the batches small enough for PostgREST URL limits. In addition to
        // discovering missing calls, bulk sync must refresh recent existing calls:
        // Fathom summaries can finish processing after the first import.
        for (let i = 0; i < ids.length; i += 200) {
          const { data: have, error: haveErr } = await admin
            .from("call_intelligence")
            .select("id, fathom_meeting_id")
            .in("fathom_meeting_id", ids.slice(i, i + 200));
          if (haveErr) throw haveErr;
          for (const r of have ?? []) {
            if (r.fathom_meeting_id) existing.set(String(r.fathom_meeting_id), r.id);
          }
        }
      }

      // The old implementation only refreshed rows with a missing URL,
      // transcript, or client. That permanently skipped fully populated rows
      // whose Fathom summary was still stale. Include every linked meeting in
      // the lookback window, while avoiding duplicate work for incomplete rows.
      const targetMeetingIds = new Set(targets.map((t) => t.meeting_id));
      for (const [meetingId, callId] of existing) {
        if (!targetMeetingIds.has(meetingId)) {
          targets.push({ id: callId, meeting_id: meetingId });
          targetMeetingIds.add(meetingId);
        }
      }

      for (const m of allListed) {
        const mid = m?.recording_id != null ? String(m.recording_id) : null;
        if (!mid || existing.has(mid)) continue;
        const summaryMd = normalizeSummary(m?.default_summary) ?? normalizeSummary(m?.summary);
        const newRow: any = {
          fathom_meeting_id: mid,
          fathom_url: m?.share_url ?? m?.url ?? null,
          call_date: pickCallDate(m),
          call_start_time: m?.scheduled_start_time ?? m?.recording_start_time ?? null,
          call_end_time: m?.scheduled_end_time ?? m?.recording_end_time ?? null,
          duration_minutes: pickDurationMinutes(m),
          call_type: pickCallType(m),
          client_id: matchClientId(m, clientsByEmail, clientsByDomain),
          summary: summaryMd,
          summary_original: summaryMd,
          flagged_amounts: detectSuspiciousAmounts(summaryMd),
        };
        const { data: ins, error: insErr } = await admin
          .from("call_intelligence")
          .insert(newRow)
          .select("id")
          .maybeSingle();
        if (insErr || !ins) continue;
        inserted++;
        newlyInsertedCallIds.add(ins.id);
        targets.push({ id: ins.id, meeting_id: mid });
      }
    }

    const results: any[] = [];
    for (const t of targets) {
      try {
        const meeting = meetingsMap.get(t.meeting_id);
        if (!meeting) {
          results.push({ call_id: t.id, meeting_id: t.meeting_id, error: "Meeting not found in Fathom workspace" });
          continue;
        }

        const share_url: string | null = meeting?.share_url ?? meeting?.url ?? null;
        const summaryMd: string | null = normalizeSummary(meeting?.default_summary)
          ?? normalizeSummary(meeting?.summary);

        // Pull transcript on-demand (only if missing in DB it would be re-fetched; we fetch always to refresh)
        let transcript: string | null = null;
        try {
          const tResp: any = await fathomGet(
            `/recordings/${encodeURIComponent(t.meeting_id)}/transcript`,
            FATHOM_API_KEY,
          );
          transcript = transcriptArrayToText(tResp?.transcript ?? tResp);
        } catch (_) { /* transcript optional */ }

        const update: any = {};
        if (share_url) update.fathom_url = share_url;
        if (transcript) update.transcript = transcript;
        if (summaryMd) {
          update.summary_original = summaryMd;
          update.flagged_amounts = detectSuspiciousAmounts(summaryMd);
        }

        // Look up existing row to decide whether to overwrite the editable summary
        const { data: existing } = await admin
          .from("call_intelligence")
          .select("*")
          .eq("id", t.id)
          .maybeSingle();
        const matchedClientId = existing?.client_id
          ?? matchClientId(meeting, clientsByEmail, clientsByDomain);
        if (!existing?.client_id) update.client_id = matchedClientId;

        const startIso = meeting?.recording_start_time ?? meeting?.scheduled_start_time ?? null;
        const endIso = meeting?.recording_end_time ?? meeting?.scheduled_end_time ?? null;
        const durationMinutes = pickDurationMinutes(meeting);
        update.call_date = pickCallDate(meeting);
        update.call_start_time = startIso;
        update.call_end_time = endIso;
        update.duration_minutes = durationMinutes;
        // Only overwrite the displayed summary if an admin hasn't manually edited it
        if (summaryMd && !existing?.summary_edited) {
          update.summary = summaryMd;
        }

        const analysisChanged = !!existing && ((transcript && transcript !== existing.transcript) || (summaryMd && summaryMd !== existing.summary_original));
        const changedFields = Object.keys(update).filter(key => JSON.stringify(update[key]) !== JSON.stringify(existing?.[key]));
        if (changedFields.length > 0) {
          const { error: updErr } = await admin
            .from("call_intelligence")
            .update(update)
            .eq("id", t.id);
          if (updErr) throw updErr;
        }

        let timeEntryId: string | null = null;
        const { data: sourceEntry, error: sourceError } = await admin.from("time_entries")
          .select("id, user_id").eq("source_call_id", t.id).maybeSingle();
        if (sourceError) throw sourceError;
        // Bulk discovery logs only newly imported calls. An explicit single-call
        // sync can safely add an older call without backfilling all history.
        const shouldLogTime = !!sourceEntry || !sync_all_missing || newlyInsertedCallIds.has(t.id);
        if (shouldLogTime && startIso && endIso && durationMinutes && durationMinutes > 0) {
          const start = getCentralTimeParts(startIso);
          const end = getCentralTimeParts(endIso);
          const clientName = clientNamesById.get(matchedClientId) ?? "Vektiss";
          const meetingTitle = meeting?.title ?? meeting?.meeting_title ?? null;
          const timePayload = {
              source_call_id: t.id,
              user_id: sourceEntry?.user_id || Deno.env.get("FATHOM_TIME_TRACKING_USER_ID") || userId,
              entry_date: start.date,
              day_of_week: start.day,
              start_time: start.time,
              end_time: end.time,
              hours: Math.max(0.01, Math.round((durationMinutes / 60) * 100) / 100),
              description: meetingTitle
                ? `Zoom call with ${clientName}: ${meetingTitle}`
                : `Zoom call with ${clientName}`,
              category: "meeting",
              client_id: matchedClientId,
              project_id: existing?.project_id ?? null,
              task_id: null,
              time_code_id: meetingCode?.id ?? null,
            };

          // A manually started call timer may already cover this meeting. Link
          // that row when its start/end are within 20 minutes rather than adding
          // a second entry for the same work.
          const { data: sameDayMeetings, error: existingTimeErr } = await admin
            .from("time_entries")
            .select("id, source_call_id, start_time, end_time")
            .eq("user_id", timePayload.user_id)
            .eq("client_id", matchedClientId)
            .eq("entry_date", start.date)
            .eq("category", "meeting");
          if (existingTimeErr) throw existingTimeErr;
          const manualMatches = (sameDayMeetings ?? []).filter((entry: any) => !entry.source_call_id
            && Math.abs(timeToMinutes(entry.start_time) - timeToMinutes(start.time)) <= 20
            && Math.abs(timeToMinutes(entry.end_time) - timeToMinutes(end.time)) <= 20);
          const matchingTime = sourceEntry || (manualMatches.length === 1 ? manualMatches[0] : null);

          if (matchingTime) {
            let linkQuery = admin
              .from("time_entries")
              .update({
                ...timePayload,
              })
              .eq("id", matchingTime.id);
            // A different recording may have claimed this manual row concurrently.
            linkQuery = sourceEntry ? linkQuery.eq("source_call_id", t.id) : linkQuery.is("source_call_id", null);
            const { data: linkedEntry, error: linkErr } = await linkQuery
              .select("id")
              .single();
            if (linkErr) throw linkErr;
            timeEntryId = linkedEntry.id;
          } else {
            const { data: timeEntry, error: timeErr } = await admin
              .from("time_entries")
              .upsert(timePayload, { onConflict: "source_call_id" })
              .select("id")
              .single();
            if (timeErr) throw timeErr;
            timeEntryId = timeEntry.id;
          }
        }

        const { error: ledgerError } = await admin.from("integration_runs").upsert({ provider: "fathom", external_id: t.id, client_id: matchedClientId, status: "completed", last_error: null, updated_at: new Date().toISOString() }, { onConflict: "provider,external_id" });
        if (ledgerError) throw ledgerError;
        results.push({
          call_id: t.id,
          meeting_id: t.meeting_id,
          updated: changedFields,
          needs_analysis: newlyInsertedCallIds.has(t.id) || analysisChanged || existing?.analysis_pending === true,
          share_url,
          time_entry_id: timeEntryId,
        });
      } catch (e: any) {
        await admin.from("integration_runs").upsert({ provider: "fathom", external_id: t.id, status: "failed", last_error: "Meeting sync failed. Retry to refresh the recording and tracked time.", updated_at: new Date().toISOString() }, { onConflict: "provider,external_id" });
        results.push({ call_id: t.id, meeting_id: t.meeting_id, error: e?.message ?? String(e) });
      }
    }

    // Analysis only runs in this explicit staff request, never a deferred queue.
    const fnBase = Deno.env.get("SUPABASE_URL")!;
    for (const r of results.filter(r => !r.error && r.needs_analysis)) {
      await admin.from("call_intelligence").update({ analysis_pending: true }).eq("id", r.call_id);
      if (Deno.env.get("DIRECT_OPENAI_ENABLED") !== "true") {
        r.analysis_status = "pending";
        continue;
      }
      const response = await fetch(`${fnBase}/functions/v1/analyze-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ call_id: r.call_id }),
      }).catch(() => null);
      r.analysis_status = response?.ok ? "completed" : "pending";
    }

    const failed = results.filter(r => r.error).length;
    const updated = results.filter(r => !r.error && r.updated?.length && !newlyInsertedCallIds.has(r.call_id)).length;
    const unchanged = results.filter(r => !r.error && !r.updated?.length && !newlyInsertedCallIds.has(r.call_id)).length;
    return new Response(JSON.stringify({ ok: true, count: results.length, inserted, imported: inserted, updated, unchanged, failed, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
