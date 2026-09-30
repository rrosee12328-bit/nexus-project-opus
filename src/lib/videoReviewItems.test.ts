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

  it("preserves a valid direct link for an individual video", () => {
    const result = buildVideoReviewItems("https://www.dropbox.com/scl/fo/folder?dl=0", [
      { id: "one", title: "Opening reel", reviewUrl: "https://www.dropbox.com/scl/fi/opening.mp4?dl=1" },
    ]);
    expect(result.items[0].review_url).toBe("https://www.dropbox.com/scl/fi/opening.mp4?dl=0");
  });

  it("requires a title for every video", () => {
    expect(() => buildVideoReviewItems("https://www.dropbox.com/scl/fo/folder?dl=0", [
      { id: "one", title: " ", reviewUrl: "" },
    ])).toThrow("Add a title for video 1");
  });
});
