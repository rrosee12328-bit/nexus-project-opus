

## Plan: Separate Sales Pipeline into Its Own Page

Yes, that makes total sense — the Sales Pipeline (leads/prospects) is a different workflow from managing existing clients.

### What Changes

1. **New page `src/pages/admin/Leads.tsx`**
   - Extract the lead pipeline logic (Kanban board, lead stats, add lead button) from `Clients.tsx` into its own dedicated page
   - Keep all existing Kanban functionality (drag-drop, follow-up indicators, convert to client, metrics bar)

2. **Clean up `src/pages/admin/Clients.tsx`**
   - Remove all lead-related code (lead filtering, `LeadPipelineKanban` import, lead stats)
   - Page focuses purely on active/onboarding/closed clients

3. **Add route in `src/App.tsx`**
   - Add `<Route path="leads" element={<AdminLeads />} />` under the admin portal

4. **Add sidebar nav item in `src/components/AdminSidebar.tsx`**
   - Add "Sales Pipeline" nav item with a funnel/target icon, positioned after "Client Management"
   - URL: `/admin/leads`

### Technical Notes
- The data query fetches all clients; the new page will filter for `status === "lead"` while the existing Clients page filters for `status !== "lead"` — same pattern, just split across two pages
- All existing components (`LeadPipelineKanban`, `ConvertLeadDialog`, `ClientFormDialog`) stay unchanged

