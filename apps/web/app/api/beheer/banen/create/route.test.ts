import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());

vi.mock("../../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../../lib/tos/court-repository", () => ({ CourtRepository: class { create = create; } }));

import { POST } from "./route";

const BASE = "https://app.example";
function request(extra: Record<string, string> = {}, origin: string | null = BASE) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ sport: "tennis", name: "Tennisbaan Noord", active: "true", sort_order: "10", ...extra })) form.set(key, value);
  return new NextRequest(`${BASE}/api/beheer/banen/create`, { method: "POST", headers: origin ? { origin } : undefined, body: form });
}

describe("court create route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAppBaseUrl.mockReturnValue(BASE);
    createServerSupabaseClient.mockResolvedValue({ requestScoped: true });
    loadAccountContextWithClient.mockResolvedValue({ capabilities: { canPlan: true } });
    create.mockResolvedValue("d9000000-0000-4000-8000-000000000001");
  });

  it("controleert Origin en staff vóór de smalle repositorywrite", async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${BASE}/beheer/banen?notice=court-created`);
    expect(create).toHaveBeenCalledWith({ sport: "tennis", name: "Tennisbaan Noord", active: true, sortOrder: 10 });
  });

  it("weigert externe Origin, forged authorityvelden en participant zonder write", async () => {
    expect((await POST(request({}, "https://evil.example"))).status).toBe(403);
    expect((await POST(request({ created_by: "attacker" }))).status).toBe(400);
    loadAccountContextWithClient.mockResolvedValueOnce({ capabilities: { canPlan: false } });
    expect((await POST(request())).headers.get("location")).toBe(`${BASE}/account`);
    expect(create).not.toHaveBeenCalled();
  });
});
