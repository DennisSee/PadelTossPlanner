import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./ui.module.css";

export {
  ANONYMOUS_NAVIGATION,
  navigationModelFromAccount,
  SiteNavigation,
  type NavigationModel,
} from "./site-navigation";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className={styles.header}>
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
    </header>
  );
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`.trim()}>{children}</section>;
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

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.linkButton} href={href}>
      {children}
    </Link>
  );
}

export function SecondaryLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.secondaryLinkButton} href={href}>
      {children}
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
