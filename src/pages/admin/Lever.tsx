import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Anchor, Brain } from "lucide-react";
import BrainHub from "@/pages/BrainHub";
import AdminKnowledgeBase from "@/pages/admin/KnowledgeBase";

/**
 * Fulcrum — the pivot point where knowledge + AI multiply force.
 * Merges the former Brain Hub (operational state) and Knowledge Base (long-term memory).
 */
export default function Fulcrum() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "memory" ? "memory" : "hub";

  return (
    <div className="min-h-screen">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "hub") next.delete("tab");
          else next.set("tab", v);
          setParams(next, { replace: true });
        }}
      >
        <div className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-4 px-6 py-3">
            <div className="flex items-center gap-2">
              <Anchor className="h-4 w-4 text-primary" />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Fulcrum
              </span>
            </div>
            <TabsList className="h-9">
              <TabsTrigger value="hub" className="gap-1.5">
                <Anchor className="h-3.5 w-3.5" />
                Hub
              </TabsTrigger>
              <TabsTrigger value="memory" className="gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                Memory
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="hub" className="mt-0">
          <BrainHub />
        </TabsContent>
        <TabsContent value="memory" className="mt-0">
          <AdminKnowledgeBase />
        </TabsContent>
      </Tabs>
    </div>
  );
}