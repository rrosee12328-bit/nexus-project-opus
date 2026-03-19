import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPreviewProps {
  file: Blob;
  fileName: string;
}

export function PdfPreview({ file, fileName }: PdfPreviewProps) {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let activeDocument: { destroy: () => Promise<void> } | null = null;

    const renderPdf = async () => {
      setIsRendering(true);
      setRenderError(null);
      setPageImages([]);

      try {
        const pdfData = await file.arrayBuffer();
        const loadingTask = getDocument({ data: pdfData, useWorkerFetch: false });
        const pdfDocument = await loadingTask.promise;
        activeDocument = pdfDocument;

        const renderedPages = await Promise.all(
          Array.from({ length: pdfDocument.numPages }, async (_, index) => {
            const page = await pdfDocument.getPage(index + 1);
            const viewport = page.getViewport({ scale: 1.25 });
            const outputScale = window.devicePixelRatio || 1;
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");

            if (!context) {
              throw new Error("Canvas context unavailable");
            }

            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);

            await page.render({
              canvas,
              canvasContext: context,
              viewport,
              transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
            }).promise;

            page.cleanup();
            return canvas.toDataURL("image/png");
          })
        );

        if (!isActive) return;
        setPageImages(renderedPages);
      } catch (error) {
        console.error("PDF render failed", error);
        if (!isActive) return;
        setRenderError("Couldn't render this PDF preview.");
      } finally {
        if (isActive) setIsRendering(false);
      }
    };

    void renderPdf();

    return () => {
      isActive = false;
      void activeDocument?.destroy();
    };
  }, [file]);

  if (isRendering) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
        {renderError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pageImages.map((pageImage, index) => (
        <img
          key={`${fileName}-page-${index + 1}`}
          src={pageImage}
          alt={`${fileName} page ${index + 1}`}
          className="w-full rounded-lg border bg-background"
          loading="lazy"
        />
      ))}
    </div>
  );
}
