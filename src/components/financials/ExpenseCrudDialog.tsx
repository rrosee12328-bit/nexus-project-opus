import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: { id: string; type: string; amount: number; expense_month: number; expense_year: number; notes: string | null } | null;
}

export default function ExpenseCrudDialog({ open, onOpenChange, editing }: Props) {
  const queryClient = useQueryClient();
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setMonth(editing.expense_month);
      setYear(editing.expense_year);
      setNotes(editing.notes ?? "");
    } else {
      setType("");
      setAmount("");
      setMonth(new Date().getMonth() + 1);
      setYear(new Date().getFullYear());
      setNotes("");
    }
  }, [editing, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { type, amount: parseFloat(amount), expense_month: month, expense_year: year, notes: notes || null };
      if (editing) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Expense updated" : "Expense added");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      logActivity(editing ? "updated_expense" : "created_expense", "expense", editing?.id ?? null, `${editing ? "Updated" : "Added"} expense "${type}" ($${amount})`);
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Type</Label>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Software, Hosting" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Month</Label>
                <Input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!type || !amount || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
