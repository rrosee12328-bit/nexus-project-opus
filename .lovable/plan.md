

## Plan: Auto-Invite Client on First Payment

Instead of an admin manually clicking "Send Invite," the system automatically creates the client's account and sends the welcome email the moment their first payment is recorded.

### How it works

```text
Admin records payment for a client (who has an email but no user_id)
        ↓
DB trigger detects: first payment + client has email + no user_id
        ↓
Trigger enqueues a message to invoke the invite-client edge function
        ↓
Edge function creates auth user, links user_id to client record
        ↓
Welcome email sent via Resend with "Set Your Password" link
        ↓
Client receives email → sets password → logs into portal
```

### What gets built

1. **Edge function: `invite-client`**
   - Receives a `client_id`, looks up the client record
   - Uses `auth.admin.createUser()` to create the auth user (email confirmed, random password)
   - Updates `clients.user_id` with the new auth user ID
   - Generates a recovery link via `auth.admin.generateLink({ type: 'recovery' })`
   - Sends a branded "Welcome to Vektiss" email via the transactional queue with the password-set link
   - Skips silently if the client already has a `user_id` (idempotent)

2. **DB trigger: `auto_invite_on_first_payment`**
   - Fires AFTER INSERT on `client_payments`
   - Checks: does this client have an email but no `user_id`? Is this not a "Projected" payment?
   - If yes, calls the `invite-client` edge function via `net.http_post` (using pg_net)
   - If the client already has a `user_id`, does nothing

3. **Welcome email template**
   - Branded HTML: "Welcome to Vektiss"
   - Explains the portal (projects, messages, payments, assets)
   - CTA: "Set Your Password" linking to the recovery/reset flow
   - Sent from `noreply@mail.vektiss.com` via Resend

4. **Admin UI indicator**
   - Show an "Invited" badge on client rows that have a `user_id` set
   - No manual "Send Invite" button needed (but could add one later as a fallback)

### Safety

- The edge function is idempotent — if `user_id` already exists, it exits early
- The `handle_new_user` trigger already creates the profile and assigns the `client` role
- Only fires on real payments (skips "Projected" notes)
- Uses `SUPABASE_SERVICE_ROLE_KEY` (already configured) for admin API calls

