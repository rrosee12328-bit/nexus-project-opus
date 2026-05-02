import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0'
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const today = new Date()
    const ymd = today.toISOString().split('T')[0]
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    // ===== Cash position (this month) =====
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, payment_month, payment_year, notes')
      .eq('payment_year', today.getFullYear())
      .eq('payment_month', today.getMonth() + 1)

    const actualRevenue = (payments || [])
      .filter((p: any) => p.notes !== 'Projected')
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
    const projectedRevenue = (payments || [])
      .filter((p: any) => p.notes === 'Projected')
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount, expense_date')
      .gte('expense_date', monthStart)

    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0)
    const netCash = actualRevenue - totalExpenses

    // ===== Profitability watchlist =====
    const { data: profitability } = await supabase
      .from('v_client_profitability')
      .select('client_id, client_name, revenue, labor_cost, total_cost, profit, margin_pct, hours_logged')
      .order('margin_pct', { ascending: true })
      .limit(10)

    const watchlist = (profitability || []).filter((p: any) => Number(p.margin_pct ?? 100) < 30)

    // ===== Project health =====
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, status, current_phase, progress, client_id, clients(name)')
      .in('status', ['in_progress', 'not_started'])

    const stalledProjects: any[] = []
    for (const p of projects || []) {
      const { data: recentLog } = await supabase
        .from('project_activity_log')
        .select('created_at')
        .eq('project_id', p.id)
        .gte('created_at', fourteenDaysAgo)
        .limit(1)
      if (!recentLog || recentLog.length === 0) {
        stalledProjects.push({ name: p.name, client: (p as any).clients?.name, phase: p.current_phase, progress: p.progress })
      }
    }

    // ===== Open decisions =====
    const { data: decisions } = await supabase
      .from('ai_decision_queue')
      .select('category, title, severity, created_at')
      .eq('status', 'pending')
      .order('severity', { ascending: false })
      .limit(10)

    // ===== Pipeline =====
    const { data: leads } = await supabase
      .from('leads')
      .select('id, status')
      .in('status', ['new', 'contacted', 'qualified', 'proposal_sent'])
    const { data: proposals } = await supabase
      .from('proposals')
      .select('id, status, view_count, last_viewed_at')
      .in('status', ['sent', 'viewed'])

    const warmProposals = (proposals || []).filter((p: any) => (p.view_count || 0) >= 2 && p.status !== 'paid')

    // ===== Active clients =====
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, status')
      .eq('status', 'active')
    const activeCount = clients?.length || 0

    // ===== Build markdown summary =====
    const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    const monthLabel = today.toLocaleString('en-US', { month: 'long', year: 'numeric' })

    let md = `# Vektiss Brain State — ${ymd}\n\n`
    md += `## 💰 Cash Position (${monthLabel})\n`
    md += `- **Actual revenue**: ${fmt(actualRevenue)}\n`
    md += `- **Projected revenue**: ${fmt(projectedRevenue)}\n`
    md += `- **Expenses**: ${fmt(totalExpenses)}\n`
    md += `- **Net cash**: ${fmt(netCash)} ${netCash < 0 ? '⚠️' : '✅'}\n\n`

    md += `## 👥 Active Clients: ${activeCount}\n\n`

    if (watchlist.length > 0) {
      md += `## ⚠️ Profitability Watchlist (margin < 30%)\n`
      for (const c of watchlist) {
        md += `- **${c.client_name}**: ${fmt(Number(c.profit || 0))} profit, ${Number(c.margin_pct || 0).toFixed(0)}% margin (${Number(c.hours_logged || 0).toFixed(1)}h logged)\n`
      }
      md += '\n'
    } else {
      md += `## ✅ All clients above 30% margin\n\n`
    }

    if (stalledProjects.length > 0) {
      md += `## 🐌 Stalled Projects (no activity in 14d)\n`
      for (const p of stalledProjects) md += `- **${p.name}** (${p.client || 'no client'}) — ${p.phase}, ${p.progress}%\n`
      md += '\n'
    }

    md += `## 📊 Pipeline\n`
    md += `- **Open leads**: ${leads?.length || 0}\n`
    md += `- **Sent proposals**: ${proposals?.length || 0}\n`
    md += `- **Warm proposals (viewed 2+ times)**: ${warmProposals.length}\n\n`

    if ((decisions || []).length > 0) {
      md += `## 🧠 Open AI Decisions (${decisions!.length})\n`
      for (const d of decisions!) md += `- [${d.severity}] ${d.title} (${d.category})\n`
      md += '\n'
    }

    const metrics = {
      cash: { actual: actualRevenue, projected: projectedRevenue, expenses: totalExpenses, net: netCash },
      active_clients: activeCount,
      watchlist_count: watchlist.length,
      stalled_projects: stalledProjects.length,
      open_leads: leads?.length || 0,
      open_proposals: proposals?.length || 0,
      warm_proposals: warmProposals.length,
      open_decisions: decisions?.length || 0,
    }

    // Upsert today's snapshot (one per day)
    await supabase.from('brain_state_snapshots').delete().eq('snapshot_date', ymd)
    const { data: inserted, error: insErr } = await supabase
      .from('brain_state_snapshots')
      .insert({ snapshot_date: ymd, summary_md: md, metrics })
      .select()
      .single()
    if (insErr) throw insErr

    return new Response(JSON.stringify({ success: true, snapshot: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('ai-brain-snapshot error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})