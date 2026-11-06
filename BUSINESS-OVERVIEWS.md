# Business Overviews

New admin route: /admin/overviews (Sales > Business Overviews).
Public route: /overview/:token. Anonymous recipients do not need an account.

## Rollout

1. Apply supabase/migrations/20261106180000_business_overviews.sql to the live portal backend.
   Then apply supabase/migrations/20261106190000_overview_discovery_responses.sql.
2. Publish this frontend together with the new route. No existing routes or records are changed.
3. Verify a synthetic draft, publish, anonymous read, expiry, and revocation through the UI before sharing a real link.
4. Enter the intended contact email yourself. Preview and approve the content, publish, then copy the link.

No automated emails, billing changes, client creation, tracking, or signatures are performed.
The IMH example is bundled editor content, not a seeded production record.
Emails remain admin-only. Link possession grants access; this is not recipient identity verification.
Revocation rotates the token. Saving as draft unpublishes the overview. Editing and publishing an existing overview updates its shared content.

## Verification completed

- Production build passed.
- Three document rendering/security tests passed.
- SQL migration and synthetic access checks passed in a rolled-back transaction on the target backend. No permanent schema or record changes were made.
- Chrome preview at 375, 390, 768 and 1440px: no horizontal overflow or JavaScript errors.
- TypeScript passed with ES2022 libraries. Default project typecheck has a pre-existing Array.at library error in src/lib/videoReviewItems.ts.

Frontend and migration have not been deployed. No company emails were sent.
Local preview: http://127.0.0.1:8114/overview-preview.html

## Discovery questionnaire

The next step is now an 18-question, four-section form instead of Calendly. All answers are required ("Not sure" or "Not applicable" are accepted). Each answer is limited to 3000 characters. Unsubmitted answers stay in component memory only and are lost on reload; the form says so explicitly. No patient details or credentials should be entered.

The published bearer link permits one submission. The server locks the overview row, validates publication/expiry and answers, and returns already_submitted on retries without overwriting anything. Responses are visible only to admins on the overview editor, not through the public read RPC. Link possession is not verified recipient identity. Preview submission is simulated without any API call. No emails are sent.

Both migrations plus synthetic security/submission tests passed in a rolled-back transaction. Mobile widths and all 18 preview fields were checked. Production deployment remains pending.

Rollback: remove the navigation and routes; retain the overview records. To withdraw a document, use Revoke link instead of deleting data.
