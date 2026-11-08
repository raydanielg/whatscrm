import { describe, it, expect } from "vitest";
import { requiredPermissionsForPath } from "../components/app/nav-permissions";
describe("route permissions", () => {
  it("maps paths", () => {
    const cases: [string, string][] = [
      ["/billing", "page.billing"],
      ["/deals/123", "page.deals"],
      ["/inbox/", "page.inbox"],
      ["/roles", "page.roles"],
      ["/contacts", "page.contacts"],
    ];
    for (const [p, expected] of cases) {
      const got = requiredPermissionsForPath(p);
      console.log(p, "=>", JSON.stringify(got));
      expect(got).toContain(expected);
    }
    console.log("/", "=>", JSON.stringify(requiredPermissionsForPath("/")));
    console.log("/unknown-xyz", "=>", JSON.stringify(requiredPermissionsForPath("/unknown-xyz")));
    expect(requiredPermissionsForPath("/")).toEqual([]);
    expect(requiredPermissionsForPath("/unknown-xyz")).toEqual([]);
  });
});
