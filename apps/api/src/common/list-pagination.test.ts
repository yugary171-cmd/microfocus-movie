import { describe, expect, it } from "vitest";
import { boundedListWindow, emptyBoundedPage, maxListSkip, parsePage } from "./list-pagination.js";

describe("bounded list pagination", () => {
  it("parses a positive page and treats invalid values as page 1", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("nope")).toBe(1);
  });

  it("does not compute a large offset past the max page", () => {
    expect(boundedListWindow({ page: 2, pageSize: 50, maxPage: 100 })).toEqual({
      page: 2,
      pageSize: 50,
      skip: 50,
      take: 50,
      exceeded: false
    });
    expect(boundedListWindow({ page: 101, pageSize: 50, maxPage: 100 })).toMatchObject({
      skip: 0,
      exceeded: true
    });
    expect(maxListSkip(50, 100)).toBe(4950);
    expect(emptyBoundedPage(101, 50)).toEqual({
      items: [],
      page: 101,
      pageSize: 50,
      total: 0,
      totalPages: 0
    });
  });
});
