import { describe, expect, it } from "vitest";
import { createDropboxImportedVideoItems, dropboxVideoTitleFromFilename } from "./dropboxVideoImport";

describe("dropboxVideoTitleFromFilename", () => {
  it("uses the Dropbox filename without its video extension", () => {
    expect(dropboxVideoTitleFromFilename("01. Client Story.MP4")).toBe("01. Client Story");
    expect(dropboxVideoTitleFromFilename("Intro.mov")).toBe("Intro");
  });
});

describe("createDropboxImportedVideoItems", () => {
  it("creates one named review item per unique imported Dropbox video", () => {
    const items = createDropboxImportedVideoItems([
      { name: "01. Welcome.mp4" },
      { name: "02. Offer.mov", title: "02. The Offer" },
      { name: "01. Welcome.mp4" },
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title)).toEqual(["01. Welcome", "02. The Offer"]);
    expect(items.every((item) => item.reviewUrl === "")).toBe(true);
  });
});
