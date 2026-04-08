export default function ClientTracker() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Client Tracker</h1>
      <div className="rounded-lg border border-border overflow-hidden" style={{ height: "calc(100vh - 140px)" }}>
        <iframe
          src="https://docs.google.com/spreadsheets/d/145ZGMwATbYK4FKwtuG7E5CaWILZK2q-XEmZTkts64qA/edit?gid=1798944627#gid=1798944627"
          className="w-full h-full border-0"
          title="Vektiss Client Tracker"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
