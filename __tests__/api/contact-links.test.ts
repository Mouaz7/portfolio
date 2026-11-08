/**
 * @jest-environment node
 */

import { GET } from "@/app/api/contact/route";
import { getContactLinks } from "@/lib/contact/data.server";

jest.mock("@/lib/contact/data.server", () => ({
  getContactLinks: jest.fn(),
}));

describe("GET /api/contact", () => {
  it("returns the links with shared cache headers", async () => {
    const links = [{ id: "1", name: "GitHub", href: "https://github.com/Mouaz7" }];
    jest.mocked(getContactLinks).mockResolvedValue(links as never);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(links);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("returns 500 without details when the database fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.mocked(getContactLinks).mockRejectedValue(new Error("db down"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "db" });
    consoleError.mockRestore();
  });
});
