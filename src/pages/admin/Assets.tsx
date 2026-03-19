import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AssetPreviewDialog } from "@/components/assets/AssetPreviewDialog";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  Download,
  Trash2,
  Loader2,
  FileImage,
  FileVideo,
  FileText,
  FolderOpen,
  Users,
  Package,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

function getFileIcon(fileType: string | null) {
  if (!fileType) return FileText;
  if (fileType.startsWith("image")) return FileImage;
  if (fileType.startsWith("video")) return FileVideo;
  return FileText;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(fileType: string | null) {
  if (!fileType) return false;
  return fileType.startsWith("image") || fileType === "application/pdf";
}

type Asset = Tables<"assets">;

export default function AdminAssets() {
  const openDownload = (assetId: string) => {
    const downloadPath = `/download/${assetId}`;
    const popup = window.open(downloadPath, "_blank", "noopener,noreferrer");
    if (!popup) window.location.assign(downloadPath);
  };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>("deliverable");
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-asset-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status")
        .in("status", ["active", "onboarding"])
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["admin-assets", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("client_id", selectedClientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!selectedClientId || !user?.id) throw new Error("No client selected");
      for (const file of files) {
        const filePath = `${selectedClientId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("client-assets")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabase.from("assets").insert({
          client_id: selectedClientId,
          uploaded_by: user.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          category: uploadCategory,
        });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      toast.success("Files uploaded");
      queryClient.invalidateQueries({ queryKey: ["admin-assets", selectedClientId] });
    },
    onError: (err: Error) => toast.error(`Upload failed: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (asset: { id: string; file_path: string }) => {
      await supabase.storage.from("client-assets").remove([asset.file_path]);
      const { error } = await supabase.from("assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-assets", selectedClientId] });
    },
    onError: () => toast.error("Failed to delete"),
  });

  const getPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from("client-assets").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage.from("client-assets").download(filePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download file");
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadMutation.mutate(Array.from(files));
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const uploads = assets.filter((a) => a.category === "upload");
  const deliverables = assets.filter((a) => a.category === "deliverable");

  const AssetRow = ({ asset }: { asset: any }) => {
    const Icon = getFileIcon(asset.file_type);
    const canPreview = isPreviewable(asset.file_type);
    return (
      <Card>
        <CardContent className="pt-3 pb-3 flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
            asset.category === "deliverable" ? "bg-primary/10" : "bg-accent/50"
          }`}>
            <Icon className={`h-4 w-4 ${asset.category === "deliverable" ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{asset.file_name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(asset.file_size)}</p>
          </div>
          <div className="flex gap-1">
            {canPreview && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewAsset(asset)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleDownload(asset.file_path, asset.file_name)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => deleteMutation.mutate({ id: asset.id, file_path: asset.file_path })}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asset Management</h1>
        <p className="text-muted-foreground">Upload deliverables and view client uploads.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
        {/* Client list */}
        <Card className="flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Clients
            </p>
          </div>
          <ScrollArea className="flex-1 max-h-[600px]">
            <div className="p-2 space-y-1">
              {clients.map((client) => {
                const isSelected = client.id === selectedClientId;
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`w-full text-left rounded-lg px-3 py-3 transition-colors ${
                      isSelected ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-accent/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{client.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{client.status}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* Asset area */}
        <div className="space-y-4">
          {!selectedClientId ? (
            <Card className="h-[400px] flex items-center justify-center">
              <div className="text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-semibold">Select a client</p>
                <p className="text-sm text-muted-foreground mt-1">Choose a client to manage their assets.</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Upload controls */}
              <Card>
                <CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{selectedClient?.name}</span>
                  </div>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deliverable">Deliverable</SelectItem>
                      <SelectItem value="upload">General Upload</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    size="sm"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Files
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </CardContent>
              </Card>

              {deliverables.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Deliverables</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {deliverables.map((asset) => <AssetRow key={asset.id} asset={asset} />)}
                  </div>
                </div>
              )}

              {uploads.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client Uploads</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {uploads.map((asset) => <AssetRow key={asset.id} asset={asset} />)}
                  </div>
                </div>
              )}

              {!isLoading && assets.length === 0 && (
                <Card className="bg-card/50">
                  <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                    <FolderOpen className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No assets for this client yet.</p>
                  </CardContent>
                </Card>
              )}

              {isLoading && (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewAsset?.file_name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewAsset?.file_type?.startsWith("image") && (
              <img
                src={getPublicUrl(previewAsset.file_path)}
                alt={previewAsset.file_name}
                className="w-full h-auto rounded-lg"
              />
            )}
            {previewAsset?.file_type === "application/pdf" && (
              <iframe
                src={getPublicUrl(previewAsset.file_path)}
                className="w-full h-[70vh] rounded-lg border-0"
                title={previewAsset.file_name}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => previewAsset && handleDownload(previewAsset.file_path, previewAsset.file_name)}
            >
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
