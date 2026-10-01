import { AlertCircle, LoaderCircle, PlaySquare, Video } from "lucide-react";
import { useDropboxReviewVideo } from "@/hooks/useDropboxReviewVideo";

interface EmbeddedDropboxVideoProps {
  itemId: string;
  title: string;
  onPlaybackStarted: () => void;
}

export function EmbeddedDropboxVideo({ itemId, title, onPlaybackStarted }: EmbeddedDropboxVideoProps) {
  const videoQuery = useDropboxReviewVideo(itemId);

  if (videoQuery.isLoading) {
    return <div className="flex aspect-video items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-background"><div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin text-primary" /> Preparing secure video player…</div></div>;
  }

  if (videoQuery.isError) {
    return <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-destructive/35 bg-destructive/5 p-6 text-center"><AlertCircle className="h-7 w-7 text-destructive" /><div><p className="text-sm font-medium">This video could not be loaded in Vektiss.</p><p className="mt-1 max-w-lg text-xs text-muted-foreground">{videoQuery.error instanceof Error ? videoQuery.error.message : "Please ask your team to reconnect the Dropbox review source."}</p></div></div>;
  }

  const video = videoQuery.data;
  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-black shadow-[0_0_0_1px_rgba(59,130,246,0.07)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-950 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300"><span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-primary" /> Vektiss review player</span><span className="flex items-center gap-1 text-slate-400"><PlaySquare className="h-3.5 w-3.5" /> Dropbox source</span></div>
      <video key={video.url} className="aspect-video w-full bg-black" controls playsInline preload="metadata" aria-label={`Play ${title}`} onPlay={onPlaybackStarted}>
        <source src={video.url} />
        Your browser does not support embedded video playback.
      </video>
    </div>
  );
}
