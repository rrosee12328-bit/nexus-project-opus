# Client workspace rollout

## Implemented

- Five client workspace sections, verified journey milestones, existing setup credit,
  client/project-aware timer and proposal actions, and a staff Today attention list.
- Simplified staff navigation and client document/resource navigation.
- Approved client meeting summaries separate from private call analysis; restrictive
  client read policies protect internal tasks, notes, and raw meeting activity.
- Atomic Stripe event claims and checkout receipts; failed Stripe/Fathom update
  visibility and an admin-only retry endpoint.
- Proposal preview skips view tracking and cannot submit signatures or checkout.

## Validation

- Vitest tests cover separate journey milestones, setup credit, deposit status,
  missing records, deep links, and meeting timezone formatting.
- `tests/workspace-database.mjs` executes the migration in disposable PGlite with
  a minimal schema. It checks duplicate claims, retry, payment credit replay,
  client isolation, and approved-summary ownership. Set `PGLITE_MODULE` to an
  installed PGlite module when running outside this development machine.
- `tests/workspace-smoke.mjs` uses local Vite and Chrome with all external requests
  mocked and WebSockets blocked. It checks client and admin workspaces at 375,
  390, 768, and 1440 pixels and reduced-height mobile viewports. It never contacts
  live services or delivers email. `CHROME_PATH` can override the executable.
- Frontend TypeScript and production build pass. The existing large bundle and
  Vite configuration warnings remain.

## Validation and deployment checklist

1. Validate the migration against a staging copy of the actual schema, including
   existing triggers and policies. The minimal-schema test is not a full migration
   history replay. Do not replay older environment-specific migrations.
2. Run real sandbox Stripe checkout/card-setup and signature-to-onboarding journeys
   with delivery suppressed. Verify out-of-order invoice events and partial
   signature/PDF/email failures; those recovery paths need further validation.
3. Verify Fathom refresh/retry with test recordings and existing manual time entries.
   Do not import historical calls or activate historical reminders automatically.
4. Apply only `20260924120000_workspace_reliability.sql`, deploy the changed edge
   functions plus `retry-integration`, and publish the matching frontend together.
   The new UI depends on the migration; do not publish the frontend alone.
5. Verify real client and ops accounts in staging, including file permissions and
   real iOS keyboard behavior. Reduced desktop viewport tests do not emulate iOS.

## Release status: September 25, 2026

- Confirmed the portal uses Supabase project `ogcgqbrewfzkchwqrrxj`. The Lovable
  database connector refers to an older database and was not used for deployment.
- Migration passed a rolled-back transaction against the actual portal schema,
  then was applied and recorded in migration history.
- Deployed `stripe-webhook`, `sign-proposal`, `create-checkout`, `fathom-sync`,
  `ai-agent`, and `retry-integration`, preserving existing JWT settings.
- Verified unauthenticated and preview requests are rejected without business
  changes. No live payment, signature, meeting import, or email was used as a test.
- Full sandbox payment/signature journeys and real-device iOS keyboard checks
  remain distinct from the automated local and live rejection checks.

Existing raw call summaries will no longer appear to clients. Staff must explicitly
publish client-safe summaries using the new meeting summary control. No historical
summaries are auto-approved, no historical business records were backfilled, and
no client emails were sent during validation.
