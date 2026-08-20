"use client";

import { useEffect, useRef, useState } from "react";

import {
  GOOGLE_AUTH_ERROR_MESSAGE,
  isSameOriginOAuthCallback,
} from "../../lib/auth/oauth";
import type { SafeReturnPath } from "../../lib/auth/return-path";
import {
  createBrowserSupabaseClient,
  type BrowserSupabaseConfig,
} from "../../lib/supabase/browser";
import { OtpLogin } from "./otp-login";

import styles from "./auth-login.module.css";

function GoogleMark() {
  return (
    <svg
      className={styles.googleMark}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
      <path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.3L6.5 14Z" />
      <path fill="#ea4335" d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z" />
    </svg>
  );
}

export function AuthLogin({
  config,
  callbackUrl,
  next,
  initialOAuthError = false,
}: {
  config: BrowserSupabaseConfig;
  callbackUrl: string;
  next: SafeReturnPath;
  initialOAuthError?: boolean;
}) {
  const [oauthBusy, setOAuthBusy] = useState(false);
  const [oauthMessage, setOAuthMessage] = useState(
    initialOAuthError ? GOOGLE_AUTH_ERROR_MESSAGE : null,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (oauthMessage) errorRef.current?.focus();
  }, [oauthMessage]);

  async function startGoogleLogin() {
    if (oauthBusy) return;
    setOAuthMessage(null);
    setOAuthBusy(true);
    try {
      if (!isSameOriginOAuthCallback(callbackUrl, window.location.origin)) {
        setOAuthMessage(GOOGLE_AUTH_ERROR_MESSAGE);
        setOAuthBusy(false);
        return;
      }
      const supabase = createBrowserSupabaseClient(config);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl },
      });
      if (error) {
        setOAuthMessage(GOOGLE_AUTH_ERROR_MESSAGE);
        setOAuthBusy(false);
      }
    } catch {
      setOAuthMessage(GOOGLE_AUTH_ERROR_MESSAGE);
      setOAuthBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <button
        className={styles.googleButton}
        type="button"
        disabled={oauthBusy}
        aria-busy={oauthBusy}
        onClick={() => void startGoogleLogin()}
      >
        <GoogleMark />
        <span>{oauthBusy ? "Google openen…" : "Doorgaan met Google"}</span>
      </button>
      {oauthMessage ? (
        <p
          className={styles.oauthError}
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {oauthMessage}
        </p>
      ) : null}
      <div className={styles.divider} role="separator" aria-label="of">
        <span>of</span>
      </div>
      <OtpLogin config={config} next={next} disabled={oauthBusy} />
    </div>
  );
}
