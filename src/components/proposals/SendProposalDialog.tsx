import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/activityLogger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { FileSignature, DollarSign, Send, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface SendProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientEmail?: string | null;
  defaultMonthlyFee?: number;
  defaultSetupFee?: number;
}

export function SendProposalDialog({
  open, onOpenChange, clientId, clientName, clientEmail,
  defaultMonthlyFee = 0, defaultSetupFee = 0,
}: SendProposalDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [monthlyFee, setMonthlyFee] = useState(String(defaultMonthlyFee || ""));
  const [setupFee, setSetupFee] = useState(String(defaultSetupFee || ""));
  const [servicesDescription, setServicesDescription] = useState("");
  const [proposalUrl, setProposalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setMonthlyFee(String(defaultMonthlyFee || ""));
      setSetupFee(String(defaultSetupFee || ""));
      setServicesDescription("");
      setProposalUrl(null);
      setCopied(false);
    }
    onOpenChange(isOpen);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("proposals")
        .insert({
          client_id: clientId,
          client_name: clientName,
          client_email: clientEmail || null,
          monthly_fee: Number(monthlyFee) || 0,
          setup_fee: Number(setupFee) || 0,
          services_description: servicesDescription.trim() || null,
          status: "sent",
          created_by: user.id,
        })
        .select("token")
        .single();

      if (error) throw error;
      return data.token;
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/proposal/${token}`;
      setProposalUrl(url);
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      toast.success("Proposal created! Share the link with your client.");
      logActivity("created_proposal", "proposal", clientId, `Created proposal for "${clientName}"`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create proposal");
    },
  });

  const handleCopy = async () => {
    if (!proposalUrl) return;
    await navigator.clipboard.writeText(proposalUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Send Proposal & Contract
          </DialogTitle>
          <DialogDescription>
            Create a proposal for <strong>{clientName}</strong>. They'll review the contract, sign, and pay.
          </DialogDescription>
        </DialogHeader>

        {!proposalUrl ? (
          <>
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" /> Financial Terms
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Setup Fee</Label>
                    <Input
                      type="number"
                      min={0}
                      value={setupFee}
                      onChange={(e) => setSetupFee(e.target.value)}
                      placeholder="e.g. 5800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Monthly Fee</Label>
                    <Input
                      type="number"
                      min={0}
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(e.target.value)}
                      placeholder="e.g. 2500"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Services Description (optional)</Label>
                <Textarea
                  value={servicesDescription}
                  onChange={(e) => setServicesDescription(e.target.value)}
                  placeholder="Describe specific services included in this proposal..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || (!setupFee && !monthlyFee)}
              >
                {createMutation.isPending ? "Creating..." : (
                  <>
                    <Send className="h-4 w-4 mr-2" /> Generate Proposal
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Share this link with your client. They'll fill in their details, review the contract, sign, and pay.
              </p>
              <div className="flex gap-2">
                <Input value={proposalUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
