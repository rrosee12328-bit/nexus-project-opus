import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { PdfPreview } from "@/components/assets/PdfPreview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Asset = Tables<"assets">;

interface AssetPreviewDialogProps {
  asset: Asset | null;
  open: boolean;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  onOpenChange: (open: boolean) => void;
}

export function AssetPreviewDialog({
  asset,
  open,
  downloadUrl,
  onOpenChange,
}: AssetPreviewDialogProps) {
  const handleDownload = () => {
    if (!downloadUrl) return;
    const popup = window.open(downloadUrl, "_blank", "noopener,noreferrer");
    if (!popup) window.location.assign(downloadUrl);
  };
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string | null>(null);
  const [resolvedPreviewFile, setResolvedPreviewFile] = useState<Blob | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "pdf" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      if (!open || !asset) {
        setResolvedPreviewUrl(null);
        setResolvedPreviewFile(null);
        setPreviewKind(null);
        setPreviewError(null);
        setIsLoading(false);
        return;
      }

      const isImage = asset.file_type?.startsWith("image") ?? false;
      const isPdf = asset.file_type === "application/pdf";

      if (!isImage && !isPdf) {
        setResolvedPreviewUrl(null);
        setResolvedPreviewFile(null);
        setPreviewKind(null);
        setPreviewError("Preview is not available for this file type.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setResolvedPreviewUrl(null);
      setResolvedPreviewFile(null);
      setPreviewKind(null);
      setPreviewError(null);

      try {
        const { data, error } = await supabase.storage
          .from("client-assets")
          .download(asset.file_path);

        if (error) throw error;

        const previewBlob = data.type
          ? data
          : new Blob([data], {
              type: asset.file_type || "application/octet-stream",
            });

        if (!isActive) return;

        setResolvedPreviewFile(previewBlob);
        setPreviewKind(isPdf ? "pdf" : "image");

        if (isImage) {
          objectUrl = URL.createObjectURL(previewBlob);
          setResolvedPreviewUrl(objectUrl);
        }
      } catch (error) {
        console.error("Asset preview failed", error);
        if (!isActive) return;
        setPreviewError("Couldn't load a preview for this file.");
        toast.error("Failed to load preview");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadPreview();

    return () => {
      isActive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{asset?.file_name}</DialogTitle>
          <DialogDescription className="sr-only">
            Preview this asset before downloading it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && resolvedPreviewUrl && previewKind === "image" && asset && (
            <img src={resolvedPreviewUrl} alt={asset.file_name} className="w-full h-auto rounded-lg" />
          )}

          {!isLoading && resolvedPreviewFile && previewKind === "pdf" && asset && (
            <PdfPreview file={resolvedPreviewFile} fileName={asset.file_name} />
          )}

          {!isLoading && previewError && (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
              {previewError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {downloadUrl ? (
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
