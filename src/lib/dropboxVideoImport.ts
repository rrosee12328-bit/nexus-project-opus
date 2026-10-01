import { createVideoReviewDraftItem, type VideoReviewDraftItem } from "@/lib/videoReviewItems";

const VIDEO_FILENAME_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg)$/i;

export function dropboxVideoTitleFromFilename(filename: string): string {
  const title = filename.replace(VIDEO_FILENAME_EXTENSION, "").trim();
  return title || filename.trim();
}

export function createDropboxImportedVideoItems(files: Array<{ name: string; title?: string }>): VideoReviewDraftItem[] {
  const seenTitles = new Set<string>();

  return files.reduce<VideoReviewDraftItem[]>((items, file) => {
    const title = (file.title?.trim() || dropboxVideoTitleFromFilename(file.name)).trim();
    const key = title.toLocaleLowerCase();
    if (!title || seenTitles.has(key)) return items;
    seenTitles.add(key);
    items.push({ ...createVideoReviewDraftItem(), title });
    return items;
  }, []);
}
