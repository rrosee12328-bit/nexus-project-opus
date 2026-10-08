import { createVideoReviewDraftItem, type VideoReviewDraftItem } from "@/lib/videoReviewItems";
import { dropboxReviewTitleFromFilename } from "@/lib/dropboxReviewAssets";

export { dropboxReviewTitleFromFilename as dropboxVideoTitleFromFilename };

export function createDropboxImportedReviewItems(files: Array<{ name: string; title?: string }>): VideoReviewDraftItem[] {
  const seenTitles = new Set<string>();

  return files.reduce<VideoReviewDraftItem[]>((items, file) => {
    const sourceFileName = file.name.trim();
    const title = (file.title?.trim() || dropboxReviewTitleFromFilename(sourceFileName)).trim();
    const key = title.toLocaleLowerCase();
    if (!title || !sourceFileName || seenTitles.has(key)) return items;
    seenTitles.add(key);
    items.push({ ...createVideoReviewDraftItem(), title, sourceFileName });
    return items;
  }, []);
}

// Kept as an alias so older review forms and existing imports remain compatible.
export const createDropboxImportedVideoItems = createDropboxImportedReviewItems;
