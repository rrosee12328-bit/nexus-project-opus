import { describe, expect, it } from "vitest";
import { buildVideoReviewItems } from "./videoReviewItems";

describe("buildVideoReviewItems", () => {
  it("uses the Dropbox folder link for each named video when no direct item link is supplied", () => {
    expect(buildVideoReviewItems("https://www.dropbox.com/scl/fo/folder?dl=1", [
      { id: "one", title: "Opening reel", reviewUrl: "" },
      { id: "two", title: "Customer story", reviewUrl: "" },
    ])).toEqual({
      deliveryUrl: "https://www.dropbox.com/scl/fo/folder?dl=0",
      items: [
        { title: "Opening reel", review_url: "https://www.dropbox.com/scl/fo/folder?dl=0" },
        { title: "Customer story", review_url: "https://www.dropbox.com/scl/fo/folder?dl=0" },
      ],
    });
  });

  it("preserves a valid direct link and detects a graphic filename", () => {
    const result = buildVideoReviewItems("https://www.dropbox.com/scl/fo/folder?dl=0", [
      { id: "one", title: "Square ad", reviewUrl: "https://www.dropbox.com/scl/fi/square-ad.png?dl=1" },
    ]);
    expect(result.items[0]).toMatchObject({
      review_url: "https://www.dropbox.com/scl/fi/square-ad.png?dl=0",
      source_file_name: "square-ad.png",
    });
  });

  it("preserves the imported Dropbox filename for in-portal playback", () => {
    const result = buildVideoReviewItems("https://www.dropbox.com/scl/fo/folder?dl=0", [
      { id: "one", title: "Opening reel", reviewUrl: "", sourceFileName: "Opening reel final.MP4" },
    ]);

    expect(result.items[0]).toMatchObject({
      title: "Opening reel",
      source_file_name: "Opening reel final.MP4",
    });
  });

  it("requires a title for every creative item", () => {
    expect(() => buildVideoReviewItems("https://www.dropbox.com/scl/fo/folder?dl=0", [
      { id: "one", title: " ", reviewUrl: "" },
    ])).toThrow("Add a title for item 1");
  });
});
