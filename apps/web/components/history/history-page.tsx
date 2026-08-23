import Link from "next/link";

import type { HistoryContactRequest, HistoryClubmate, HistoryEvent, SharedHistoryEvent } from "../../lib/history/types";
import type { HistoryFilters, HistorySummary } from "../../lib/history/filters";
import { ActionDialog, Badge, Card, SportBadge } from "../ui";

import styles from "./history-page.module.css";

const DATE = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TIME = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short" });
const DAY = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit" });
const MONTH = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", month: "short" });
const YEAR = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", year: "numeric" });

type ClubmateView = Readonly<{
  clubmate: HistoryClubmate;
  shared: readonly SharedHistoryEvent[];
  contact: HistoryContactRequest | null;
  email: string | null;
}>;

function ContactForm({ action, requestId, otherMemberId, label, secondary = false }: {
  action: "request" | "accept" | "decline" | "cancel" | "revoke";
  requestId?: string;
  otherMemberId?: string;
  label: string;
  secondary?: boolean;
}) {
  return (
    <form action="/api/history/contact" method="post">
      <input type="hidden" name="action" value={action} />
      {requestId ? <input type="hidden" name="request_id" value={requestId} /> : null}
      {otherMemberId ? <input type="hidden" name="other_member_id" value={otherMemberId} /> : null}
      <button className={secondary ? styles.secondaryButton : styles.primaryButton} type="submit">{label}</button>
    </form>
  );
}

function RoundCard({ round }: { round: HistoryEvent["rounds"][number] }) {
  const status = {
    rest: "Rust",
    not_arrived: "Nog niet aanwezig",
    unavailable: "Niet meer beschikbaar",
    playing: "Wedstrijd",
  }[round.state];
  return (
    <li className={styles.round}>
      <div className={styles.roundHead}>
        <strong>Ronde {round.roundNumber}</strong>
        <time>{TIME.format(new Date(round.startsAt))}–{TIME.format(new Date(round.endsAt))}</time>
      </div>
      {round.state === "playing" ? (
        <>
          <Badge tone="success">{round.courtName}</Badge>
          <p><span>Met</span> {round.partners.map((person) => person.displayName).join(" & ") || "—"}</p>
          <p><span>Tegen</span> {round.opponents.map((person) => person.displayName).join(" & ")}</p>
        </>
      ) : <p className={styles.nonPlaying}><Badge tone="neutral">{status}</Badge></p>}
    </li>
  );
}

function HistoryEventCard({ event }: { event: HistoryEvent }) {
  const startsAt = new Date(event.startsAt);
  return (
    <details className={styles.eventCard}>
      <summary>
        <time className={styles.dateRail} dateTime={event.startsAt}>
          <span>{WEEKDAY.format(startsAt).replace(".", "")}</span>
          <strong>{DAY.format(startsAt)}</strong>
          <span>{MONTH.format(startsAt).replace(".", "")}</span>
          <small>{YEAR.format(startsAt)}</small>
        </time>
        <div className={styles.eventSummaryCopy}>
          <SportBadge sport={event.sport} compact />
          <h3>{event.title}</h3>
          <p>{DATE.format(startsAt)} · {TIME.format(startsAt)}–{TIME.format(new Date(event.endsAt))}</p>
        </div>
        <div className={styles.eventCounts}>
          <strong>{event.matchCount}</strong><span>{event.matchCount === 1 ? "wedstrijd" : "wedstrijden"}</span>
          <strong>{event.restCount}</strong><span>rust</span>
        </div>
      </summary>
      <ol className={styles.rounds}>{event.rounds.map((round) => <RoundCard key={round.roundNumber} round={round} />)}</ol>
    </details>
  );
}

function ClubmateCard({ view }: { view: ClubmateView }) {
  const { clubmate, shared, contact, email } = view;
  const pendingIncoming = contact?.status === "pending" && contact.direction === "incoming";
  const contactLabel = email
    ? "Contact gedeeld"
    : pendingIncoming
      ? "Verzoek ontvangen"
      : contact?.status === "pending"
        ? "Verzoek verstuurd"
        : "Geen contact gedeeld";
  return (
    <Card className={styles.clubmateCard}>
      <div className={styles.clubmateInitials} aria-hidden="true">{clubmate.displayName.trim().slice(0, 2).toLocaleUpperCase("nl-NL")}</div>
      <div className={styles.clubmateCopy}>
        <h3>{clubmate.displayName}</h3>
        <p>{clubmate.sharedMatches} samen {clubmate.sharedMatches === 1 ? "gespeelde wedstrijd" : "gespeelde wedstrijden"} · {clubmate.sharedEvents} TOS-avonden</p>
        <p>Laatst samen {DATE.format(new Date(clubmate.lastSharedAt))}</p>
      </div>
      <ActionDialog
        triggerLabel="Bekijk gedeelde historie"
        title={clubmate.displayName}
        description="Jullie officiële gezamenlijke TOS-historie."
        triggerClassName={styles.clubmateTrigger}
      >
        <div className={styles.clubmateDetail}>
          <div className={styles.clubmateInitials} aria-hidden="true">{clubmate.displayName.trim().slice(0, 2).toLocaleUpperCase("nl-NL")}</div>
          <div>
            <strong>{clubmate.displayName}</strong>
            <p>Lid van T.C. Zuid TOS</p>
          </div>
          <Badge tone={email ? "success" : "neutral"}>{contactLabel}</Badge>
          <dl>
            <div><dt>Wedstrijden samen</dt><dd>{clubmate.sharedMatches}</dd></div>
            <div><dt>TOS-avonden samen</dt><dd>{clubmate.sharedEvents}</dd></div>
            <div><dt>Laatst samen</dt><dd>{DATE.format(new Date(clubmate.lastSharedAt))}</dd></div>
          </dl>
        </div>
        <div className={styles.sharedList}>
          {shared.map((event) => (
            <p key={event.eventId}><strong>{event.title}</strong><span>{DATE.format(new Date(event.startsAt))} · {event.sharedMatches} samen</span></p>
          ))}
        </div>
        <div className={styles.contactBox}>
          {email ? (
            <>
              <p><strong>Contact gedeeld met wederzijdse toestemming</strong></p>
              <a href={`mailto:${email}`}>{email}</a>
              {contact ? <ContactForm action="revoke" requestId={contact.requestId} label="Toestemming intrekken" secondary /> : null}
            </>
          ) : pendingIncoming && contact ? (
            <>
              <p><strong>{clubmate.displayName} wil contactgegevens uitwisselen.</strong></p>
              <div className={styles.contactActions}>
                <ContactForm action="accept" requestId={contact.requestId} label="Accepteren" />
                <ContactForm action="decline" requestId={contact.requestId} label="Afwijzen" secondary />
              </div>
            </>
          ) : contact?.status === "pending" ? (
            <>
              <p>Contactverzoek verstuurd. E-mailadressen blijven verborgen tot acceptatie.</p>
              <ContactForm action="cancel" requestId={contact.requestId} label="Verzoek intrekken" secondary />
            </>
          ) : (
            <>
              <p>Wil je contact houden? De ander moet eerst toestemming geven voordat e-mailadressen zichtbaar worden.</p>
              <ContactForm action="request" otherMemberId={clubmate.memberId} label="Contactverzoek sturen" />
            </>
          )}
        </div>
      </ActionDialog>
    </Card>
  );
}

export function HistoryPage({
  events,
  years,
  filters,
  summary,
  clubmates,
}: {
  events: readonly HistoryEvent[];
  years: readonly number[];
  filters: HistoryFilters;
  summary: HistorySummary;
  clubmates: readonly ClubmateView[];
}) {
  if (years.length === 0 && clubmates.length === 0) {
    return <Card className={styles.emptyHistory}>
      <h2>Nog geen TOS-historie</h2>
      <p>Je gespeelde TOS-avonden verschijnen hier nadat een officieel schema is gepubliceerd en de avond is afgelopen.</p>
      <Link href="/tos">Bekijk komende TOS-avonden</Link>
    </Card>;
  }
  return (
    <div className={styles.stack}>
      <nav className={styles.mobileTabs} aria-label="Historieonderdelen">
        <a href="#avonden">Avonden</a><a href="#clubgenoten">Clubgenoten</a>
      </nav>
      <section className={styles.stats} aria-label="Historiesamenvatting">
        <Card><strong>{summary.evenings}</strong><span>TOS-avonden</span></Card>
        <Card><strong>{summary.matches}</strong><span>Wedstrijden</span></Card>
        <Card><strong>{summary.clubmates}</strong><span>Clubgenoten</span></Card>
        <Card><strong>{summary.mostPlayed?.displayName ?? "—"}</strong><span>Meest mee/tegen gespeeld{summary.mostPlayed ? ` · ${summary.mostPlayed.matches}` : ""}</span></Card>
      </section>
      <form className={styles.filters} method="get">
        <label>Jaar<select name="year" defaultValue={filters.year ?? "all"}><option value="all">Alle jaren</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label>Sport<select name="sport" defaultValue={filters.sport ?? "all"}><option value="all">Alle sporten</option><option value="padel">Padel</option><option value="tennis">Tennis</option></select></label>
        <label>Clubgenoot<input name="q" type="search" maxLength={80} defaultValue={filters.query} placeholder="Zoek op naam" /></label>
        <button type="submit">Filteren</button>
      </form>
      <div className={styles.columns}>
        <section id="avonden" className={styles.section} aria-labelledby="history-events-title">
          <div className={styles.sectionHeading}><h2 id="history-events-title">Mijn TOS-avonden</h2><p>Alleen officiële, gepubliceerde en afgelopen schema’s.</p></div>
          {events.length ? <div className={styles.eventList}>{events.map((event) => <HistoryEventCard key={event.eventId} event={event} />)}</div> : <p className={styles.empty}>Nog geen officiële TOS-historie gevonden met deze filters.</p>}
        </section>
        <section id="clubgenoten" className={styles.section} aria-labelledby="clubmates-title">
          <div className={styles.sectionHeading}><h2 id="clubmates-title">Vaak mee gespeeld</h2><p>Alleen leden met wie je in een officieel schema speelde.</p></div>
          {clubmates.length ? <div className={styles.clubmateList}>{clubmates.map((view) => <ClubmateCard key={view.clubmate.memberId} view={view} />)}</div> : <p className={styles.empty}>Nog geen clubgenoten in je officiële historie.</p>}
        </section>
      </div>
    </div>
  );
}
