import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DropboxVideoReviewConnection = {
  connected: boolean;
  account_name: string | null;
  connected_at: string | null;
  updated_at: string | null;
};

export type DropboxVideoImportResult = {
  folderName: string;
  items: Array<{ name: string; title: string }>;
  truncated?: boolean;
};

export function useDropboxVideoReviewImport() {
  const connectionQuery = useQuery({
    queryKey: ["dropbox-video-review-connection"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dropbox_video_review_connection");
      if (error) throw error;
      return ((data ?? [])[0] ?? { connected: false, account_name: null, connected_at: null, updated_at: null }) as DropboxVideoReviewConnection;
    },
  });

  const importMutation = useMutation({
    mutationFn: async (folderUrl: string) => {
      const { data, error } = await supabase.functions.invoke<DropboxVideoImportResult>("import-dropbox-video-items", {
        body: { folderUrl },
      });
      if (error) throw error;
      return data;
    },
  });

  return { connectionQuery, importMutation };
}
