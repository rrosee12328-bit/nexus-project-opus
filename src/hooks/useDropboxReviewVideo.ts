import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DropboxReviewVideo = {
  url: string;
  expires_at: string | null;
  file_name: string;
};

const PLAYBACK_TOKEN_FRESH_FOR_MS = 8 * 60 * 1000;

export function useDropboxReviewVideo(itemId: string | null) {
  return useQuery({
    queryKey: ["dropbox-review-video", itemId],
    queryFn: async () => {
      if (!itemId) throw new Error("Choose an item to preview");
      const { data, error } = await supabase.functions.invoke<DropboxReviewVideo & { error?: string }>("get-dropbox-review-video", {
        body: { itemId },
      });
      if (error) {
        const response = error.context;
        const errorBody = response instanceof Response
          ? await response.clone().json().catch(() => null) as { error?: string } | null
          : null;
        throw new Error(data?.error || errorBody?.error || error.message || "Could not load this Dropbox review item");
      }
      if (!data?.url) throw new Error(data?.error || "Dropbox did not return a playable review link");
      return data;
    },
    enabled: Boolean(itemId),
    staleTime: PLAYBACK_TOKEN_FRESH_FOR_MS,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
}
