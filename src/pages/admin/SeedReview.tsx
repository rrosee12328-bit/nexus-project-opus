import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

// Seeded entities (names/titles to highlight). Anything matching = "seeded", else "existing".
const SEEDED_CLIENT_NAMES = [
  "Rose Credit Repair",
  "Jeremy",
  "Sharie",
  "Stephen",
  "Goodland",
  "Greg McCann",
];

function isSeededClient(name?: string | null) {
  if (!name) return false;
  return SEEDED_CLIENT_NAMES.some((s) => name.toLowerCase().includes(s.toLowerCase().split(" ")[0]));
}

type Row = Record<string, any>;

export default function SeedReview() {
  const [clients, setClients] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [costs, setCosts] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [calls, setCalls] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, p, co, pay, ca, n] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase.from("projects").select("*, clients(name)").order("created_at", { ascending: false }),
        supabase.from("client_costs").select("*, clients(name)").order("created_at", { ascending: false }),
        supabase.from("client_payments").select("*, clients(name)").order("created_at", { ascending: false }),
        supabase.from("call_intelligence").select("*, clients(name)").order("call_date", { ascending: false }),
        supabase.from("client_notes").select("*, clients(name)").order("created_at", { ascending: false }),
      ]);
      setClients(c.data ?? []);
      setProjects(p.data ?? []);
      setCosts(co.data ?? []);
      setPayments(pay.data ?? []);
      setCalls(ca.data ?? []);
      setNotes(n.data ?? []);
      setLoading(false);
    })();
  }, []);

  const seededClients = clients.filter((c) => isSeededClient(c.name));
  const otherClients = clients.filter((c) => !isSeededClient(c.name));

  const split = <T extends Row>(rows: T[], getName: (r: T) => string | null | undefined) => ({
    seeded: rows.filter((r) => isSeededClient(getName(r))),
    other: rows.filter((r) => !isSeededClient(getName(r))),
  });

  const projSplit = split(projects, (r) => r.clients?.name);
  const costSplit = split(costs, (r) => r.clients?.name);
  const paySplit = split(payments, (r) => r.clients?.name);
  const callSplit = split(calls, (r) => r.clients?.name);
  const noteSplit = split(notes, (r) => r.clients?.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Seed Review</h1>
        <p className="text-sm text-muted-foreground">
          Side-by-side comparison of recently seeded data vs existing records.
        </p>
        <div className="mt-2 flex gap-2">
          <Badge variant="default">Seeded: {seededClients.length}</Badge>
          <Badge variant="secondary">Other: {otherClients.length}</Badge>
          {loading && <Badge variant="outline">Loading…</Badge>}
        </div>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <SideBySide
            left={{ title: "Seeded Clients", rows: seededClients }}
            right={{ title: "Other Clients", rows: otherClients }}
            columns={[
              { key: "name", label: "Name" },
              { key: "status", label: "Status" },
              { key: "monthly_fee", label: "Monthly", fmt: (v) => `$${Number(v ?? 0).toLocaleString()}` },
              { key: "balance_due", label: "Balance", fmt: (v) => `$${Number(v ?? 0).toLocaleString()}` },
              { key: "start_date", label: "Start" },
            ]}
          />
        </TabsContent>

        <TabsContent value="projects">
          <SideBySide
            left={{ title: "Seeded Projects", rows: projSplit.seeded }}
            right={{ title: "Other Projects", rows: projSplit.other }}
            columns={[
              { key: "name", label: "Name" },
              { key: "clients.name", label: "Client" },
              { key: "status", label: "Status" },
              { key: "phase", label: "Phase" },
            ]}
          />
        </TabsContent>

        <TabsContent value="costs">
          <SideBySide
            left={{ title: "Seeded Costs", rows: costSplit.seeded }}
            right={{ title: "Other Costs", rows: costSplit.other }}
            columns={[
              { key: "clients.name", label: "Client" },
              { key: "category", label: "Category" },
              { key: "amount", label: "Amount", fmt: (v) => `$${Number(v ?? 0).toFixed(2)}` },
              { key: "is_monthly", label: "Monthly", fmt: (v) => (v ? "Yes" : "No") },
              { key: "details", label: "Details" },
            ]}
          />
        </TabsContent>

        <TabsContent value="payments">
          <SideBySide
            left={{ title: "Seeded Payments", rows: paySplit.seeded }}
            right={{ title: "Other Payments", rows: paySplit.other }}
            columns={[
              { key: "clients.name", label: "Client" },
              { key: "payment_month", label: "Mo" },
              { key: "payment_year", label: "Yr" },
              { key: "amount", label: "Amount", fmt: (v) => `$${Number(v ?? 0).toLocaleString()}` },
              { key: "payment_source", label: "Source" },
              { key: "notes", label: "Notes" },
            ]}
          />
        </TabsContent>

        <TabsContent value="calls">
          <SideBySide
            left={{ title: "Seeded Calls", rows: callSplit.seeded }}
            right={{ title: "Other Calls", rows: callSplit.other }}
            columns={[
              { key: "clients.name", label: "Client" },
              { key: "call_date", label: "Date", fmt: (v) => (v ? new Date(v).toLocaleDateString() : "") },
              { key: "call_type", label: "Type" },
              { key: "summary", label: "Summary", truncate: 80 },
            ]}
          />
        </TabsContent>

        <TabsContent value="notes">
          <SideBySide
            left={{ title: "Seeded Notes", rows: noteSplit.seeded }}
            right={{ title: "Other Notes", rows: noteSplit.other }}
            columns={[
              { key: "clients.name", label: "Client" },
              { key: "type", label: "Type" },
              { key: "title", label: "Title" },
              { key: "content", label: "Content", truncate: 80 },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Column = { key: string; label: string; fmt?: (v: any) => string; truncate?: number };

function getVal(row: Row, key: string) {
  return key.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), row);
}

function SideBySide({
  left,
  right,
  columns,
}: {
  left: { title: string; rows: Row[] };
  right: { title: string; rows: Row[] };
  columns: Column[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      {[left, right].map((side, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              {side.title}
              <Badge variant={i === 0 ? "default" : "secondary"}>{side.rows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {side.rows.map((r) => (
                    <TableRow key={r.id}>
                      {columns.map((c) => {
                        let v = getVal(r, c.key);
                        if (c.fmt) v = c.fmt(v);
                        if (c.truncate && typeof v === "string" && v.length > c.truncate) {
                          v = v.slice(0, c.truncate) + "…";
                        }
                        return (
                          <TableCell key={c.key} className="text-xs align-top">
                            {v ?? "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {side.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center text-muted-foreground text-sm">
                        No records
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}