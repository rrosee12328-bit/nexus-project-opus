import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AssetDownload() {
  const { assetId } = useParams<{ assetId: string }>();

  const { data, error, isLoading } = useQuery({
    queryKey: ["asset-download", assetId],
    enabled: !!assetId,
    retry: false,
    queryFn: async () => {
      if (!assetId) throw new Error("Missing file reference.");

      const { data: asset, error: assetError } = await supabase
        .from("assets")
        .select("id, file_name, file_path")
        .eq("id", assetId)
        .single();

      if (assetError) throw assetError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from("client-assets")
        .createSignedUrl(asset.file_path, 60 * 5, { download: asset.file_name });

      if (signedError) throw signedError;

      return {
        fileName: asset.file_name,
        signedUrl: signedData.signedUrl,
      };
    },
  });

  useEffect(() => {
    if (data?.signedUrl) {
      window.location.replace(data.signedUrl);
    }
  }, [data?.signedUrl]);

  const errorMessage = error instanceof Error ? error.message : "This file could not be downloaded.";

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            {isLoading && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold">Preparing your download</h1>
                  <p className="text-sm text-muted-foreground">Your file should start automatically.</p>
                </div>
              </>
            )}

            {!isLoading && data && (
              <>
                <Download className="h-8 w-8 text-primary" />
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold">If your download did not start</h1>
                  <p className="text-sm text-muted-foreground">Use the button below to download {data.fileName}.</p>
                </div>
                <Button asChild>
                  <a href={data.signedUrl}>Download file</a>
                </Button>
              </>
            )}

            {!isLoading && !data && (
              <div className="space-y-1">
                <h1 className="text-lg font-semibold">Download unavailable</h1>
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
