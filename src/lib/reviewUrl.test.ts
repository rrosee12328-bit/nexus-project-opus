import { describe, expect, it } from "vitest";
import { normalizeDropboxReviewUrl, normalizeReviewUrl } from "./reviewUrl";

describe("normalizeReviewUrl", () => {
  it("accepts a secure review link", () => {
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

describe("normalizeDropboxReviewUrl", () => {
  it("accepts a Dropbox share link and keeps it in viewer mode", () => {
    expect(normalizeDropboxReviewUrl("https://www.dropbox.com/scl/fi/example/video.mp4?rlkey=abc&dl=1"))
      .toBe("https://www.dropbox.com/scl/fi/example/video.mp4?rlkey=abc&dl=0");
  });

  it("accepts the Dropbox content host", () => {
    expect(normalizeDropboxReviewUrl("https://dl.dropboxusercontent.com/s/example/video.mp4"))
      .toBe("https://dl.dropboxusercontent.com/s/example/video.mp4?dl=0");
  });

  it("rejects non-Dropbox links and lookalike hosts", () => {
    expect(normalizeDropboxReviewUrl("https://example.com/video.mp4")).toBeNull();
    expect(normalizeDropboxReviewUrl("https://dropbox.com.evil.example/video.mp4")).toBeNull();
  });
});
