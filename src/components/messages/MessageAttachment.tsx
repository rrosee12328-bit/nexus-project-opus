import { useState, useEffect } from "react";
import { FileText, Download, Image as ImageIcon, File, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MessageAttachmentProps {
  url: string;
  name: string;
  type: string | null;
  isOwn: boolean;
}

function getFileIcon(type: string | null) {
  if (!type) return File;
  if (type.startsWith("image/")) return ImageIcon;
  if (type === "application/pdf") return FileText;
  return File;
}

function isImage(type: string | null) {
  return type?.startsWith("image/") ?? false;
}

function isStoragePath(url: string) {
  return !url.startsWith("http://") && !url.startsWith("https://");
}

function useSignedUrl(storagePath: string | null) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) return;
    let cancelled = false;
    supabase.storage
      .from("client-assets")
      .createSignedUrl(storagePath, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setSignedUrl(data.signedUrl);
      });
    return () => { cancelled = true; };
  }, [storagePath]);

  return signedUrl;
}

export function MessageAttachment({ url, name, type, isOwn }: MessageAttachmentProps) {
  const needsSigning = isStoragePath(url);
  const signedUrl = useSignedUrl(needsSigning ? url : null);
  const resolvedUrl = needsSigning ? signedUrl : url;

  if (!resolvedUrl) {
    return (
      <div className="flex items-center gap-2 mt-1.5 px-3 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{name}</span>
      </div>
    );
  }

  if (isImage(type)) {
    return (
      <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
        <img
          src={resolvedUrl}
          alt={name}
          className="rounded-lg max-w-[260px] max-h-[200px] object-cover border border-border/30"
          loading="lazy"
        />
        <p className={`text-[10px] mt-1 truncate max-w-[260px] ${isOwn ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
          {name}
        </p>
      </a>
    );
  }

  const Icon = getFileIcon(type);
  return (
    <a
      href={resolvedUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 mt-1.5 px-3 py-2 rounded-lg border transition-colors ${
        isOwn
          ? "border-primary-foreground/20 hover:bg-primary-foreground/10"
          : "border-border hover:bg-accent/50"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
      <span className={`text-xs truncate max-w-[180px] ${isOwn ? "text-primary-foreground/80" : "text-foreground"}`}>
        {name}
      </span>
      <Download className={`h-3 w-3 shrink-0 ml-auto ${isOwn ? "text-primary-foreground/50" : "text-muted-foreground"}`} />
    </a>
  );
}
