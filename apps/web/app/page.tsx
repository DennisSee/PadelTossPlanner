import Link from "next/link";

import {
  AppHeader,
  Card,
  CourtLines,
  LinkButton,
  navigationModelFromAccount,
  SecondaryLinkButton,
  SiteNavigation,
} from "../components/ui";
import { TosEventCard } from "../components/tos/event-card";
import { loadAccountContextWithClient } from "../lib/auth/session";
import { loadEventPublicSchedule } from "../lib/supabase/public-schedule-repository";
import { createServerSupabaseClient } from "../lib/supabase/server";
import { homeOverviewEvents, selectHomeEvent, type HomeEventSelection } from "../lib/tos/home-event";
import { homePresentation } from "../lib/tos/home-presentation";
import { TosRepository } from "../lib/tos/repository";
import { eventAllowsSelfService } from "../lib/tos/time";

import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  let account = null;
  let homeSnapshot: Parameters<typeof TosEventCard>[0] | null = null;
  let homeSnapshots: Parameters<typeof TosEventCard>[0][] = [];
  let homeKind: HomeEventSelection["kind"] | null = null;
  let homeHasPublishedSchedule = false;
  const publishedByEvent = new Map<string, boolean>();
  let participantHomeResolved = false;
  let client: Awaited<ReturnType<typeof createServerSupabaseClient>> | null = null;
  try {
    client = await createServerSupabaseClient();
    account = await loadAccountContextWithClient(client);
  } catch {
    account = null;
  }
  if (account?.capabilities.canParticipate && client) {
    try {
      const repository = new TosRepository(client);
      const [events, registrations] = await Promise.all([
        repository.listParticipantEvents(now),
        repository.listOwnUpcomingRegistrations(account.identity.userId, now),
      ]);
      const positionEntries = await Promise.all(registrations
        .filter((registration) => registration.response === "attending")
        .map(async (registration) => [registration.eventId, await repository.ownRegistrationPosition(registration.eventId)] as const));
      const positions = new Map(positionEntries);
      const selected = selectHomeEvent(events, registrations, positions, now);
      homeSnapshots = await Promise.all(homeOverviewEvents(events, selected, now, registrations, positions).map(async (event) => {
        const [capacity, attendanceResult] = await Promise.all([
          repository.eventCapacity(event.id),
          repository.eventAttendance(event.id).then(
            (attendance) => ({ attendance, unavailable: false }),
            () => ({ attendance: [], unavailable: true }),
          ),
        ]);
        const registration = registrations.find((registration) => registration.eventId === event.id);
        const position = positions.get(event.id) ?? null;
        const placed = registration?.response === "attending" && position?.placementStatus === "placed";
        let published = false;
        if (placed && (!eventAllowsSelfService(event, now) || new Date(event.startsAt) <= now)) {
          try { published = Boolean(await loadEventPublicSchedule(event.slug)); } catch { published = false; }
        }
        publishedByEvent.set(event.id, published);
        const personalPresentation = placed ? homePresentation(new Date(event.startsAt) <= now ? "live-placed" : "future-placed", event, {
          now, hasPublishedSchedule: published, hasRegistration: true,
        }) : null;
        return {
          event,
          registration,
          capacity,
          attendance: attendanceResult.attendance,
          socialDataUnavailable: attendanceResult.unavailable,
          registrationPosition: position,
          homeView: true,
          actionOverride: placed ? eventAllowsSelfService(event, now)
            ? { href: "/tos/" + event.slug, label: "Mijn aanmelding bekijken" }
            : personalPresentation?.cardAction : undefined,
          compact: true,
          now,
        };
      }));
      participantHomeResolved = true;
      if (selected) {
        homeKind = selected.kind;
        homeHasPublishedSchedule = publishedByEvent.get(selected.event.id) ?? false;
        homeSnapshot = homeSnapshots.find((snapshot) => snapshot.event.id === selected.event.id) ?? null;
      }
    } catch {
      homeSnapshot = null;
      homeSnapshots = [];
      homeKind = null;
    }
  }
  const navigation = navigationModelFromAccount(account);
  const presentation = homePresentation(homeKind, homeSnapshot?.event ?? null, {
    now,
    hasPublishedSchedule: homeHasPublishedSchedule,
    hasRegistration: Boolean(homeSnapshot?.registration),
  });
  const personalSnapshots = homeSnapshots.filter((snapshot) => snapshot.registration?.response === "attending" && snapshot.registrationPosition?.placementStatus === "placed");
  const openSnapshots = homeSnapshots.filter((snapshot) =>
    !personalSnapshots.includes(snapshot) && eventAllowsSelfService(snapshot.event, now) && new Date(snapshot.event.endsAt) > now,
  );
  const separatePersonalSnapshot = homeSnapshot && !personalSnapshots.includes(homeSnapshot) && !openSnapshots.some((snapshot) => snapshot.event.id === homeSnapshot.event.id)
    ? homeSnapshot : null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Tennis en padel voor iedereen" />
          <SiteNavigation model={navigation} currentPath="/" />
        </div>

        <div className={styles.hero}>
          <Card className={styles.intro}>
            <CourtLines className={styles.heroLines} />
            <div className={styles.introContent}>
              <p className={styles.eyebrow}>Samen spelen, iedere ronde anders</p>
              <h1 className={styles.title}>{presentation.title}</h1>
              {presentation.cue ? <p className={styles.heroCue}>{presentation.cue}</p> : null}
              <p className={styles.lead}>{presentation.lead}</p>
              <LinkButton href={personalSnapshots.length > 1 && homeKind !== "live-placed" ? "#home-enrollments" : presentation.action.href}>
                {personalSnapshots.length > 1 && homeKind !== "live-placed" ? "Bekijk je inschrijvingen" : presentation.action.label}
              </LinkButton>
            </div>
          </Card>

          {!homeSnapshot && !participantHomeResolved ? <Card className={styles.side}>
            <div className={styles.ticketIcon} aria-hidden="true">⌗</div>
            <div className={styles.ticketCopy}>
              {account ? (
                <>
                <h2 className={styles.sideTitle}>Bekijk je TOS-momenten</h2>
                <p className={styles.sideText}>
                  Bekijk je komende en open TOS-momenten.
                </p>
                </>
              ) : (
                <>
                <h2 className={styles.sideTitle}>Doe mee met de volgende TOS</h2>
                <p className={styles.sideText}>
                  Log in met Google of een e-mailcode en bekijk je account en TOS-status.
                </p>
                </>
              )}
            </div>
            <div className={styles.ticketAction}>
              {account ? (
                <SecondaryLinkButton href="/tos">Naar TOS-momenten</SecondaryLinkButton>
              ) : (
                <SecondaryLinkButton href="/login?next=%2Ftos">
                  Inloggen / aanmelden
                </SecondaryLinkButton>
              )}
            </div>
            <div className={styles.barcode} aria-hidden="true" />
          </Card> : null}
        </div>
        {personalSnapshots.length ? (
          <section id="home-enrollments" className={styles.nextTos} aria-labelledby="enrollments-heading">
            <div className={styles.enrollmentHeading}>
              <span className={styles.enrollmentCheck} aria-hidden="true">✓</span>
              <div><h2 id="enrollments-heading">{personalSnapshots.length === 1 ? "Jouw inschrijving" : "Jouw inschrijvingen"}</h2>
                <p>Je bent geplaatst. Veel speelplezier!</p></div>
            </div>
            {personalSnapshots.map((snapshot) => <TosEventCard key={snapshot.event.id} {...snapshot} />)}
          </section>
        ) : null}
        {separatePersonalSnapshot ? (
          <section className={styles.nextTos} aria-labelledby="personal-tos-heading">
            <div className={styles.nextTosHeading}>
              <h2 id="personal-tos-heading">{homeKind === "live-placed" ? "Jouw TOS is live" : "Jouw volgende TOS"}</h2>
            </div>
            <TosEventCard {...separatePersonalSnapshot} actionOverride={presentation.cardAction} />
          </section>
        ) : null}
        {openSnapshots.length ? (
          <section className={styles.nextTos} aria-labelledby="open-tos-heading">
            <div className={styles.nextTosHeading}>
              <h2 id="open-tos-heading">{personalSnapshots.length ? "Andere open TOS-momenten" : "Open TOS-momenten"}</h2>
              <Link href="/tos">Alle TOS-momenten <span aria-hidden="true">→</span></Link>
            </div>
            {openSnapshots.map((snapshot) => (
              <TosEventCard
                key={snapshot.event.id}
                {...snapshot}
                actionOverride={snapshot.event.id === homeSnapshot?.event.id && homeKind !== "open"
                  ? presentation.cardAction : undefined}
              />
            ))}
          </section>
        ) : participantHomeResolved && !separatePersonalSnapshot && !personalSnapshots.length ? (
          <section className={styles.nextTos} aria-labelledby="next-tos-heading">
            <Card className={styles.emptyTos}>
              <div>
                <h2 id="next-tos-heading">Geen aankomende TOS-momenten</h2>
                <p>Er staat momenteel geen open of geplande TOS voor je klaar.</p>
              </div>
              <SecondaryLinkButton href="/tos">Bekijk alle TOS-momenten</SecondaryLinkButton>
            </Card>
          </section>
        ) : null}
      </div>
    </main>
  );
}
