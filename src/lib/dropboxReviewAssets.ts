export type DropboxReviewAssetKind = "video" | "graphic";

export const DROPBOX_VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg)$/i;
export const DROPBOX_GRAPHIC_EXTENSION = /\.(jpg|jpeg|png|webp|gif|avif)$/i;
export const DROPBOX_REVIEWABLE_ASSET_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg|jpg|jpeg|png|webp|gif|avif)$/i;

export function isDropboxReviewableAsset(filename: string | null | undefined): boolean {
  return Boolean(filename && DROPBOX_REVIEWABLE_ASSET_EXTENSION.test(filename));
}

export function getDropboxReviewAssetKind(filename: string | null | undefined): DropboxReviewAssetKind {
  return filename && DROPBOX_GRAPHIC_EXTENSION.test(filename) ? "graphic" : "video";
}

export function dropboxReviewTitleFromFilename(filename: string): string {
  const title = filename.replace(DROPBOX_REVIEWABLE_ASSET_EXTENSION, "").trim();
  return title || filename.trim();
}

export function reviewAssetLabel(kind: DropboxReviewAssetKind): string {
  return kind === "graphic" ? "Graphic" : "Video";
}
