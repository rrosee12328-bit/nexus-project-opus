import { Download, Loader2 } from "lucide-react";

import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Asset = Tables<"assets">;

interface AssetPreviewDialogProps {
  asset: Asset | null;
  open: boolean;
  previewUrl: string | null;
  downloadUrl: string | null;
  onOpenChange: (open: boolean) => void;
}

export function AssetPreviewDialog({
  asset,
  open,
  previewUrl,
  downloadUrl,
  onOpenChange,
}: AssetPreviewDialogProps) {
  const isImage = asset?.file_type?.startsWith("image") ?? false;
  const isPdf = asset?.file_type === "application/pdf";
  const isPreviewable = isImage || isPdf;
  const isWaitingForUrl = !!asset && isPreviewable && !previewUrl;

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
          {isWaitingForUrl && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isWaitingForUrl && asset && previewUrl && isImage && (
            <img src={previewUrl} alt={asset.file_name} className="w-full h-auto rounded-lg" />
          )}

          {!isWaitingForUrl && asset && previewUrl && isPdf && (
            <iframe
              src={previewUrl}
              title={asset.file_name}
              className="h-[70vh] w-full rounded-lg border"
            />
          )}

          {!isWaitingForUrl && asset && !isPreviewable && (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
              Preview is not available for this file type.
            </div>
          )}

          {!isWaitingForUrl && asset && isPreviewable && !previewUrl && (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
              Couldn&apos;t load a preview for this file.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {downloadUrl ? (
            <Button variant="outline" asChild>
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" /> Download
              </a>
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
