import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientStatus = Database["public"]["Enums"]["client_status"];

const statuses: { value: ClientStatus; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
];

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
}

export function ClientFormDialog({ open, onOpenChange, client }: ClientFormDialogProps) {
  const isEdit = !!client;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Partial<ClientInsert>>({
    name: client?.name ?? "",
    type: client?.type ?? "",
    status: client?.status ?? "lead",
    start_date: client?.start_date ?? "",
    setup_fee: client?.setup_fee ?? 0,
    setup_paid: client?.setup_paid ?? 0,
    balance_due: client?.balance_due ?? 0,
    monthly_fee: client?.monthly_fee ?? 0,
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    notes: client?.notes ?? "",
  });

  const set = (key: keyof ClientInsert, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.name?.trim()) throw new Error("Name is required");
      const payload: ClientInsert = {
        name: form.name.trim(),
        type: form.type?.trim() || null,
        status: form.status ?? "lead",
        start_date: form.start_date || null,
        setup_fee: Number(form.setup_fee) || 0,
        setup_paid: Number(form.setup_paid) || 0,
        balance_due: Number(form.balance_due) || 0,
        monthly_fee: Number(form.monthly_fee) || 0,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        notes: form.notes?.trim() || null,
      };

      if (isEdit) {
        const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: isEdit ? "Client updated" : "Client created" });
      logActivity(
        isEdit ? "updated_client" : "created_client",
        "client",
        isEdit ? client.id : null,
        isEdit ? `Updated client "${form.name}"` : `Created client "${form.name}"`,
      );
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Client" : "Add Client"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Client name" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Input value={form.type ?? ""} onChange={(e) => set("type", e.target.value)} placeholder="e.g. Financial Services" maxLength={100} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" maxLength={20} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Setup Fee</Label>
              <Input type="number" min={0} value={form.setup_fee ?? 0} onChange={(e) => set("setup_fee", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Setup Paid</Label>
              <Input type="number" min={0} value={form.setup_paid ?? 0} onChange={(e) => set("setup_paid", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Balance Due</Label>
              <Input type="number" min={0} value={form.balance_due ?? 0} onChange={(e) => set("balance_due", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Monthly Fee</Label>
              <Input type="number" min={0} value={form.monthly_fee ?? 0} onChange={(e) => set("monthly_fee", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Internal notes..." maxLength={1000} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
