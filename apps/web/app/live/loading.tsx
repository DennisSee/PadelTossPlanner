import { AppHeader, Card } from "../../components/ui";
import styles from "../../components/live/live-schedule.module.css";

export default function Loading() {
  return (
    <main className={styles.loadingShell} aria-busy="true" aria-label="Live schema laden">
      <AppHeader subtitle="Live TOS-schema" />
      <Card className={styles.loadingBlock}>
        <span className="sr-only">Live schema laden…</span>
      </Card>
    </main>
  );
}
