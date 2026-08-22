"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./tos-event-management.module.css";

const WIDE_QUERY = "(min-width: 70.01rem)";

export function ResponsiveCreatePanel({ children }: { children: ReactNode }) {
  const disclosure = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function" || !disclosure.current) {
      return;
    }
    const media = window.matchMedia(WIDE_QUERY);
    const sync = () => {
      if (disclosure.current) disclosure.current.open = media.matches;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <details
      ref={disclosure}
      className={styles.createDisclosure}
    >
      <summary>Nieuwe TOS <span aria-hidden="true">⌄</span></summary>
      <div className={styles.createDisclosureBody}>{children}</div>
    </details>
  );
}
