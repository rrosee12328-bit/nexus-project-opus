## Seed Plan: Clients (Approved Inputs)

Final values confirmed. Ready to execute on approval.

### 1. Clients (`clients`)

| Name | Status | Type | Start | Monthly Fee | Setup | Paid | Balance |
|------|--------|------|-------|-------------|-------|------|---------|
| Rose Credit Repair (Roekeisha Brisby) | active | Financial Services | 2026-01-20 | $1,600 | 0 | 0 | 0 |
| Jeremy Ford | active | Schedule App | 2026-04-23 | $0 (until launch → $700) | $7,000 | $3,500 | $3,500 |
| Marvshricka Quinn (Peace Reconnection Care) | active | Therapist | 2026-01-01 | $1,250 | 0 | 0 | 0 |
| Goodland Church (Rhema Eheireme) | closed | Church / Media | 2026-01-01 | $600 | 0 | 0 | 0 |
| Stephen Taylor (Kairo Security) | active | Security / Education | 2026-01-01 | $625 | 0 | 0 | 0 |
| Greg McCann (Crown & Associates) | active | Real Estate / Construction | 2026-04-07 | $0 (hourly $125) | 0 | $281.25 | $1,906.25 |

Email/phone/profitability_sheet_url populated from your data.

### 2. Projects (`projects`)

- **Rose (5):** YouTube Content · AI Chatbox ($3,500 paid, awaiting KB) · Rose Mentee ($1,500 — 2 of 12 done, remainder credited to Credit Reader App) · AI Avatar YouTube ($676/mo × 3, Apr–Jun) · Credit Reader App (hourly $125)
- **Jeremy (1):** Jaylin Universal Scheduler — Development phase, target 2026-06-08
- **Sharie (1):** Short-Form Content + Blog Automation
- **Goodland (1):** Business Media (closed, pending new event-based scope)
- **Stephen (5):** Kairo Security Academy · Find Guards · Start a Security Class (Avatar) · Business Media Content · Budgeting/Faith App
- **Greg (3):** Audare PI Platform · Building Forensics AI · Bible Video App

### 3. Client Costs (`client_costs`, recurring monthly)

- **Rose:** Editing $266.67 · Capcut $32 · In-Person Labor $750 · Lovable $29 · Avatar Hosting $29
- **Jeremy:** Lovable $29 · n8n $60 · Resend $25
- **Sharie (new):** Editing $128 · Zoom Labor $250 · Capcut $32 · Blog Infra $4 · Blog LLM $0.02 · Blog Labor $125
- **Stephen:** HeyGen $29 · Capcut $32 · Lovable $29 · Resend $25 · Supabase $25
- **Greg / Goodland:** none recurring

### 4. Payments (`client_payments`)

**Backdated recurring (Jan–Apr 2026):**
- Rose $1,600 × 4 = $6,400
- Sharie $1,000 × 4 = $4,000 (new $1,250 rate begins May)
- Stephen $625 × 4 = $2,500
- Goodland $600 × 4 = $2,400 (then ended)

**One-off / project payments (April 2026):**
- Rose: $3,500 (AI Chatbox) · $1,500 (Mentee package) · $676 (Avatar Apr — May/Jun will accrue monthly at $676)
- Jeremy: $3,500 (Jaylin kickoff)
- Greg: $156.25 (Forensics 1.25h paid) · $125 (Bible app 1h paid)

### 5. Calls (`call_intelligence`)

Last meeting per client with short summary:
- Rose 2026-04-29 · Jeremy 2026-04-27 (recurring Mondays 10am) · Sharie 2026-04-22 · Goodland 2026-05-01 · Stephen 2026-05-01 · Greg 2026-04-30

### 6. Long-form Notes (`client_notes`)

Full narrative context per client so AI Brain has the story:
- Rose: history, Rickey Rose merger, $1,600 monthly basis, credit transfer logic
- Jeremy: full Jaylin MVP scope (centralized hub, sync engine, API integrations, fallback strategy, 8-wk plan, payment splits, $700/mo post-launch)
- Sharie: old vs new pricing structure, 12→8 video shift, blog automation rationale
- Goodland: relationship summary, prior $600 arrangement, pending special-Sundays/training scope
- Stephen: 5-project breakdown (Academy, Find Guards, Security Class, Business Media, Budgeting/Faith App)
- Greg: full Audare PI proposal, Building Forensics AI proposal, Bible Video App scope

### 7. Greg Outstanding Invoice
Audare PI: 15.25h × $125 = **$1,906.25 sent, not paid** → reflected as `balance_due` + flagged note.

---

Approve and I'll insert everything in one batch.