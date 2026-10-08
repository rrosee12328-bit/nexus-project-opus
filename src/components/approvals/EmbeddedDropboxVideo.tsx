import { useEffect, useRef, useState } from "react";
import { AlertCircle, Expand, ImageIcon, LoaderCircle, PlaySquare, Video, X } from "lucide-react";
import { useDropboxReviewVideo } from "@/hooks/useDropboxReviewVideo";
import { getDropboxReviewAssetKind, reviewAssetLabel, type DropboxReviewAssetKind } from "@/lib/dropboxReviewAssets";

interface EmbeddedDropboxVideoProps {
  itemId: string;
  title: string;
  sourceFileName?: string | null;
  assetKind?: DropboxReviewAssetKind;
  publicToken?: string | null;
  onPlaybackStarted: () => void;
}

export function EmbeddedDropboxVideo({ itemId, title, sourceFileName, assetKind, publicToken, onPlaybackStarted }: EmbeddedDropboxVideoProps) {
  const assetQuery = useDropboxReviewVideo(itemId, publicToken);
  const kind = assetKind ?? getDropboxReviewAssetKind(sourceFileName ?? title);
  const isGraphic = kind === "graphic";
  const assetLabel = reviewAssetLabel(kind).toLocaleLowerCase();
  const [isLoadingAsset, setIsLoadingAsset] = useState(true);
  const [isPortrait, setIsPortrait] = useState(false);
  const [mediaLoadError, setMediaLoadError] = useState(false);
  const [retryingExpiredToken, setRetryingExpiredToken] = useState(false);
  const [expandedGraphic, setExpandedGraphic] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setIsLoadingAsset(true);
    setIsPortrait(false);
    setMediaLoadError(false);
    setRetryingExpiredToken(false);
    setExpandedGraphic(false);
  }, [assetQuery.data?.url, isGraphic]);

  if (assetQuery.isLoading) {
    return <div className="flex aspect-video items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-background"><div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin text-primary" /> Preparing secure {assetLabel} viewer…</div></div>;
  }

  if (assetQuery.isError || mediaLoadError) {
    const message = assetQuery.error instanceof Error ? assetQuery.error.message : `Please ask your team to reconnect the Dropbox review source for this ${assetLabel}.`;
    return <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-destructive/35 bg-destructive/5 p-6 text-center"><AlertCircle className="h-7 w-7 text-destructive" /><div><p className="text-sm font-medium">This {assetLabel} could not be loaded in Vektiss.</p><p className="mt-1 max-w-lg text-xs text-muted-foreground">{message}</p></div></div>;
  }

  const asset = assetQuery.data;
  const maximizeAsset = async () => {
    if (isGraphic) {
      setExpandedGraphic(true);
      return;
    }
    const player = videoRef.current;
    if (!player) return;
    const safariPlayer = player as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (safariPlayer.webkitEnterFullscreen) {
      safariPlayer.webkitEnterFullscreen();
      return;
    }
    if (player.requestFullscreen) await player.requestFullscreen();
  };

  const icon = isGraphic ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Video className="h-3.5 w-3.5 shrink-0 text-primary" />;
  const refreshExpiredPlaybackToken = () => {
    setIsLoadingAsset(false);
    if (retryingExpiredToken) {
      setMediaLoadError(true);
      return;
    }
    setRetryingExpiredToken(true);
    setIsLoadingAsset(true);
    void assetQuery.refetch().catch(() => setMediaLoadError(true));
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-primary/25 bg-black shadow-[0_0_0_1px_rgba(59,130,246,0.07)]">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-3 sm:tracking-[0.16em]"><span className="flex min-w-0 items-center gap-1.5">{icon}<span className="truncate sm:hidden">Review {assetLabel}</span><span className="hidden sm:inline">Vektiss review {assetLabel}</span></span><div className="flex shrink-0 items-center gap-2"><span className="hidden items-center gap-1 text-slate-400 sm:flex">{isGraphic ? <ImageIcon className="h-3.5 w-3.5" /> : <PlaySquare className="h-3.5 w-3.5" />} Secure delivery</span><button type="button" onClick={() => void maximizeAsset()} className="flex min-h-8 items-center gap-1 rounded-md border border-primary/45 bg-primary/10 px-2 text-[10px] font-semibold normal-case tracking-normal text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Maximize ${title}`}><Expand className="h-3.5 w-3.5" /> Maximize</button></div></div>
        <div className={`relative flex justify-center bg-black ${isGraphic ? "min-h-[18rem] sm:min-h-[28rem]" : ""}`}>
          {isGraphic ? (
            <img key={asset.url} src={asset.url} alt={title} className="block max-h-[68svh] w-auto max-w-full object-contain" onLoad={() => { setIsLoadingAsset(false); onPlaybackStarted(); }} onError={refreshExpiredPlaybackToken} />
          ) : (
            <video ref={videoRef} key={asset.url} className={`block bg-black object-contain sm:aspect-video sm:h-auto sm:w-full ${isPortrait ? "h-[min(62svh,calc(100vw*16/9))] w-auto max-w-full" : "aspect-video w-full"}`} controls playsInline preload="auto" aria-label={`Play ${title}`} onLoadStart={() => setIsLoadingAsset(true)} onLoadedMetadata={(event) => setIsPortrait(event.currentTarget.videoHeight > event.currentTarget.videoWidth)} onWaiting={() => setIsLoadingAsset(true)} onCanPlay={() => setIsLoadingAsset(false)} onPlaying={() => { setIsLoadingAsset(false); onPlaybackStarted(); }} onError={refreshExpiredPlaybackToken}><source src={asset.url} />Your browser does not support embedded video playback.</video>
          )}
          {isLoadingAsset && <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3" aria-live="polite"><div className="flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/85 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur"><LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" /><span className="font-medium">Loading {assetLabel}…</span><span className="hidden text-slate-300 sm:inline">Securely streaming from Dropbox</span></div></div>}
        </div>
      </div>
      {expandedGraphic && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4" role="dialog" aria-modal="true" aria-label={`Expanded ${title}`}><button type="button" onClick={() => setExpandedGraphic(false)} className="absolute right-4 top-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-white/20 bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"><X className="h-4 w-4" /> Close</button><img src={asset.url} alt={title} className="max-h-full max-w-full object-contain" /></div>}
    </>
  );
}
