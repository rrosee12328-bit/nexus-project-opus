import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migrate-secret",
};

// Tables to migrate in dependency order (parents before children)
const TABLES = [
  "clients",
  "projects",
  "proposals",
  "hourly_invoices",
  "flat_invoices",
  "client_payments",
  "assets",
  "tasks",
  "calendar_events",
  "call_intelligence",
  "calls",
  "client_contracts",
  "time_entries",
  "market_intelligence",
  "ai_decision_queue",
  "intake_forms",
  "intake_responses",
  "expenses",
  "investments",
  "notifications",
  "company_summaries",
  "brain_state_snapshots",
  "admin_activity_log",
  "email_send_log",
  "email_send_state",
  "suppressed_emails",
  "pdf_endpoint_logs",
  "reminder_log",
  "user_roles",
  "profiles",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Simple secret check to prevent unauthorized access
    const secret = req.headers.get("x-migrate-secret");
    if (secret !== "vektiss-migrate-2026") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Source: this Lovable-managed project (uses service role from env)
    const sourceUrl = Deno.env.get("SUPABASE_URL")!;
    const sourceServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Destination: user's own Vektiss project
    const destUrl = "https://ogcgqbrewfzkchwqrrxj.supabase.co";
    const destServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY2dxYnJld2Z6a2Nod3FycnhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODc3NTMwMSwiZXhwIjoyMDk0MzUxMzAxfQ.FP8NuABeZZmb7lbfI3VVebOtys2VK4UN3Ohgd6bcARg";

    const source = createClient(sourceUrl, sourceServiceKey);
    const dest = createClient(destUrl, destServiceKey);

    const results: Record<string, { count: number; error?: string }> = {};
    let totalMigrated = 0;

    for (const table of TABLES) {
      try {
        // Fetch all rows from source
        const { data, error: fetchError } = await source
          .from(table)
          .select("*")
          .limit(5000);

        if (fetchError) {
          results[table] = { count: 0, error: fetchError.message };
          continue;
        }

        if (!data || data.length === 0) {
          results[table] = { count: 0 };
          continue;
        }

        // Insert into destination in batches of 100
        let inserted = 0;
        const batchSize = 100;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          const { error: insertError } = await dest
            .from(table)
            .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

          if (insertError) {
            results[table] = { count: inserted, error: insertError.message };
            break;
          }
          inserted += batch.length;
        }

        if (!results[table]) {
          results[table] = { count: inserted };
          totalMigrated += inserted;
        }
      } catch (err) {
        results[table] = { count: 0, error: String(err) };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalMigrated,
        tables: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
