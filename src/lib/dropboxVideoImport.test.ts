import { describe, expect, it } from "vitest";
import { createDropboxImportedReviewItems, createDropboxImportedVideoItems, dropboxVideoTitleFromFilename } from "./dropboxVideoImport";
import { getDropboxReviewAssetKind, isDropboxReviewableAsset } from "./dropboxReviewAssets";

describe("Dropbox creative file helpers", () => {
  it("uses the Dropbox filename without a video or graphic extension", () => {
    expect(dropboxVideoTitleFromFilename("01. Client Story.MP4")).toBe("01. Client Story");
    expect(dropboxVideoTitleFromFilename("Social ad square.png")).toBe("Social ad square");
    expect(dropboxVideoTitleFromFilename("Carousel Frame.WEBP")).toBe("Carousel Frame");
  });

  it("recognizes common reviewable videos and graphics", () => {
    expect(isDropboxReviewableAsset("cut-01.mov")).toBe(true);
    expect(isDropboxReviewableAsset("campaign-ad.jpeg")).toBe(true);
    expect(isDropboxReviewableAsset("source-file.psd")).toBe(false);
    expect(getDropboxReviewAssetKind("campaign-ad.jpeg")).toBe("graphic");
    expect(getDropboxReviewAssetKind("cut-01.mov")).toBe("video");
  });

  it("creates one named review item per imported creative file", () => {
    const items = createDropboxImportedReviewItems([
      { name: "01. Welcome.mp4" },
      { name: "02. Offer.png", title: "02. Square Offer" },
      { name: "01. Welcome.mp4" },
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title)).toEqual(["01. Welcome", "02. Square Offer"]);
    expect(items.every((item) => item.reviewUrl === "")).toBe(true);
    expect(items.map((item) => item.sourceFileName)).toEqual(["01. Welcome.mp4", "02. Offer.png"]);
    expect(createDropboxImportedVideoItems).toBe(createDropboxImportedReviewItems);
  });
});
