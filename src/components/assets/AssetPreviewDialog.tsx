import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
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
  onDownload: (asset: Asset) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function AssetPreviewDialog({
  asset,
  open,
  onDownload,
  onOpenChange,
}: AssetPreviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"image" | "pdf" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      if (!open || !asset) {
        setPreviewUrl(null);
        setPreviewKind(null);
        setPreviewError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setPreviewUrl(null);
      setPreviewKind(null);
      setPreviewError(null);

      try {
        const { data, error } = await supabase.storage
          .from("client-assets")
          .download(asset.file_path);

        if (error) throw error;

        if (asset.file_type?.startsWith("image") || asset.file_type === "application/pdf") {
          objectUrl = URL.createObjectURL(data);

          if (isActive) {
            setPreviewUrl(objectUrl);
            setPreviewKind(asset.file_type === "application/pdf" ? "pdf" : "image");
          }

          return;
        }

        if (isActive) {
          setPreviewError("Preview is not available for this file type.");
        }
      } catch (error) {
        console.error("Asset preview failed", error);

        if (isActive) {
          setPreviewError("Couldn't load a preview for this file.");
          toast.error("Failed to load preview");
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    loadPreview();

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

          {!isLoading && previewUrl && previewKind === "image" && asset && (
            <img src={previewUrl} alt={asset.file_name} className="w-full h-auto rounded-lg" />
          )}

          {!isLoading && previewUrl && previewKind === "pdf" && asset && (
            <iframe
              src={previewUrl}
              title={asset.file_name}
              className="h-[70vh] w-full rounded-lg border"
            />
          )}

          {!isLoading && previewError && (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
              {previewError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {asset && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await onDownload(asset);
                } catch (error) {
                  console.error("Asset download failed", error);
                  toast.error("Failed to download file");
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
