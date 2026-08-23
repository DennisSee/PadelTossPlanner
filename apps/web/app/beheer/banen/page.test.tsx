import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveAccountContext } from "../../../lib/auth/account-context";

const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const requirePlannerAccount = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const constructor = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("../../../lib/auth/route-guard", () => ({ requirePlannerAccount }));
vi.mock("../../../lib/tos/court-repository", () => ({ CourtRepository: class {
  constructor(client: unknown) { constructor(client); }
  list = list;
} }));

import CourtsPage from "./page";

const planner = deriveAccountContext(
  { userId: "user-planner", email: "planner@example.test" },
  { id: "user-planner", display_name: "Planner", role: "planner", active: true, member_id: null },
  null,
);

describe("staff court management page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClient.mockResolvedValue({ requestScoped: true });
    requirePlannerAccount.mockResolvedValue(planner);
    list.mockResolvedValue([
      { id: "c9000000-0000-4000-8000-000000000001", sport: "padel", name: "Kremer Baan", active: true, sortOrder: 10 },
      { id: "d9000000-0000-4000-8000-000000000001", sport: "tennis", name: "Tennisbaan Noord", active: false, sortOrder: 20 },
    ]);
  });

  it("gebruikt de request-scoped staffguard en toont beide sporten compact", async () => {
    render(await CourtsPage({ searchParams: Promise.resolve({}) }));
    const client = await createServerSupabaseClient.mock.results[0].value;
    expect(requirePlannerAccount).toHaveBeenCalledWith(client);
    expect(constructor).toHaveBeenCalledWith(client);
    expect(screen.getByRole("heading", { name: "Banenbeheer" })).toBeVisible();
    expect(screen.getByDisplayValue("Kremer Baan")).toBeVisible();
    expect(screen.getByDisplayValue("Tennisbaan Noord")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Opslaan" })).toHaveLength(2);
  });

  it("toont uitsluitend finite feedback en geen backenddetail", async () => {
    render(await CourtsPage({ searchParams: Promise.resolve({ error: "private database detail" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("De baan kon niet worden opgeslagen.");
    expect(document.body.textContent).not.toContain("private database detail");
  });

  it("filtert de compacte catalogus per sport zonder de staffread te verbreden", async () => {
    render(await CourtsPage({ searchParams: Promise.resolve({ sport: "tennis" }) }));
    expect(screen.getByRole("link", { name: "Tennis" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByDisplayValue("Tennisbaan Noord")).toBeVisible();
    expect(screen.queryByDisplayValue("Kremer Baan")).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledWith();
  });
});
