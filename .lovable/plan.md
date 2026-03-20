

## Plan: Test Payment Email via Resend

### What we'll do
1. **Insert a test payment** into `client_payments` for the "Rose Credit Repair" client (id: `fcb079f1-c8d6-48da-8dd1-5eea414aa8d9`) — a small $1 test payment for March 2026 with notes "Test - Resend verification"
2. **Wait ~10 seconds** for the `email_on_payment` trigger to enqueue the email and `process-email-queue` cron to pick it up
3. **Query `email_send_log`** to verify the email was logged as `sent` (not `failed` or `dlq`)
4. **Check the admin emails dashboard** at `/admin/emails` to confirm it appears there
5. **Ask Lee (rrosee12328@gmail.com) to check their inbox** for the payment confirmation email from `noreply@mail.vektiss.com`

### Technical details
- The `trg_email_on_payment` trigger fires on INSERT to `client_payments`, calls `email_on_payment()` which enqueues to the `transactional_emails` pgmq queue
- `process-email-queue` cron runs every 5s, picks up the message, and routes it through `sendViaResend()` since it's in the `transactional_emails` queue
- The `from` address will be `Vektiss <noreply@mail.vektiss.com>` — requires `mail.vektiss.com` to be verified in Resend (which you've already done)

### One migration needed
- A single INSERT statement into `client_payments` to trigger the flow

