import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  FileSignature, Upload, Download, Eye, Loader2, Plus, Trash2, Calendar, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion } from "framer-motion";

interface Props {
  clientId: string;
  clientName: string;
}

function formatCurrency(val: number | null) {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

export default function ClientContractsTab({ clientId, clientName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [setupFee, setSetupFee] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["client-contracts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contracts")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Also pull in proposal-generated contracts
  const { data: proposalContracts = [] } = useQuery({
    queryKey: ["proposal-contracts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id, token, client_name, signed_name, signed_at, monthly_fee, setup_fee, contract_pdf_path, status, services_description, created_at")
        .eq("client_id", clientId)
        .eq("status", "signed")
        .not("contract_pdf_path", "is", null)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !title.trim()) throw new Error("Title and file are required");
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${clientId}/contracts/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("client-assets")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("client_contracts")
        .insert({
          client_id: clientId,
          title: title.trim(),
          file_path: path,
          contract_type: "uploaded",
          signed_by: signedBy.trim() || null,
          signed_at: signedAt || null,
          monthly_fee: Number(monthlyFee) || 0,
          setup_fee: Number(setupFee) || 0,
          notes: notes.trim() || null,
          uploaded_by: user.id,
        });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast.success("Contract uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["client-contracts", clientId] });
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contract removed");
      queryClient.invalidateQueries({ queryKey: ["client-contracts", clientId] });
    },
  });

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from("client-assets")
      .createSignedUrl(filePath, 300);
    if (error || !data?.signedUrl) {
      toast.error("Failed to generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const closeDialog = () => {
    setUploadOpen(false);
    setTitle("");
    setSignedBy("");
    setSignedAt("");
    setMonthlyFee("");
    setSetupFee("");
    setNotes("");
    setFile(null);
  };

  const allContracts = [
    ...contracts.map((c: any) => ({
      id: c.id,
      title: c.title,
      signedBy: c.signed_by,
      signedAt: c.signed_at,
      monthlyFee: c.monthly_fee,
      setupFee: c.setup_fee,
      filePath: c.file_path,
      type: "uploaded" as const,
      docType: "Contract" as const,
      createdAt: c.created_at,
    })),
    ...proposalContracts.flatMap((p: any) => [
      {
        id: `nda-${p.id}`,
        title: "Mutual Non-Disclosure Agreement",
        signedBy: p.signed_name,
        signedAt: p.signed_at,
        monthlyFee: null,
        setupFee: null,
        filePath: null,
        type: "generated" as const,
        docType: "NDA" as const,
        createdAt: p.created_at,
      },
      {
        id: `proposal-${p.id}`,
        title: `${p.services_description ? p.services_description.slice(0, 50) : "Service"} Contract`,
        signedBy: p.signed_name,
        signedAt: p.signed_at,
        monthlyFee: p.monthly_fee,
        setupFee: p.setup_fee,
        filePath: p.contract_pdf_path,
        type: "generated" as const,
        docType: "Contract" as const,
        createdAt: p.created_at,
      },
    ]),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Contracts ({allContracts.length})
          </CardTitle>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload Contract
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allContracts.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileSignature className="h-8 w-8 text-primary/40" />
              </div>
              <p className="font-semibold">No contracts yet</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Upload a signed contract PDF or send a proposal for {clientName} to sign digitally.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Signed By</TableHead>
                  <TableHead>Date Signed</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>Setup</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {allContracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell>
                      <Badge variant={c.docType === "NDA" ? "secondary" : "outline"} className="text-xs">
                        {c.docType === "NDA" ? <><ShieldCheck className="h-3 w-3 mr-1" />NDA</> : "Contract"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.signedBy ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {c.signedAt ? format(new Date(c.signedAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>{formatCurrency(c.monthlyFee)}</TableCell>
                    <TableCell>{formatCurrency(c.setupFee)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {c.type === "generated" ? "Proposal" : "Uploaded"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {c.filePath && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDownload(c.filePath!, c.title)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {c.type === "uploaded" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteMutation.mutate(c.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setUploadOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Signed Contract
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Contract Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. App Development Services Contract" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">PDF File *</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Signed By</Label>
                <Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="e.g. Greg McCann" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date Signed</Label>
                <Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Setup Fee</Label>
                <Input type="number" min={0} value={setupFee} onChange={(e) => setSetupFee(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Monthly Fee</Label>
                <Input type="number" min={0} value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bi-monthly invoicing on 15th & 30th" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !title.trim() || !file}
            >
              {uploadMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Upload</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
