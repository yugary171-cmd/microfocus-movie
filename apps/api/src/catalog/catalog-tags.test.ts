import { CatalogTagStatus, homeFilterOptionsFromTags, publicDramaTags } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { toCatalogTag, rewriteDramaTagIds } from "./catalog-tags.js";

describe("catalog tag mapping", () => {
  it("maps rows and keeps audience tags off the home filters and public display", () => {
    const rows = [
      { id: "1", group: "subjects", name: "都市", status: CatalogTagStatus.ACTIVE, sortOrder: 1 },
      { id: "2", group: "audiences", name: "男频", status: CatalogTagStatus.ACTIVE, sortOrder: 2 },
      { id: "3", group: "settings", name: "重生", status: CatalogTagStatus.ARCHIVED, sortOrder: 3 }
    ];
    expect(toCatalogTag(rows[0]!)).toMatchObject({ group: "subjects", name: "都市" });
    expect(homeFilterOptionsFromTags(rows)).toEqual({
      subjects: ["都市"],
      settings: [],
      backgrounds: []
    });
    expect(publicDramaTags(["都市", "男频", "重生"], rows)).toEqual(["都市"]);
    expect(rewriteDramaTagIds(["1", "2", "1"], "1", "3")).toEqual(["3", "2"]);
  });
});
