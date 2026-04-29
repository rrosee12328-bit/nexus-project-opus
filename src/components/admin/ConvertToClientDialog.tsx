import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Loader2, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const SERVICE_TYPES = [
  { value: "apps_portals_websites", label: "Apps, Portals & Websites" },
  { value: "project_intelligence", label: "Project Intelligence" },
  { value: "phone_email_assistant", label: "Phone & Email Assistant" },
  { value: "business_media_content", label: "Business Media & Content" },
];

type ConvertResult = {
  new_client_id: string;
  new_client_number: string;
  proposal_number: string;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proposal: {
    id: string;
    proposal_number?: string | null;
    client_name?: string | null;
    client_email?: string | null;
    status: string;
  };
  onConverted?: (result: ConvertResult) => void;
};

export default function ConvertToClientDialog({
  open,
  onOpenChange,
  proposal,
  onConverted,
}: Props) {
  const queryClient = useQueryClient();
  const [clientName, setClientName] = useState(proposal.client_name ?? "");
  const [clientEmail, setClientEmail] = useState(proposal.client_email ?? "");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceType, setServiceType] = useState("apps_portals_websites");
  const [result, setResult] = useState<ConvertResult | null>(null);

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!clientName.trim()) throw new Error("Client name is required");
      const { data, error } = await (supabase as any).rpc("convert_proposal_to_client", {
        p_proposal_id: proposal.id,
        p_client_name: clientName.trim(),
        p_client_email: clientEmail.trim() || null,
        p_client_phone: clientPhone.trim() || null,
        p_service_type: serviceType,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Conversion returned no result");
      return row as ConvertResult;
    },
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-list"] });
      toast.success(`Client ${res.new_client_number} created successfully`);
      onConverted?.(res);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleClose = () => {
    setResult(null);
    setClientName(proposal.client_name ?? "");
    setClientEmail(proposal.client_email ?? "");
    setClientPhone("");
    setServiceType("apps_portals_websites");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-emerald-400" />
            Convert Proposal to Client
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Client Created</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Proposal{" "}
                  <span className="font-mono text-foreground">
                    {result.proposal_number}
                  </span>{" "}
                  has been converted and marked as Executed.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                  {result.new_client_number}
                </Badge>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{clientName}</span>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  handleClose();
                  window.location.href = `/admin/clients`;
                }}
              >
                Go to Clients
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Converting Proposal</span>
                {proposal.proposal_number && (
                  <Badge variant="outline" className="font-mono text-primary border-primary/30 bg-primary/10">
                    {proposal.proposal_number}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                This will create a new client record with a{" "}
                <span className="font-mono text-foreground">VKT-####</span> number and mark
                this proposal as Executed.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Client Name *</Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@example.com"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                  />
                </div>
              </div>
              <div>
                <Label>Service Type</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  This determines which checklist template is auto-assigned to the client's
                  first project.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending || !clientName.trim()}
                className="gap-1.5"
              >
                {convertMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Convert to Client
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}