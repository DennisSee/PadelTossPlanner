import type { PublicLiveCandidate } from "../../lib/public-schedule/types";
import { formatEventClock, formatEventDate } from "../../lib/tos/time";
import { ANONYMOUS_NAVIGATION, AppHeader, Card, SiteNavigation, SportBadge, type NavigationModel } from "../ui";
import styles from "./live-schedule.module.css";

export function LiveSelection({ candidates, navigation = ANONYMOUS_NAVIGATION, nowIso }: { candidates: readonly PublicLiveCandidate[]; navigation?: NavigationModel; nowIso: string }) {
  const now = Date.parse(nowIso);
  const current = candidates.some((event) => Date.parse(event.startsAt) <= now && now < Date.parse(event.endsAt));
  return <main className={styles.page}><div className={styles.shell}>
    <div className={styles.topbar}><AppHeader subtitle="Live TOS-schema" /><SiteNavigation model={navigation} currentPath="/live" /></div>
    <section className={styles.selection}><h1>{current ? "Kies een live TOS-moment" : "Kies een TOS-schema"}</h1>{!current ? <p>Er is nu geen TOS bezig.</p> : null}<p>Er zijn meerdere officiële schema’s voor hetzelfde moment.</p>
      <div className={styles.selectionGrid}>{candidates.map((event) => <Card className={styles.selectionCard} key={event.slug}>
        <SportBadge sport={event.sport} /><h2>{event.title}</h2>
        <p>{formatEventDate(event.startsAt)} · {formatEventClock(event.startsAt)}–{formatEventClock(event.endsAt)}</p>
        <a href={`/live/${event.slug}`}>Bekijk schema →</a>
      </Card>)}</div>
    </section>
  </div></main>;
}
