import { PageHero } from "@/components/ui/page-shell";
import { Table } from "lucide-react";

export default function ClientTracker() {
  return (
    <div className="space-y-4">
      <PageHero
        kicker={<><Table className="h-3 w-3" />Vektiss / Tracker</>}
        title="Client Tracker"
        description="Live Google Sheet of every client and their status."
      />
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
