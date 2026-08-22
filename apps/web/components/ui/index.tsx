import Image from "next/image";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

import styles from "./ui.module.css";

export { ActionDialog } from "./action-dialog";

export {
  ANONYMOUS_NAVIGATION,
  navigationModelFromAccount,
  SiteNavigation,
  type NavigationModel,
} from "./site-navigation";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className={styles.header}>
      <Link className={styles.brandLink} href="/" aria-label="Naar startpagina">
        <Image
          className={styles.logo}
          src="/tc-zuid-logo.png"
          width={52}
          height={52}
          alt="Logo T.C. Zuid"
          priority
        />
        <div className={styles.brandText}>
          <p className={styles.brandName}>T.C. Zuid TOS</p>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
      </Link>
    </header>
  );
}

export function CourtLines({ className = "" }: { className?: string }) {
  return (
    <span className={`${styles.courtLines} ${className}`.trim()} aria-hidden="true">
      <span />
    </span>
  );
}

export function EventDateRail({ startsAt, accent = "green" }: { startsAt: string; accent?: "green" | "yellow" }) {
  const date = new Date(startsAt);
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return (
    <time className={`${styles.dateRail} ${accent === "yellow" ? styles.dateRailYellow : ""}`} dateTime={startsAt}>
      <span>{value("weekday").replace(".", "")}</span>
      <strong>{value("day")}</strong>
      <span>{value("month").replace(".", "")}</span>
      <small>{value("year")}</small>
    </time>
  );
}

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`${styles.card} ${className}`.trim()} {...props}>{children}</section>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: styles.badgeNeutral,
    success: styles.badgeSuccess,
    warning: styles.badgeWarning,
    danger: styles.badgeDanger,
  }[tone];
  return <span className={`${styles.badge} ${toneClass}`}>{children}</span>;
}

export type Sport = "padel" | "tennis";

export function SportIcon({ sport }: { sport: Sport }) {
  return sport === "padel" ? (
    <svg className={styles.sportIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.9 3.2c3.2 2 3.9 6.5 1.5 10.3-2.3 3.8-6.8 5.2-10 3.2-3.2-2-3.9-6.5-1.5-10.3 2.3-3.8 6.8-5.2 10-3.2Z" />
      <path d="m8.2 16.9-2.5 4" />
      <circle cx="9.2" cy="7.2" r=".7" />
      <circle cx="12.2" cy="6.7" r=".7" />
      <circle cx="8.2" cy="10.2" r=".7" />
      <circle cx="11.2" cy="9.7" r=".7" />
      <circle cx="7.6" cy="13.3" r=".7" />
      <circle cx="10.5" cy="12.8" r=".7" />
    </svg>
  ) : (
    <svg className={styles.sportIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M5.9 6.1c3.8 2.4 5.4 6.4 4.4 11.7M18.1 17.9c-3.8-2.4-5.4-6.4-4.4-11.7" />
    </svg>
  );
}

export function SportBadge({ sport, compact = false }: { sport: Sport; compact?: boolean }) {
  return (
    <span
      className={`${styles.sportBadge} ${sport === "padel" ? styles.sportBadgePadel : styles.sportBadgeTennis} ${compact ? styles.sportBadgeCompact : ""}`.trim()}
      data-sport={sport}
    >
      <SportIcon sport={sport} />
      <span>{sport === "padel" ? "Padel" : "Tennis"}</span>
    </span>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.linkButton} href={href}>
      <span>{children}</span>
      <span className={styles.buttonArrow} aria-hidden="true">→</span>
    </Link>
  );
}

export function SecondaryLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.secondaryLinkButton} href={href}>
      <span>{children}</span>
      <span className={styles.buttonArrow} aria-hidden="true">→</span>
    </Link>
  );
}

export function StateMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className={styles.state}>
      <h2 className={styles.stateTitle}>{title}</h2>
      <div className={styles.stateText}>{children}</div>
    </Card>
  );
}
