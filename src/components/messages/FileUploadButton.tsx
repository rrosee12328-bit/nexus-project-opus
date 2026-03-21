import { useRef, useState } from "react";
import { Paperclip, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

interface FileUploadButtonProps {
  clientId: string;
  onFileUploaded: (file: { url: string; name: string; type: string }) => void;
  disabled?: boolean;
}

export function FileUploadButton({ clientId, onFileUploaded, disabled }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 10MB.");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("File type not supported. Try images, PDFs, or documents.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${clientId}/chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("client-assets")
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("client-assets")
        .getPublicUrl(path);

      onFileUploaded({
        url: urlData.publicUrl,
        name: file.name,
        type: file.type,
      });
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileSelect}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 h-10 w-10"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </Button>
    </>
  );
}

interface PendingAttachmentProps {
  name: string;
  onRemove: () => void;
}

export function PendingAttachment({ name, onRemove }: PendingAttachmentProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg text-xs">
      <Paperclip className="h-3 w-3 text-primary" />
      <span className="truncate max-w-[200px]">{name}</span>
      <button onClick={onRemove} className="ml-auto hover:text-destructive transition-colors">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
