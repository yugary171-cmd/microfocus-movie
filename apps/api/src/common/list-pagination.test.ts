import { describe, expect, it } from "vitest";
import { ADMIN_LIST_MAX_PAGE, ADMIN_LIST_PAGE_SIZE } from "@microfocus/contracts";
import { boundedListWindow, emptyBoundedPage, maxListSkip, parsePage } from "./list-pagination.js";

describe("bounded list pagination", () => {
  it("parses a positive page and treats invalid values as page 1", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("nope")).toBe(1);
  });

  it("does not compute a large offset past the max page", () => {
    expect(boundedListWindow({ page: 2, pageSize: ADMIN_LIST_PAGE_SIZE, maxPage: ADMIN_LIST_MAX_PAGE })).toEqual({
      page: 2,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      skip: ADMIN_LIST_PAGE_SIZE,
      take: ADMIN_LIST_PAGE_SIZE,
      exceeded: false
    });
    expect(boundedListWindow({ page: ADMIN_LIST_MAX_PAGE + 1, pageSize: ADMIN_LIST_PAGE_SIZE, maxPage: ADMIN_LIST_MAX_PAGE })).toMatchObject({
      skip: 0,
      exceeded: true
    });
    expect(maxListSkip(ADMIN_LIST_PAGE_SIZE, ADMIN_LIST_MAX_PAGE)).toBe(
      ADMIN_LIST_PAGE_SIZE * (ADMIN_LIST_MAX_PAGE - 1)
    );
    expect(emptyBoundedPage(ADMIN_LIST_MAX_PAGE + 1, ADMIN_LIST_PAGE_SIZE)).toEqual({
      items: [],
      page: ADMIN_LIST_MAX_PAGE + 1,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      total: 0,
      totalPages: 0
    });
  });
});
