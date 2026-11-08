/**
 * @jest-environment node
 */

import { GET } from "@/app/api/skills/route";
import { supabase } from "@/lib/backend/supabaseClient";

jest.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));

jest.mock("@/lib/backend/supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}));

const allowedCategories = [
  "frontend",
  "mobile",
  "backend",
  "storage",
  "devops",
  "ai",
  "ides",
  "workflow",
  "webdata",
];

function createSkillsQuery(data: unknown, error: unknown = null) {
  const result = { data, error };
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

describe("/api/skills", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps active ordered skills and applies the one-hour shared cache policy", async () => {
    const query = createSkillsQuery([
      {
        id: "typescript",
        name: "TypeScript",
        category: "frontend",
        icon_bucket: "skills",
        icon_path: "https://cdn.example.com/typescript.svg",
        icon_path_light: "https://cdn.example.com/typescript-light.svg",
        icon_alt: "TypeScript logo",
        mono: true,
        sort_order: 1,
        created_at: "2026-01-01",
      },
      {
        id: "postgresql",
        name: "PostgreSQL",
        category: "storage",
        icon_bucket: "skills",
        icon_path: "postgresql.svg",
        icon_path_light: "postgresql-light.svg",
        icon_alt: null,
        mono: null,
        sort_order: 2,
        created_at: "2026-01-02",
      },
    ]);
    (supabase.from as jest.Mock).mockReturnValue(query);
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600",
    );
    await expect(response.json()).resolves.toEqual([
      {
        id: "typescript",
        name: "TypeScript",
        category: "frontend",
        src: "/skill-icons/frontend-typescript.svg",
        alt: "TypeScript logo",
        mono: true,
        weight: 0,
      },
      {
        id: "postgresql",
        name: "PostgreSQL",
        category: "storage",
        src: "/skill-icons/storage-postgresql.svg",
        alt: "PostgreSQL",
        mono: false,
        weight: 1,
      },
    ]);
    expect(supabase.from).toHaveBeenCalledWith("skill");
    expect(query.select).toHaveBeenCalledWith(
      "id,name,category,icon_path,icon_path_light,icon_alt,mono,sort_order,created_at",
    );
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
    expect(query.in).toHaveBeenCalledWith("category", allowedCategories);
    expect(query.order).toHaveBeenNthCalledWith(1, "sort_order", { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: true });
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("returns self-hosted skill icon paths without calling Storage", async () => {
    const query = createSkillsQuery([{
      id: "typescript",
      name: "TypeScript",
      category: "frontend",
      icon_bucket: "",
      icon_path: "/skill-icons/frontend-typescript.svg",
      icon_path_light: null,
      icon_alt: "TypeScript logo",
      mono: false,
      sort_order: 1,
      created_at: "2026-01-01",
    }]);
    (supabase.from as jest.Mock).mockReturnValue(query);

    const response = await GET();
    const [skill] = await response.json();

    expect(skill.src).toBe("/skill-icons/frontend-typescript.svg");
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("returns a generic database error response without leaking the message", async () => {
    const legacyError = { message: "database unavailable" };
    (supabase.from as jest.Mock).mockReturnValueOnce(createSkillsQuery(null, legacyError));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "db" });
    expect(consoleError).toHaveBeenCalledTimes(1);
    const output = String(consoleError.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toMatchObject({
      code: "unknown_error",
      event: "api.skills.database_failed",
      route: "/api/skills",
    });
    expect(output).not.toContain(legacyError.message);
    consoleError.mockRestore();
  });
});
