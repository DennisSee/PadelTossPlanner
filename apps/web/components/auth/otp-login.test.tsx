import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("../../lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({ auth }),
}));

import {
  completionPath,
  isPlausibleEmail,
  maskEmail,
  normalizeOtpEmail,
  OtpLogin,
} from "./otp-login";

const config = { url: "https://test.example.test", publishableKey: "sb_publishable_test" };

async function requestCode(email = " Member@Example.Test ") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("E-mailadres"), email);
  await user.click(screen.getByRole("button", { name: "Stuur mij een inlogcode" }));
  return user;
}

describe("e-mail OTP login", () => {
  beforeEach(() => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.verifyOtp.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes, validates and safely masks e-mail addresses", () => {
    expect(normalizeOtpEmail(" Member@Example.Test ")).toBe("member@example.test");
    expect(isPlausibleEmail("member@example.test")).toBe(true);
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(maskEmail("d@example.nl")).toBe("d•••@example.nl");
    expect(maskEmail("dennis@example.nl")).toMatch(/^d•+@example\.nl$/u);
  });

  it("requests one generic signup-or-login code with normalized email", async () => {
    render(<OtpLogin config={config} next="/tos" />);
    await requestCode();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "member@example.test",
      options: { shouldCreateUser: true },
    });
    expect(screen.getByText(/we hebben een inlogcode gestuurd/i)).toHaveTextContent(
      /^We hebben een inlogcode gestuurd naar m•+@example\.test\.$/u,
    );
    expect(document.body.textContent).not.toMatch(/bestaand account|nieuw account/i);
  });

  it("rejects an implausible email before contacting Supabase", async () => {
    render(<OtpLogin config={config} next="/tos" />);
    await requestCode("geen-geldig-adres");
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/geldig e-mailadres/i);
  });

  it("keeps leading zeroes and accepts 6, 8 and other numeric lengths", async () => {
    for (const token of ["012345", "00123456", "1234567890"]) {
      auth.signInWithOtp.mockClear();
      auth.verifyOtp.mockClear();
      const navigate = vi.fn();
      const view = render(<OtpLogin config={config} next="/account" navigate={navigate} />);
      await requestCode("member@example.test");
      await userEvent.type(screen.getByLabelText("Inlogcode"), token);
      await userEvent.click(screen.getByRole("button", { name: "Inloggen" }));
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        email: "member@example.test",
        token,
        type: "email",
      });
      expect(navigate).toHaveBeenCalledWith("/auth/complete?next=%2Faccount");
      view.unmount();
    }
  });

  it("filters nonnumeric input and rejects an empty code locally", async () => {
    render(<OtpLogin config={config} next="/tos" />);
    await requestCode("member@example.test");
    fireEvent.change(screen.getByLabelText("Inlogcode"), { target: { value: "12ab34" } });
    expect(screen.getByLabelText("Inlogcode")).toHaveValue("1234");
    fireEvent.change(screen.getByLabelText("Inlogcode"), { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: "Inloggen" }));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/numerieke inlogcode/i);
  });

  it("translates rate-limit, invalid-token and network errors without raw details", async () => {
    auth.signInWithOtp.mockResolvedValueOnce({ error: { status: 429, message: "secret detail" } });
    render(<OtpLogin config={config} next="/tos" />);
    await requestCode("member@example.test");
    expect(screen.getByRole("alert")).toHaveTextContent(/over een minuut/i);
    expect(document.body.textContent).not.toContain("secret detail");
  });

  it("handles a network exception without exposing its raw detail", async () => {
    auth.signInWithOtp.mockRejectedValueOnce(new TypeError("fetch failed with private detail"));
    render(<OtpLogin config={config} next="/tos" />);
    await requestCode("member@example.test");
    expect(screen.getByRole("alert")).toHaveTextContent(/tijdelijk niet gelukt/i);
    expect(document.body.textContent).not.toContain("private detail");
  });

  it("shows a safe invalid or expired code error and stays on the form", async () => {
    auth.verifyOtp.mockResolvedValueOnce({ error: { code: "otp_expired", message: "raw token detail" } });
    const navigate = vi.fn();
    render(<OtpLogin config={config} next="/tos" navigate={navigate} />);
    await requestCode("member@example.test");
    await userEvent.type(screen.getByLabelText("Inlogcode"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Inloggen" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/ongeldig of verlopen/i);
    expect(document.body.textContent).not.toContain("raw token detail");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("uses one cleaned-up 60 second resend countdown", async () => {
    vi.useFakeTimers();
    render(<OtpLogin config={config} next="/tos" />);
    fireEvent.change(screen.getByLabelText("E-mailadres"), { target: { value: "member@example.test" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Stuur mij een inlogcode" }).closest("form")!);
    });
    expect(screen.getByText(/00:60/)).toBeInTheDocument();
    for (let second = 0; second < 60; second += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(screen.getByRole("button", { name: "Nieuwe code sturen" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nieuwe code sturen" }));
    });
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(2);
  });

  it("cleans the active resend timer up on unmount", async () => {
    vi.useFakeTimers();
    const view = render(<OtpLogin config={config} next="/tos" />);
    fireEvent.change(screen.getByLabelText("E-mailadres"), {
      target: { value: "member@example.test" },
    });
    await act(async () => {
      fireEvent.submit(
        screen.getByRole("button", { name: "Stuur mij een inlogcode" }).closest("form")!,
      );
    });
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a completion URL without OTP or token data", () => {
    expect(completionPath("/beheer")).toBe("/auth/complete?next=%2Fbeheer");
    expect(completionPath("/beheer")).not.toMatch(/otp|token|code=/i);
  });
});
