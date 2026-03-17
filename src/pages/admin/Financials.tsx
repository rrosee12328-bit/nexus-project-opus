export default function AdminFinancials() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Tracking</h1>
        <p className="text-muted-foreground">Client fees, monthly payments, and auto-generated reports.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        Revenue charts, payment history, and CSV/Excel export will be built here.
      </div>
    </div>
  );
}
