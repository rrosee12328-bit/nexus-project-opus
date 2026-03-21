import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Clock, FileCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending Review", color: "text-amber-500", icon: Clock },
  approved: { label: "Approved", color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { label: "Changes Requested", color: "text-destructive", icon: XCircle },
};

export function ClientApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["client-approvals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("*, projects(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const respond = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("approval_requests")
        .update({
          status,
          responded_at: new Date().toISOString(),
          response_note: responseNote.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "approved" ? "Approved!" : "Changes requested");
      queryClient.invalidateQueries({ queryKey: ["client-approvals"] });
      setRespondingId(null);
      setResponseNote("");
    },
    onError: () => toast.error("Failed to submit response"),
  });

  const pending = approvals.filter((a: any) => a.status === "pending");
  const resolved = approvals.filter((a: any) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-sm">Review and approve deliverables from your team</p>
      </motion.div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs Your Review ({pending.length})</h2>
          {pending.map((a: any, i: number) => {
            const cfg = STATUS_CONFIG.pending;
            const isResponding = respondingId === a.id;
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                <Card className="border-amber-500/30">
                  <CardContent className="pt-5 pb-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <cfg.icon className={`h-5 w-5 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{a.title}</p>
                        {a.projects?.name && (
                          <p className="text-xs text-muted-foreground">Project: {a.projects.name}</p>
                        )}
                        {a.description && (
                          <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                        )}
                        {a.phase && <Badge variant="outline" className="text-[10px] mt-1">{a.phase}</Badge>}
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Submitted {format(new Date(a.created_at), "MMMM d, yyyy")}
                        </p>
                      </div>
                    </div>

                    {isResponding ? (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <Textarea
                          value={responseNote}
                          onChange={(e) => setResponseNote(e.target.value)}
                          placeholder="Add a note (optional)..."
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => respond.mutate({ id: a.id, status: "approved" })}
                            disabled={respond.isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => respond.mutate({ id: a.id, status: "rejected" })}
                            disabled={respond.isPending}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Request Changes
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setRespondingId(null); setResponseNote(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" onClick={() => setRespondingId(a.id)}>
                          <FileCheck className="mr-1 h-3.5 w-3.5" /> Review & Respond
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Previous ({resolved.length})</h2>
          {resolved.map((a: any) => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
            return (
              <Card key={a.id} className="opacity-80">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{a.title}</p>
                        <Badge variant="outline" className={`text-[10px] h-4 px-1 ${cfg.color}`}>{cfg.label}</Badge>
                      </div>
                      {a.projects?.name && <p className="text-xs text-muted-foreground">Project: {a.projects.name}</p>}
                      {a.response_note && <p className="text-xs italic text-muted-foreground mt-1">"{a.response_note}"</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {a.responded_at && `Responded ${format(new Date(a.responded_at), "MMM d, yyyy")}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {approvals.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileCheck className="h-8 w-8 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">No approval requests yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
