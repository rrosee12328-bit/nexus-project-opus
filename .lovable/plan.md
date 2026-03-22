

## Fix: Cost Double-Counting in Reports Page

### Problem
The Reports page (`src/pages/admin/Reports.tsx`) triple-counts costs:

1. **`expenses` table** already contains explicit monthly entries for Operating Expenses ($651/mo), Salary ($4,000/mo), Outsourced Editing, and Office Rent.
2. **`business_overhead` table** defines the same items as templates (Operating Expenses $651, Salary $4,000, plus $188 in tools) — these get multiplied by months and added again.
3. **`client_costs` table** includes outsourced editing amounts per client that overlap with the expenses entries.

For Jan–Mar (3 months), the phantom additions are roughly:
- Overhead: ($651 + $4,000 + $188) × 3 = ~$14,517
- Client costs: ~$4,997 × 3 = ~$14,991

The Financials page does NOT have this bug — it correctly uses only the `expenses` table for cost calculations.

### Fix (2 edits in Reports.tsx)

**1. Remove overhead and client_costs from total cost calculation (lines 140–145)**

Change the `totalCosts` calculation to use only the `expenses` table, which is the source of truth:

```typescript
const totalCosts = totalExpenses;
```

Remove the `monthlyOverhead`, `monthlyClientCosts`, `totalOverheadInRange`, and `totalClientCostsInRange` variables (or keep them only if used elsewhere for display, but remove from cost aggregation).

**2. Fix the revenue trend chart (line 232)**

The per-month cost in `revenueTrend` also adds overhead and client costs on top of expenses:

```typescript
// Before (line 232):
const costs = exp + monthlyOverhead + monthlyClientCosts;

// After:
const costs = exp;
```

This makes the chart consistent with the corrected totals.

### Result
- Net profit, profit margin, and all cost-dependent KPIs will reflect accurate numbers matching the Financials page and your spreadsheet.
- The `business_overhead` and `client_costs` tables remain intact for reference/display purposes — they just won't be double-counted into totals.

