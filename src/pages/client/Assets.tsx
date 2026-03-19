import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  FileImage,
  FileVideo,
  FileText,
  FolderOpen,
  Download,
  Trash2,
  Loader2,
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

export default function ClientAssets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<any>(null);

  // Get client_id
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

  // Fetch assets
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["client-assets", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!clientId || !user?.id) throw new Error("Not linked to a client");
      for (const file of files) {
        const filePath = `${clientId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("client-assets")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabase.from("assets").insert({
          client_id: clientId,
          uploaded_by: user.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          category: "upload",
        });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      toast.success("Files uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["client-assets", clientId] });
    },
    onError: (err: Error) => toast.error(`Upload failed: ${err.message}`),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (asset: { id: string; file_path: string }) => {
      await supabase.storage.from("client-assets").remove([asset.file_path]);
      const { error } = await supabase.from("assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["client-assets", clientId] });
    },
    onError: () => toast.error("Failed to delete file"),
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadMutation.mutate(Array.from(files));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [clientId, user?.id]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const getSignedUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from("client-assets")
      .createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const url = await getSignedUrl(filePath);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Failed to download file");
    }
  };

  const handlePreview = async (asset: any) => {
    try {
      const url = await getSignedUrl(asset.file_path);
      setPreviewUrl(url);
      setPreviewAsset(asset);
    } catch {
      toast.error("Failed to load preview");
    }
  };

  const uploads = assets.filter((a) => a.category === "upload");
  const deliverables = assets.filter((a) => a.category === "deliverable");

  const AssetCard = ({ asset, variant }: { asset: any; variant: "deliverable" | "upload" }) => {
    const Icon = getFileIcon(asset.file_type);
    const canPreview = isPreviewable(asset.file_type);
    return (
      <Card className="hover:border-primary/20 transition-colors">
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
            variant === "deliverable" ? "bg-primary/10" : "bg-accent/50"
          }`}>
            <Icon className={`h-5 w-5 ${variant === "deliverable" ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{asset.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(asset.file_size)} · {new Date(asset.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-1">
            {canPreview && (
              <Button variant="ghost" size="icon" onClick={() => handlePreview(asset)} title="Preview">
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDownload(asset.file_path, asset.file_name)}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            {variant === "upload" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate({ id: asset.id, file_path: asset.file_path })}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assets & Deliverables</h1>
        <p className="text-muted-foreground mt-1">Upload files for your projects and access completed deliverables.</p>
      </div>

      {/* Upload zone */}
      <Card
        className={`border-dashed border-2 transition-colors cursor-pointer group ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <CardContent className="py-12 flex flex-col items-center text-center gap-4">
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading…</p>
            </>
          ) : (
            <>
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Drag & drop files here</h3>
                <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
              </div>
              <div className="flex gap-6 text-muted-foreground/50 mt-1">
                <div className="flex flex-col items-center gap-1">
                  <FileImage className="h-5 w-5" />
                  <span className="text-xs">Images</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <FileVideo className="h-5 w-5" />
                  <span className="text-xs">Videos</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <FileText className="h-5 w-5" />
                  <span className="text-xs">Documents</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Deliverables from team */}
      {deliverables.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Deliverables from your team</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {deliverables.map((asset) => (
              <AssetCard key={asset.id} asset={asset} variant="deliverable" />
            ))}
          </div>
        </div>
      )}

      {/* Uploaded files */}
      {uploads.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Your uploads</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {uploads.map((asset) => (
              <AssetCard key={asset.id} asset={asset} variant="upload" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && assets.length === 0 && (
        <Card className="bg-card/50">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="font-medium text-muted-foreground">No files yet</p>
              <p className="text-sm text-muted-foreground/70 mt-0.5">
                Upload your first file to get started. Your team can also share deliverables here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewAsset} onOpenChange={(open) => { if (!open) { setPreviewAsset(null); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewAsset?.file_name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewUrl && previewAsset?.file_type?.startsWith("image") && (
              <img
                src={previewUrl}
                alt={previewAsset.file_name}
                className="w-full h-auto rounded-lg"
              />
            )}
            {previewUrl && previewAsset?.file_type === "application/pdf" && (
              <iframe
                src={previewUrl}
                className="w-full h-[70vh] rounded-lg border-0"
                title={previewAsset.file_name}
              />
            )}
            {!previewUrl && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
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
