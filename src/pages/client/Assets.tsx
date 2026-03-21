import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssetPreviewDialog } from "@/components/assets/AssetPreviewDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Upload, FileImage, FileVideo, FileText, FolderOpen, Download, Trash2,
  Loader2, Eye, LayoutGrid, List, Search,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

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

function isImage(fileType: string | null) {
  return fileType?.startsWith("image") ?? false;
}

type Asset = Tables<"assets">;
type AssetLinks = Record<string, { previewUrl: string; downloadUrl: string }>;

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 16 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, delay },
});

export default function ClientAssets() {
  const openDownload = (assetId: string) => {
    const downloadPath = `/download/${assetId}`;
    const popup = window.open(downloadPath, "_blank", "noopener,noreferrer");
    if (!popup) window.location.assign(downloadPath);
  };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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
      return data as Asset[];
    },
    enabled: !!clientId,
  });

  const { data: assetLinks = {} } = useQuery({
    queryKey: ["client-asset-links", assets.map((a) => `${a.id}:${a.file_path}`).join("|")],
    queryFn: async () => {
      const entries = await Promise.all(
        assets.map(async (asset) => {
          const { data, error } = await supabase.storage
            .from("client-assets")
            .createSignedUrl(asset.file_path, 60 * 60);
          if (error) throw error;
          const separator = data.signedUrl.includes("?") ? "&" : "?";
          return [
            asset.id,
            { previewUrl: data.signedUrl, downloadUrl: `${data.signedUrl}${separator}download=${encodeURIComponent(asset.file_name)}` },
          ] as const;
        })
      );
      return Object.fromEntries(entries) as AssetLinks;
    },
    enabled: assets.length > 0,
    staleTime: 1000 * 60 * 30,
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!clientId || !user?.id) throw new Error("Not linked to a client");
      for (const file of files) {
        const filePath = `${clientId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("client-assets").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabase.from("assets").insert({
          client_id: clientId, uploaded_by: user.id, file_name: file.name,
          file_path: filePath, file_size: file.size, file_type: file.type, category: "upload",
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

  const deleteMutation = useMutation({
    mutationFn: async (asset: Pick<Asset, "id" | "file_path">) => {
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
  }, []);

  // Filter assets
  const filteredAssets = assets.filter((a) => {
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    if (searchQuery && !a.file_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const deliverables = filteredAssets.filter((a) => a.category === "deliverable");
  const uploads = filteredAssets.filter((a) => a.category === "upload");

  const AssetGridCard = ({ asset, variant }: { asset: Asset; variant: "deliverable" | "upload" }) => {
    const Icon = getFileIcon(asset.file_type);
    const canPreview = isPreviewable(asset.file_type);
    const urls = assetLinks[asset.id];
    const showThumbnail = isImage(asset.file_type) && urls?.previewUrl;

    return (
      <Card className="group hover:border-primary/20 transition-all duration-200 overflow-hidden">
        {/* Thumbnail area */}
        <div
          className="relative h-32 bg-muted/50 flex items-center justify-center cursor-pointer overflow-hidden"
          onClick={() => canPreview ? setPreviewAsset(asset) : urls?.downloadUrl && openDownload(asset.id)}
        >
          {showThumbnail ? (
            <img src={urls.previewUrl} alt={asset.file_name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <Icon className={`h-10 w-10 ${variant === "deliverable" ? "text-primary/40" : "text-muted-foreground/30"}`} />
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            {canPreview && (
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setPreviewAsset(asset); }}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button variant="secondary" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDownload(asset.id); }} disabled={!urls?.downloadUrl}>
              <Download className="h-4 w-4" />
            </Button>
            {variant === "upload" && (
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: asset.id, file_path: asset.file_path }); }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
        <CardContent className="p-3">
          <p className="text-sm font-medium truncate">{asset.file_name}</p>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {formatFileSize(asset.file_size)} · {new Date(asset.created_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    );
  };

  const AssetListCard = ({ asset, variant }: { asset: Asset; variant: "deliverable" | "upload" }) => {
    const Icon = getFileIcon(asset.file_type);
    const canPreview = isPreviewable(asset.file_type);
    const urls = assetLinks[asset.id];

    return (
      <Card className="hover:border-primary/20 transition-colors">
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${variant === "deliverable" ? "bg-primary/10" : "bg-accent/50"}`}>
            <Icon className={`h-5 w-5 ${variant === "deliverable" ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{asset.file_name}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{formatFileSize(asset.file_size)}</span> · {new Date(asset.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-1">
            {canPreview && (
              <Button variant="ghost" size="icon" onClick={() => setPreviewAsset(asset)} disabled={!urls?.previewUrl}>
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => openDownload(asset.id)} disabled={!urls?.downloadUrl}>
              <Download className="h-4 w-4" />
            </Button>
            {variant === "upload" && (
              <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: asset.id, file_path: asset.file_path })} disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const AssetSection = ({ title, items, variant }: { title: string; items: Asset[]; variant: "deliverable" | "upload" }) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {viewMode === "grid" ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((a) => <AssetGridCard key={a.id} asset={a} variant={variant} />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((a) => <AssetListCard key={a.id} asset={a} variant={variant} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <motion.div {...anim(0)}>
        <h1 className="text-2xl font-bold tracking-tight">Assets & Deliverables</h1>
        <p className="text-muted-foreground mt-1">Upload files for your projects and access completed deliverables.</p>
      </motion.div>

      {/* Upload zone */}
      <motion.div {...anim(0.08)}>
        <Card
          className={`border-dashed border-2 transition-colors cursor-pointer group ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </>
            ) : (
              <>
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Drag & drop files here</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">or click to browse</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      {/* Filters & view toggle */}
      {assets.length > 0 && (
        <motion.div {...anim(0.12)} className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All files</SelectItem>
              <SelectItem value="deliverable">Deliverables</SelectItem>
              <SelectItem value="upload">My uploads</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border border-border rounded-lg overflow-hidden ml-auto">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Asset sections */}
      <motion.div {...anim(0.16)} className="space-y-8">
        <AssetSection title="Deliverables from your team" items={deliverables} variant="deliverable" />
        <AssetSection title="Your uploads" items={uploads} variant="upload" />
      </motion.div>

      {!isLoading && filteredAssets.length === 0 && assets.length > 0 && (
        <motion.div {...anim(0.15)}>
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <Search className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No files match your search.</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!isLoading && assets.length === 0 && (
        <motion.div {...anim(0.15)}>
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FolderOpen className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No files yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Upload your first file to get started. Your team can also share deliverables here.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <AssetPreviewDialog
        asset={previewAsset}
        open={!!previewAsset}
        previewUrl={previewAsset ? assetLinks[previewAsset.id]?.previewUrl ?? null : null}
        downloadUrl={previewAsset ? assetLinks[previewAsset.id]?.downloadUrl ?? null : null}
        onOpenChange={(open) => { if (!open) setPreviewAsset(null); }}
      />
    </div>
  );
}
