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
  editing?: { id: string; name: string; category: string; amount: number; details: string | null } | null;
}

export default function OverheadCrudDialog({ open, onOpenChange, editing }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setCategory(editing.category);
      setAmount(String(editing.amount));
      setDetails(editing.details ?? "");
    } else {
      setName("");
      setCategory("");
      setAmount("");
      setDetails("");
    }
  }, [editing, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { name, category, amount: parseFloat(amount), details: details || null };
      if (editing) {
        const { error } = await supabase.from("business_overhead").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("business_overhead").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Overhead updated" : "Overhead added");
      queryClient.invalidateQueries({ queryKey: ["business-overhead"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Overhead" : "Add Overhead"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Adobe Creative Cloud" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Software, Insurance" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Monthly Amount ($)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Details</Label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Optional details" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || !category || !amount || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
