import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVideoReviewDraftItem, type VideoReviewDraftItem } from "@/lib/videoReviewItems";

interface VideoReviewItemFieldsProps {
  idPrefix: string;
  items: VideoReviewDraftItem[];
  onChange: (items: VideoReviewDraftItem[]) => void;
}

export function VideoReviewItemFields({ idPrefix, items, onChange }: VideoReviewItemFieldsProps) {
  const updateItem = (id: string, key: "title" | "reviewUrl", value: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-medium">Videos for this review *</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Name every video. Leave an item link blank to use the Dropbox folder above.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, createVideoReviewDraftItem()])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add video
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-md border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video {index + 1}</p>
              {items.length > 1 && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => removeItem(item.id)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Remove</Button>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-title-${item.id}`} className="text-xs">Video title *</Label>
                <Input id={`${idPrefix}-title-${item.id}`} value={item.title} onChange={(event) => updateItem(item.id, "title", event.target.value)} placeholder="e.g. Testimonial — cut 1" maxLength={160} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-link-${item.id}`} className="text-xs">Direct Dropbox link <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id={`${idPrefix}-link-${item.id}`} type="url" value={item.reviewUrl} onChange={(event) => updateItem(item.id, "reviewUrl", event.target.value)} placeholder="Uses the folder link if blank" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
