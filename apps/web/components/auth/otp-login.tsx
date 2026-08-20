"use client";

import { useCallback, useEffect, useState } from "react";

import type { SafeReturnPath } from "../../lib/auth/return-path";
import { authErrorCategory, safeAuthMessage } from "../../lib/auth/safe-error";
import {
  createBrowserSupabaseClient,
  type BrowserSupabaseConfig,
} from "../../lib/supabase/browser";
import styles from "./otp-login.module.css";

const RESEND_SECONDS = 60;
const MAX_EMAIL_LENGTH = 254;
const MAX_OTP_LENGTH = 16;

export function normalizeOtpEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isPlausibleEmail(value: string): boolean {
  const normalized = normalizeOtpEmail(value);
  return (
    normalized.length >= 3 &&
    normalized.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
  );
}

export function maskEmail(value: string): string {
  const normalized = normalizeOtpEmail(value);
  const separator = normalized.lastIndexOf("@");
  if (separator < 1) return "je e-mailadres";
  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  return `${local[0]}${"•".repeat(Math.max(3, Math.min(6, local.length - 1)))}@${domain}`;
}

export function completionPath(next: SafeReturnPath): string {
  return `/auth/complete?next=${encodeURIComponent(next)}`;
}

export function OtpLogin({
  config,
  next,
  navigate = (path) => window.location.assign(path),
}: {
  config: BrowserSupabaseConfig;
  next: SafeReturnPath;
  navigate?: (path: string) => void;
}) {
  const [emailInput, setEmailInput] = useState("");
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const requestCode = useCallback(
    async (email: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const supabase = createBrowserSupabaseClient(config);
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) {
          setMessage(safeAuthMessage(authErrorCategory(error)));
          return false;
        }
        setRequestedEmail(email);
        setSecondsLeft(RESEND_SECONDS);
        return true;
      } catch (error) {
        setMessage(safeAuthMessage(authErrorCategory(error)));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [config],
  );

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeOtpEmail(emailInput);
    if (!isPlausibleEmail(normalized)) {
      setMessage("Vul een geldig e-mailadres in.");
      return;
    }
    await requestCode(normalized);
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestedEmail || !code || !/^\d{1,16}$/u.test(code)) {
      setMessage("Vul de numerieke inlogcode uit je e-mail in.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createBrowserSupabaseClient(config);
      const { error } = await supabase.auth.verifyOtp({
        email: requestedEmail,
        token: code,
        type: "email",
      });
      if (error) {
        setMessage(safeAuthMessage(authErrorCategory(error)));
        return;
      }
      navigate(completionPath(next));
    } catch (error) {
      setMessage(safeAuthMessage(authErrorCategory(error)));
    } finally {
      setBusy(false);
    }
  }

  if (!requestedEmail) {
    return (
      <form className={styles.form} onSubmit={submitEmail} noValidate>
        <label htmlFor="otp-email">E-mailadres</label>
        <input
          id="otp-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={MAX_EMAIL_LENGTH}
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          disabled={busy}
          required
        />
        {message ? <p className={styles.error} role="alert">{message}</p> : null}
        <button className={styles.primaryButton} disabled={busy} type="submit">
          {busy ? "Code aanvragen…" : "Stuur mij een inlogcode"}
        </button>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={submitCode} noValidate>
      <div className={styles.sentMessage} aria-live="polite">
        <strong>Controleer je e-mail</strong>
        <span>We hebben een inlogcode gestuurd naar {maskEmail(requestedEmail)}.</span>
      </div>
      <label htmlFor="otp-code">Inlogcode</label>
      <input
        id="otp-code"
        name="code"
        type="text"
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={MAX_OTP_LENGTH}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/gu, ""))}
        disabled={busy}
        required
      />
      {message ? <p className={styles.error} role="alert">{message}</p> : null}
      <button className={styles.primaryButton} disabled={busy} type="submit">
        {busy ? "Inloggen…" : "Inloggen"}
      </button>
      <div className={styles.secondaryActions}>
        <button
          type="button"
          onClick={() => {
            setRequestedEmail(null);
            setCode("");
            setSecondsLeft(0);
            setMessage(null);
          }}
          disabled={busy}
        >
          Ander e-mailadres gebruiken
        </button>
        {secondsLeft > 0 ? (
          <span>Nieuwe code sturen over 00:{String(secondsLeft).padStart(2, "0")}</span>
        ) : (
          <button type="button" disabled={busy} onClick={() => void requestCode(requestedEmail)}>
            Nieuwe code sturen
          </button>
        )}
      </div>
    </form>
  );
}
