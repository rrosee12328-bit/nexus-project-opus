import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSignature, Download, Loader2, Calendar, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion } from "framer-motion";

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

export default function ClientContracts() {
  const { user } = useAuth();

  const { data: clientId } = useQuery({
    queryKey: ["my-client-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc("get_client_id_for_user", { _user_id: user.id });
      if (error) throw error;
      return data as string | null;
    },
    enabled: !!user?.id,
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery({
    queryKey: ["my-contracts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contracts")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const { data: proposalContracts = [], isLoading: proposalsLoading } = useQuery({
    queryKey: ["my-proposal-contracts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, signed_name, signed_at, monthly_fee, setup_fee, contract_pdf_path, services_description, created_at")
        .eq("client_id", clientId!)
        .eq("status", "signed")
        .not("contract_pdf_path", "is", null)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });

  const isLoading = contractsLoading || proposalsLoading;

  const allContracts = [
    ...contracts.map((c: any) => ({
      id: c.id,
      title: c.title,
      signedBy: c.signed_by,
      signedAt: c.signed_at,
      monthlyFee: c.monthly_fee,
      setupFee: c.setup_fee,
      filePath: c.file_path,
      createdAt: c.created_at,
      docType: "Contract" as const,
    })),
    ...proposalContracts.flatMap((p: any) => [
      // NDA entry
      {
        id: `nda-${p.id}`,
        title: "Mutual Non-Disclosure Agreement",
        signedBy: p.signed_name,
        signedAt: p.signed_at,
        monthlyFee: null,
        setupFee: null,
        filePath: null,
        createdAt: p.created_at,
        docType: "NDA" as const,
      },
      // Contract entry
      {
        id: `proposal-${p.id}`,
        title: `${p.services_description ? p.services_description.slice(0, 50) : "Service"} Contract`,
        signedBy: p.signed_name,
        signedAt: p.signed_at,
        monthlyFee: p.monthly_fee,
        setupFee: p.setup_fee,
        filePath: p.contract_pdf_path,
        createdAt: p.created_at,
        docType: "Contract" as const,
      },
    ]),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleDownload = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("client-assets")
      .createSignedUrl(filePath, 300);
    if (error || !data?.signedUrl) {
      toast.error("Failed to generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Contracts</h1>
        <p className="text-sm text-muted-foreground">View and download your signed contracts and agreements.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allContracts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileSignature className="h-8 w-8 text-primary/40" />
              </div>
              <p className="font-semibold">No contracts yet</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Your signed contracts will appear here once agreements are finalized.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {allContracts.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
              >
                <Card className="hover:border-primary/20 transition-colors">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start gap-4">
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${c.docType === "NDA" ? "bg-amber-500/10" : "bg-primary/10"}`}>
                        {c.docType === "NDA" ? <ShieldCheck className="h-6 w-6 text-amber-500" /> : <FileSignature className="h-6 w-6 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-semibold">{c.title}</p>
                        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                          {c.signedBy && (
                            <span>Signed by: <strong className="text-foreground">{c.signedBy}</strong></span>
                          )}
                          {c.signedAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(c.signedAt), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm mt-1">
                          {c.setupFee > 0 && (
                            <span className="text-muted-foreground">Setup: <strong className="text-foreground">{formatCurrency(c.setupFee)}</strong></span>
                          )}
                          {c.monthlyFee > 0 && (
                            <span className="text-muted-foreground">Monthly: <strong className="text-foreground">{formatCurrency(c.monthlyFee)}</strong></span>
                          )}
                        </div>
                      </div>
                      {c.filePath && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(c.filePath!)}
                          className="shrink-0"
                        >
                          <Download className="h-4 w-4 mr-2" /> Download
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
