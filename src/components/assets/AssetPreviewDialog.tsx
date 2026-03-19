import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

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

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Asset = Tables<"assets">;

interface AssetPreviewDialogProps {
  asset: Asset | null;
  open: boolean;
  onDownload: (asset: Asset) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function AssetPreviewDialog({
  asset,
  open,
  onDownload,
  onOpenChange,
}: AssetPreviewDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let nextImageUrl: string | null = null;

    const loadPreview = async () => {
      if (!open || !asset) {
        setImageUrl(null);
        setPdfPages([]);
        setPreviewError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setImageUrl(null);
      setPdfPages([]);
      setPreviewError(null);

      try {
        const { data, error } = await supabase.storage
          .from("client-assets")
          .download(asset.file_path);

        if (error) throw error;

        if (asset.file_type?.startsWith("image")) {
          nextImageUrl = URL.createObjectURL(data);
          if (isActive) setImageUrl(nextImageUrl);
          return;
        }

        if (asset.file_type === "application/pdf") {
          const pdf = await getDocument({ data: await data.arrayBuffer() }).promise;
          const renderedPages: string[] = [];

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");

            if (!context) {
              throw new Error("Failed to create PDF preview canvas");
            }

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
              canvasContext: context,
              viewport,
            }).promise;

            renderedPages.push(canvas.toDataURL("image/png"));
          }

          if (isActive) setPdfPages(renderedPages);
          return;
        }

        if (isActive) {
          setPreviewError("Preview is not available for this file type.");
        }
      } catch {
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
      if (nextImageUrl) URL.revokeObjectURL(nextImageUrl);
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

          {!isLoading && imageUrl && asset?.file_type?.startsWith("image") && (
            <img src={imageUrl} alt={asset.file_name} className="w-full h-auto rounded-lg" />
          )}

          {!isLoading && pdfPages.length > 0 && (
            <div className="space-y-4">
              {pdfPages.map((page, index) => (
                <img
                  key={`${asset?.id ?? "asset"}-${index + 1}`}
                  src={page}
                  alt={`${asset?.file_name ?? "PDF preview"} page ${index + 1}`}
                  className="w-full h-auto rounded-lg border"
                />
              ))}
            </div>
          )}

          {!isLoading && previewError && (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
              {previewError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => asset && onDownload(asset)}
          >
            <Download className="h-4 w-4 mr-2" /> Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
