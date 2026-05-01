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

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorize: admin or ops
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isPrivileged = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "ops");
    if (!isPrivileged) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { call_id, fathom_meeting_id, sync_all_missing } = body ?? {};

    // Build list of (callRowId, meetingId) tuples to process
    let targets: Array<{ id: string; meeting_id: string }> = [];

    let earliestCallDate: string | null = null;

    if (sync_all_missing) {
      const { data: rows, error } = await admin
        .from("call_intelligence")
        .select("id, fathom_meeting_id, fathom_url, transcript, call_date")
        .not("fathom_meeting_id", "is", null)
        .or("fathom_url.is.null,transcript.is.null")
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
    const meetingsMap = await fetchMeetingsForTargets(
      FATHOM_API_KEY,
      targetIds,
      earliestCallDate ?? undefined,
    );

    // Load all clients for invitee → client matching
    const { data: allClients } = await admin
      .from("clients")
      .select("id, email");
    const clientsByEmail = new Map<string, string>();
    const clientsByDomain = new Map<string, string>();
    const GENERIC_DOMAINS = new Set([
      "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
      "proton.me", "protonmail.com", "live.com", "aol.com", "msn.com",
    ]);
    for (const c of allClients ?? []) {
      const email = (c.email ?? "").toLowerCase().trim();
      if (!email) continue;
      clientsByEmail.set(email, c.id);
      const domain = email.split("@")[1];
      if (domain && !GENERIC_DOMAINS.has(domain) && !clientsByDomain.has(domain)) {
        clientsByDomain.set(domain, c.id);
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
        const summaryMd: string | null = meeting?.default_summary?.markdown_formatted ?? null;

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
        if (summaryMd) update.summary = summaryMd;

        // Auto-link to client if not already set on the row
        const { data: existing } = await admin
          .from("call_intelligence")
          .select("client_id")
          .eq("id", t.id)
          .maybeSingle();
        if (!existing?.client_id) {
          update.client_id = matchClientId(meeting, clientsByEmail, clientsByDomain);
        }

        if (Object.keys(update).length > 0) {
          const { error: updErr } = await admin
            .from("call_intelligence")
            .update(update)
            .eq("id", t.id);
          if (updErr) throw updErr;
        }

        results.push({ call_id: t.id, meeting_id: t.meeting_id, updated: Object.keys(update), share_url });
      } catch (e: any) {
        results.push({ call_id: t.id, meeting_id: t.meeting_id, error: e?.message ?? String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});