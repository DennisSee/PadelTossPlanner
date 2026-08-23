import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { CourtDataError, CourtRepository } from "./court-repository";

describe("request-scoped court repository", () => {
  it("gebruikt uitsluitend smalle staff-RPCs en parseert de veilige projectie", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ id: "c9000000-0000-4000-8000-000000000001", sport: "padel", name: "Kremer Baan", active: true, sort_order: 10 }], error: null })
      .mockResolvedValueOnce({ data: "d9000000-0000-4000-8000-000000000001", error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const repository = new CourtRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.list("padel")).resolves.toEqual([{ id: "c9000000-0000-4000-8000-000000000001", sport: "padel", name: "Kremer Baan", active: true, sortOrder: 10 }]);
    await expect(repository.create({ sport: "tennis", name: "Tennisbaan", active: true, sortOrder: 20 })).resolves.toBe("d9000000-0000-4000-8000-000000000001");
    await expect(repository.update({ courtId: "d9000000-0000-4000-8000-000000000001", name: "Tennisbaan Noord", active: false, sortOrder: 25 })).resolves.toBeUndefined();
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(["staff_courts", "staff_create_court", "staff_update_court"]);
  });

  it("faalt gesloten bij extra/private velden en backenderrors", async () => {
    const privateRpc = vi.fn().mockResolvedValue({ data: [{ id: "c9000000-0000-4000-8000-000000000001", sport: "padel", name: "Kremer", active: true, sort_order: 10, created_by: "private" }], error: null });
    await expect(new CourtRepository({ rpc: privateRpc } as unknown as SupabaseClient).list()).rejects.toBeInstanceOf(CourtDataError);
    const errorRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "private database detail" } });
    await expect(new CourtRepository({ rpc: errorRpc } as unknown as SupabaseClient).list()).rejects.toEqual(new CourtDataError());
  });
});
