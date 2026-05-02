import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Trash2, Search, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Pref {
  id: string;
  rule: string;
  reason: string | null;
  scope: string;
  scope_id: string | null;
  category: string | null;
  active: boolean;
  created_at: string;
  hit_count?: number | null;
  last_applied_at?: string | null;
}

export function PreferencesPanel() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [clientNames, setClientNames] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_preferences")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (data ?? []) as Pref[];
    setPrefs(list);

    // Resolve client names for client-scoped prefs
    const ids = Array.from(
      new Set(list.filter((p) => p.scope === "client" && p.scope_id).map((p) => p.scope_id as string))
    );
    if (ids.length > 0) {
      const { data: clients } = await supabase.from("clients").select("id, name").in("id", ids);
      const map: Record<string, string> = {};
      (clients ?? []).forEach((c: any) => { map[c.id] = c.name; });
      setClientNames(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setActive = async (id: string, active: boolean) => {
    const { error } = await supabase
      .from("ai_preferences")
      .update({ active })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setPrefs((p) => p.map((x) => (x.id === id ? { ...x, active } : x)));
    toast.success(active ? "Rule re-activated" : "Rule deactivated");
  };

  const categories = Array.from(new Set(prefs.map((p) => p.category).filter(Boolean))) as string[];

  const filtered = prefs.filter((p) => {
    if (filter === "active" && !p.active) return false;
    if (filter === "inactive" && p.active) return false;
    if (category !== "all" && p.category !== category) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${p.rule} ${p.reason ?? ""} ${p.category ?? ""} ${p.scope_id ? clientNames[p.scope_id] ?? "" : ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    active: prefs.filter((p) => p.active).length,
    inactive: prefs.filter((p) => !p.active).length,
    all: prefs.length,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            Learned preferences
            {counts.active > 0 && (
              <Badge variant="outline" className="ml-1 font-mono text-xs">{counts.active} active</Badge>
            )}
          </CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Rules the AI follows because you clicked "Wrong call" on past suggestions. Deactivate a rule to let the AI flag it again.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="active" className="text-xs h-6">Active ({counts.active})</TabsTrigger>
              <TabsTrigger value="inactive" className="text-xs h-6">Inactive ({counts.inactive})</TabsTrigger>
              <TabsTrigger value="all" className="text-xs h-6">All ({counts.all})</TabsTrigger>
            </TabsList>
          </Tabs>

          {categories.length > 0 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {prefs.length === 0
              ? `None yet. When the AI suggests something off-base, click "Wrong call" and tell it why — it'll remember.`
              : "No rules match your filters."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => (
              <li
                key={p.id}
                className={`flex items-start gap-2 rounded-md border p-3 ${
                  p.active ? "border-border bg-muted/30" : "border-dashed border-border/60 bg-muted/10 opacity-70"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {p.category && <Badge variant="outline" className="text-[10px] font-mono">{p.category}</Badge>}
                    {p.scope === "client" && p.scope_id && (
                      <Badge variant="secondary" className="text-[10px]">
                        {clientNames[p.scope_id] ?? "client"}
                      </Badge>
                    )}
                    {p.scope === "category" && !p.scope_id && (
                      <Badge variant="secondary" className="text-[10px]">global</Badge>
                    )}
                    {!p.active && <Badge variant="outline" className="text-[10px] text-muted-foreground">inactive</Badge>}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90">{p.rule}</p>
                  {p.reason && p.reason !== p.rule && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{p.reason}"</p>
                  )}
                </div>
                {p.active ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Deactivate"
                    onClick={() => setActive(p.id, false)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    title="Re-activate"
                    onClick={() => setActive(p.id, true)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}