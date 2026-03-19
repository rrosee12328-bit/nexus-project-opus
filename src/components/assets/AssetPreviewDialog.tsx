import { Download } from "lucide-react";

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
  const previewUrl = asset
    ? supabase.storage.from("client-assets").getPublicUrl(asset.file_path).data.publicUrl
    : null;
  const isImage = asset?.file_type?.startsWith("image") ?? false;
  const isPdf = asset?.file_type === "application/pdf";

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
          {asset && previewUrl && isImage && (
            <img src={previewUrl} alt={asset.file_name} className="w-full h-auto rounded-lg" />
          )}

          {asset && previewUrl && isPdf && (
            <iframe
              src={previewUrl}
              title={asset.file_name}
              className="h-[70vh] w-full rounded-lg border"
            />
          )}

          {asset && !isImage && !isPdf && (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
              Preview is not available for this file type.
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
