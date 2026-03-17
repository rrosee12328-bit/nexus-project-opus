export default function AdminClients() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Client Management</h1>
        <p className="text-muted-foreground">View and manage all clients, their payment history, and services.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        Client list, status tracking, and payment history will be built here.
      </div>
    </div>
  );
}
