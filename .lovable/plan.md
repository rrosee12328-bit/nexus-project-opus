## Missing file content

Your message references "the following content" and "the EmailIntelligence.tsx file" but the actual file body wasn't included in the message — only the instruction to paste it. I need the full component source before I can create the file.

## What I'll do once you paste the content

1. **Create** `src/pages/ops/EmailIntelligence.tsx` with the exact content you provide (verbatim, no modifications).

2. **Register the route** in `src/App.tsx`:
   - Add `import OpsEmailIntelligence from "./pages/ops/EmailIntelligence";` alongside the other Ops page imports.
   - Add `<Route path="email-intelligence" element={<OpsEmailIntelligence />} />` inside the existing `/ops` route block (which is already wrapped in `ProtectedRoute allowedRoles={["admin", "ops"]}` + `OpsLayout`).

3. **Add sidebar link** in `src/components/OpsSidebar.tsx`:
   - Import `Mail` from `lucide-react` (extend the existing lucide import).
   - Add `{ title: "Email Intelligence", url: "/ops/email-intelligence", icon: Mail }` to the `navItems` array. I'll place it just above the AI Assistant / Settings entries so it sits within the main Ops navigation group.

4. **Verify** the page renders by opening `/ops/email-intelligence` in the preview after deploy.

## Notes

- No DB schema changes implied by this request — if the pasted file queries tables that don't exist yet (e.g. `email_send_log`, `email_intelligence_*`), I'll flag them after seeing the code and we can add migrations as a follow-up.
- Sidebar grouping: the Ops sidebar currently has a single "Navigation" group (no separate "Ops section"), so the link will go into that group. If you want a distinct section header, say so.

## Next step

Please re-send your message with the full contents of `EmailIntelligence.tsx` pasted in (between the opening instruction and the "Add a route…" sentence), and I'll execute the three changes above.