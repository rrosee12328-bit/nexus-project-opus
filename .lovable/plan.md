

## Fix Payment Created Dates

### Problem
All `client_payments` records have `created_at = 2026-03-17` because they were bulk-inserted. This makes date-based queries and sorting misleading.

### Solution
Run a single SQL migration to set each payment's `created_at` to the 1st of its `payment_month`/`payment_year`. Projected payments keep their current timestamp since they represent future forecasts.

### Migration SQL

```sql
UPDATE client_payments
SET created_at = make_timestamptz(payment_year, payment_month, 1, 12, 0, 0, 'UTC')
WHERE notes IS DISTINCT FROM 'Projected'
  AND stripe_invoice_id IS NULL;
```

This updates 13 actual payment records across all clients (Rose Credit Repair, Goodland Church, J&J Elite Auto Repair, Jarvis Johnson, Porsche) while leaving the 9 projected payments unchanged.

### Result
- Jan 2026 payments → `2026-01-01T12:00:00Z`
- Feb 2026 payments → `2026-02-01T12:00:00Z`
- Mar 2026 payments → `2026-03-01T12:00:00Z`
- Projected (Apr–Jun) → unchanged

