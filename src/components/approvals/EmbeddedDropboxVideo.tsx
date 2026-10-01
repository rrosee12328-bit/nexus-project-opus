import { useEffect, useRef, useState } from "react";
import { AlertCircle, Expand, LoaderCircle, PlaySquare, Video } from "lucide-react";
import { useDropboxReviewVideo } from "@/hooks/useDropboxReviewVideo";

interface EmbeddedDropboxVideoProps {
  itemId: string;
  title: string;
  onPlaybackStarted: () => void;
}

export function EmbeddedDropboxVideo({ itemId, title, onPlaybackStarted }: EmbeddedDropboxVideoProps) {
  const videoQuery = useDropboxReviewVideo(itemId);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isPortrait, setIsPortrait] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setIsBuffering(true);
    setIsPortrait(false);
  }, [videoQuery.data?.url]);

  if (videoQuery.isLoading) {
    return <div className="flex aspect-video items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-background"><div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin text-primary" /> Preparing secure video player…</div></div>;
  }

  if (videoQuery.isError) {
    return <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-destructive/35 bg-destructive/5 p-6 text-center"><AlertCircle className="h-7 w-7 text-destructive" /><div><p className="text-sm font-medium">This video could not be loaded in Vektiss.</p><p className="mt-1 max-w-lg text-xs text-muted-foreground">{videoQuery.error instanceof Error ? videoQuery.error.message : "Please ask your team to reconnect the Dropbox review source."}</p></div></div>;
  }

  const video = videoQuery.data;
  const maximizeVideo = async () => {
    const player = videoRef.current;
    if (!player) return;
    const safariPlayer = player as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (safariPlayer.webkitEnterFullscreen) {
      safariPlayer.webkitEnterFullscreen();
      return;
    }
    if (player.requestFullscreen) await player.requestFullscreen();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-black shadow-[0_0_0_1px_rgba(59,130,246,0.07)]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-3 sm:tracking-[0.16em]"><span className="flex min-w-0 items-center gap-1.5"><Video className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate sm:hidden">Review player</span><span className="hidden sm:inline">Vektiss review player</span></span><div className="flex shrink-0 items-center gap-2"><span className="hidden items-center gap-1 text-slate-400 sm:flex"><PlaySquare className="h-3.5 w-3.5" /> Dropbox source</span><button type="button" onClick={() => void maximizeVideo()} className="flex min-h-8 items-center gap-1 rounded-md border border-primary/45 bg-primary/10 px-2 text-[10px] font-semibold normal-case tracking-normal text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Maximize ${title}`}><Expand className="h-3.5 w-3.5" /> Maximize</button></div></div>
      <div className="relative flex justify-center bg-black">
        <video ref={videoRef} key={video.url} className={`block bg-black object-contain sm:aspect-video sm:h-auto sm:w-full ${isPortrait ? "h-[min(62svh,calc(100vw*16/9))] w-auto max-w-full" : "aspect-video w-full"}`} controls playsInline preload="auto" aria-label={`Play ${title}`} onLoadStart={() => setIsBuffering(true)} onLoadedMetadata={(event) => setIsPortrait(event.currentTarget.videoHeight > event.currentTarget.videoWidth)} onWaiting={() => setIsBuffering(true)} onCanPlay={() => setIsBuffering(false)} onPlaying={() => { setIsBuffering(false); onPlaybackStarted(); }}>
          <source src={video.url} />
          Your browser does not support embedded video playback.
        </video>
        {isBuffering && <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3" aria-live="polite"><div className="flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/85 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur"><LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" /><span className="font-medium">Loading video…</span><span className="hidden text-slate-300 sm:inline">Securely streaming from Dropbox</span></div></div>}
      </div>
    </div>
  );
}
