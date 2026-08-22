import { AdminRole } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { isNavigationItemActive, navigationItems } from "./navigation";

describe("admin navigation active state", () => {
  it("keeps the workbench active only on the root route", () => {
    expect(isNavigationItemActive("/", "/")).toBe(true);
    expect(isNavigationItemActive("/operations", "/")).toBe(false);
    expect(isNavigationItemActive("/audit", "/")).toBe(false);
  });

  it("keeps a section active on its own nested routes only", () => {
    expect(isNavigationItemActive("/dramas", "/dramas")).toBe(true);
    expect(isNavigationItemActive("/dramas/new", "/dramas")).toBe(true);
    expect(isNavigationItemActive("/operations", "/dramas")).toBe(false);
  });

  it("exposes account management to system administrators only", () => {
    const accounts = navigationItems.find((item) => item.to === "/accounts");
    expect(accounts).toMatchObject({ label: "账号管理", roles: [AdminRole.ADMIN] });
    expect(isNavigationItemActive("/accounts", "/accounts")).toBe(true);
  });

  it("exposes the tag library to system administrators only", () => {
    const tags = navigationItems.find((item) => item.to === "/tags");
    expect(tags).toMatchObject({ label: "标签库", roles: [AdminRole.ADMIN] });
  });

  it("assigns a unique semantic icon to every navigation item", () => {
    const icons = navigationItems.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
