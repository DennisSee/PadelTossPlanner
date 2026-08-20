import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("../../lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({ auth }),
}));

import { GOOGLE_AUTH_ERROR_MESSAGE } from "../../lib/auth/oauth";
import { AuthLogin } from "./auth-login";

const config = {
  url: "https://fixture.supabase.co",
  publishableKey: "sb_publishable_fixture_only",
};

function renderLogin(properties: Partial<ComponentProps<typeof AuthLogin>> = {}) {
  const callbackUrl = `${window.location.origin}/auth/callback?next=%2Ftos`;
  return render(
    <AuthLogin
      config={config}
      callbackUrl={callbackUrl}
      next="/tos"
      {...properties}
    />,
  );
}

describe("shared Google and e-mail Auth entry", () => {
  beforeEach(() => {
    auth.signInWithOAuth.mockReset();
    auth.signInWithOtp.mockReset();
    auth.verifyOtp.mockReset();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: "https://accounts.google.test" },
      error: null,
    });
  });

  it("shows Google first, an accessible divider and the complete OTP fallback", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "Doorgaan met Google" })).toBeVisible();
    expect(screen.getByRole("separator", { name: "of" })).toBeVisible();
    expect(screen.getByLabelText("E-mailadres")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stuur mij een inlogcode" })).toBeVisible();
    expect(screen.queryByText(/Apple|One Tap|passkey/iu)).not.toBeInTheDocument();
  });

  it("starts exactly the generic Supabase Google flow with the server callback", async () => {
    const callbackUrl = `${window.location.origin}/auth/callback?next=%2Faccount`;
    renderLogin({ callbackUrl, next: "/account" });
    await userEvent.click(screen.getByRole("button", { name: "Doorgaan met Google" }));
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    const request = auth.signInWithOAuth.mock.calls[0]?.[0];
    expect(request.options).not.toHaveProperty("scopes");
    expect(request.options).not.toHaveProperty("queryParams");
  });

  it("blocks repeat clicks while the provider navigation is pending", async () => {
    auth.signInWithOAuth.mockReturnValue(new Promise(() => undefined));
    renderLogin();
    const button = screen.getByRole("button", { name: "Doorgaan met Google" });
    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Google openen…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Google openen…" }));
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it("fails safely for a mismatched callback without contacting Supabase", async () => {
    renderLogin({
      callbackUrl: "https://evil.example/auth/callback?next=%2Ftos",
    });
    await userEvent.click(screen.getByRole("button", { name: "Doorgaan met Google" }));
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(GOOGLE_AUTH_ERROR_MESSAGE);
    expect(screen.getByLabelText("E-mailadres")).toBeEnabled();
  });

  it("shows only the safe provider message for SDK errors and keeps OTP usable", async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: "google", url: null },
      error: { message: "raw provider secret detail", status: 400 },
    });
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Doorgaan met Google" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(GOOGLE_AUTH_ERROR_MESSAGE);
    expect(alert).toHaveFocus();
    expect(document.body.textContent).not.toContain("raw provider secret detail");
    expect(screen.getByLabelText("E-mailadres")).toBeEnabled();
  });

  it("renders callback cancellation as the same limited safe error", () => {
    renderLogin({ initialOAuthError: true });
    expect(screen.getByRole("alert")).toHaveTextContent(GOOGLE_AUTH_ERROR_MESSAGE);
  });
});
