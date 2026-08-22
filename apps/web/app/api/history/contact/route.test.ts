import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAppBaseUrl = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const loadAccountContextWithClient = vi.hoisted(() => vi.fn());
const requestContact = vi.hoisted(() => vi.fn());
const respondContact = vi.hoisted(() => vi.fn());

vi.mock("../../../../lib/config/public-supabase", () => ({ readAppBaseUrl }));
vi.mock("../../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../../lib/auth/session", () => ({ loadAccountContextWithClient }));
vi.mock("../../../../lib/history/repository", () => ({ HistoryRepository: class { requestContact = requestContact; respondContact = respondContact; } }));

import { POST } from "./route";

const BASE = "https://app.example";
const ID = "11111111-1111-4111-8111-111111111111";
const client = Object.freeze({ requestScoped: true });
const account = { capabilities: { canParticipate: true }, profile: { active: true } };
function request(fields: Record<string, string>, origin: string | null = BASE) {
  const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest(`${BASE}/api/history/contact`, { method: "POST", headers: origin ? { origin } : undefined, body: form });
}

describe("history contact POST boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); readAppBaseUrl.mockReturnValue(BASE); createServerSupabaseClient.mockResolvedValue(client); loadAccountContextWithClient.mockResolvedValue(account); });
  it("uses the same JWT-scoped client for a bounded request", async () => {
    const response = await POST(request({ action: "request", other_member_id: ID }));
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe(`${BASE}/historie?notice=contact-requested`);
    expect(loadAccountContextWithClient).toHaveBeenCalledWith(client); expect(requestContact).toHaveBeenCalledWith(ID);
  });
  it("accepts an incoming request without accepting browser-supplied identities", async () => {
    const response = await POST(request({ action: "accept", request_id: ID }));
    expect(respondContact).toHaveBeenCalledWith(ID, true); expect(response.headers.get("location")).toContain("contact-accepted");
    const forged = await POST(request({ action: "accept", request_id: ID, email: "attacker@example.test" }));
    expect(forged.headers.get("location")).toBe(`${BASE}/historie?error=invalid-request`);
  });
  it.each([null, "https://evil.example"])("rejects Origin %s before Auth", async (origin) => {
    expect((await POST(request({ action: "request", other_member_id: ID }, origin))).status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it("blocks sessions without membership capability", async () => {
    loadAccountContextWithClient.mockResolvedValueOnce({ capabilities: { canParticipate: false } });
    expect((await POST(request({ action: "request", other_member_id: ID }))).headers.get("location")).toBe(`${BASE}/historie?error=not-authorized`);
    expect(requestContact).not.toHaveBeenCalled();
  });
});
