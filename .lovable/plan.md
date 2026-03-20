

## Plan: Read Receipts for Messages

### What it does
- When a client opens their Messages page, all unread messages from admins are automatically marked as read (`read_at` timestamp set)
- Admin messages view shows read/unread indicators: a blue dot on unread messages, checkmark icons on read ones
- Client list sidebar shows unread message count per client

### Changes

**1. Client Messages page (`src/pages/client/Messages.tsx`)**
- Add a `useEffect` that fires when messages load: calls `UPDATE messages SET read_at = now() WHERE client_id = X AND sender_id != user.id AND read_at IS NULL`
- This marks all admin-sent messages as read when the client views them

**2. Admin Messages page (`src/pages/admin/Messages.tsx`)**
- Fetch unread counts per client (messages where `sender_id` is the client's `user_id` and `read_at IS NULL`)
- Show unread count badge on client list items (blue dot or number)
- On each message bubble from the client, show a subtle "read" or "unread" indicator (e.g., `CheckCheck` icon for read, or a blue dot for unread)
- Add a query for unread counts grouped by `client_id`
- When admin opens a client's chat, auto-mark client-sent messages as read (same pattern as client side)

**3. No database changes needed**
- The `messages` table already has a `read_at` column
- RLS already allows clients to UPDATE their messages and admins have ALL access

### Technical details
- Client-side mark-as-read: `supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('client_id', clientId).neq('sender_id', user.id).is('read_at', null)`
- Admin-side mark-as-read: same pattern but `.eq('sender_id', clientUserId)` to mark client-sent messages
- Unread count query: `supabase.from('messages').select('client_id', { count: 'exact' }).is('read_at', null).neq('sender_id', user.id)` grouped client-side

