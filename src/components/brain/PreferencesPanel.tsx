import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Pref {
  id: string;
  rule: string;
  reason: string | null;
  scope: string;
  category: string | null;
  active: boolean;
  created_at: string;
}

export function PreferencesPanel() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("ai_preferences")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(50);
    setPrefs((data ?? []) as Pref[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("ai_preferences")
      .update({ active: false })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setPrefs((p) => p.filter((x) => x.id !== id));
    toast.success("Rule removed");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          Learned preferences
          {prefs.length > 0 && (
            <Badge variant="outline" className="ml-1 font-mono text-xs">{prefs.length}</Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Rules the AI follows because you clicked "Wrong call" on past suggestions. Remove a rule to let the AI flag it again.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : prefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. When the AI suggests something off-base, click "Wrong call" and tell it why — it'll remember.
          </p>
        ) : (
          <ul className="space-y-2">
            {prefs.map((p) => (
              <li key={p.id} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {p.category && <Badge variant="outline" className="text-[10px] font-mono">{p.category}</Badge>}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90">{p.rule}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}