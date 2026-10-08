import { normalizeDropboxReviewUrl } from "@/lib/reviewUrl";
import { isDropboxReviewableAsset } from "@/lib/dropboxReviewAssets";

export type VideoReviewDraftItem = {
  id: string;
  title: string;
  reviewUrl: string;
  sourceFileName?: string;
};

export type VideoReviewItemPayload = {
  title: string;
  review_url: string;
  source_file_name?: string;
};

export function createVideoReviewDraftItem(): VideoReviewDraftItem {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `review-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return { id, title: "", reviewUrl: "" };
}

function sourceFileNameFromDropboxLink(value: string): string | undefined {
  try {
    const pathname = new URL(value).pathname;
    const candidate = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "").trim();
    return isDropboxReviewableAsset(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function buildVideoReviewItems(
  deliveryUrl: string,
  items: VideoReviewDraftItem[],
): { deliveryUrl: string; items: VideoReviewItemPayload[] } {
  const normalizedDeliveryUrl = normalizeDropboxReviewUrl(deliveryUrl);
  if (!normalizedDeliveryUrl) {
    throw new Error("Enter a secure Dropbox folder or creative-file link");
  }
  if (items.length === 0) {
    throw new Error("Add at least one creative item for the client to review");
  }

  const preparedItems = items.map((item, index) => {
    const title = item.title.trim();
    if (!title) throw new Error(`Add a title for item ${index + 1}`);

    const directLink = item.reviewUrl.trim();
    const reviewUrl = directLink ? normalizeDropboxReviewUrl(directLink) : normalizedDeliveryUrl;
    if (!reviewUrl) throw new Error(`Item ${index + 1} needs a secure Dropbox link`);

    const sourceFileName = item.sourceFileName?.trim() || sourceFileNameFromDropboxLink(directLink);
    return {
      title,
      review_url: reviewUrl,
      ...(sourceFileName ? { source_file_name: sourceFileName } : {}),
    };
  });

  return { deliveryUrl: normalizedDeliveryUrl, items: preparedItems };
}
