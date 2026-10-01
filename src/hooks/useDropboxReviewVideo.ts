import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DropboxReviewVideo = {
  url: string;
  expires_at: string | null;
  file_name: string;
};

export function useDropboxReviewVideo(itemId: string | null) {
  return useQuery({
    queryKey: ["dropbox-review-video", itemId],
    queryFn: async () => {
      if (!itemId) throw new Error("Choose a video to play");
      const { data, error } = await supabase.functions.invoke<DropboxReviewVideo & { error?: string }>("get-dropbox-review-video", {
        body: { itemId },
      });
      if (error) throw new Error(data?.error || error.message || "Could not load this Dropbox video");
      if (!data?.url) throw new Error(data?.error || "Dropbox did not return a playable video link");
      return data;
    },
    enabled: Boolean(itemId),
    staleTime: 3 * 60 * 60 * 1000,
    gcTime: 3 * 60 * 60 * 1000,
    retry: 1,
  });
}
