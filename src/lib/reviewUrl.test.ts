import { describe, expect, it } from "vitest";
import { normalizeReviewUrl } from "./reviewUrl";

describe("normalizeReviewUrl", () => {
  it("accepts secure Dropbox review links", () => {
    expect(normalizeReviewUrl(" https://www.dropbox.com/scl/fi/example/video.mp4?dl=0 "))
      .toBe("https://www.dropbox.com/scl/fi/example/video.mp4?dl=0");
  });

  it("rejects unsafe and malformed links", () => {
    expect(normalizeReviewUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeReviewUrl("http://example.com/video.mp4")).toBeNull();
    expect(normalizeReviewUrl("not a link")).toBeNull();
  });

  it("treats an empty value as optional", () => {
    expect(normalizeReviewUrl("  ")).toBeNull();
  });
});
