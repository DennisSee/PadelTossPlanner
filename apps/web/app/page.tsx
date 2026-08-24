import Link from "next/link";

import {
  Badge,
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
import { readAppEnvironment } from "../lib/config/public-supabase";
import { createServerSupabaseClient } from "../lib/supabase/server";
import { selectHomeEvent, type HomeEventSelection } from "../lib/tos/home-event";
import { homeHeroPresentation } from "../lib/tos/home-presentation";
import { TosRepository } from "../lib/tos/repository";

import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isStaging = readAppEnvironment() === "staging";
  let account = null;
  let homeSnapshot: Parameters<typeof TosEventCard>[0] | null = null;
  let homeKind: HomeEventSelection["kind"] | null = null;
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
      const now = new Date();
      const [events, registrations] = await Promise.all([
        repository.listParticipantEvents(now),
        repository.listOwnUpcomingRegistrations(account.identity.userId, now),
      ]);
      const positionEntries = await Promise.all(registrations
        .filter((registration) => registration.response === "attending")
        .map(async (registration) => [registration.eventId, await repository.ownRegistrationPosition(registration.eventId)] as const));
      const selected = selectHomeEvent(events, registrations, new Map(positionEntries), now);
      participantHomeResolved = true;
      if (selected) {
        const [capacity, attendance] = await Promise.all([
          repository.eventCapacity(selected.event.id),
          repository.eventAttendance(selected.event.id),
        ]);
        homeKind = selected.kind;
        homeSnapshot = {
          event: selected.event,
          registration: selected.registration,
          capacity,
          attendance,
          registrationPosition: selected.position,
          compact: true,
          now,
        };
      }
    } catch {
      homeSnapshot = null;
      homeKind = null;
    }
  }
  const navigation = navigationModelFromAccount(account);
  const hero = homeHeroPresentation(homeKind, homeSnapshot?.event ?? null);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <AppHeader subtitle="Padelavonden voor iedereen" />
          <SiteNavigation model={navigation} currentPath="/" />
          {isStaging ? <Badge tone="warning">Staging</Badge> : null}
        </div>

        <div className={styles.hero}>
          <Card className={styles.intro}>
            <CourtLines className={styles.heroLines} />
            <div className={styles.introContent}>
              <p className={styles.eyebrow}>Samen spelen, iedere ronde anders</p>
              <h1 className={styles.title}>{hero.title}</h1>
              {hero.cue ? <p className={styles.heroCue}>{hero.cue}</p> : null}
              <p className={styles.lead}>{hero.lead}</p>
              <LinkButton href={hero.action.href}>{hero.action.label}</LinkButton>
            </div>
          </Card>

          {!homeSnapshot && !participantHomeResolved ? <Card className={styles.side}>
            <div className={styles.ticketIcon} aria-hidden="true">⌗</div>
            <div className={styles.ticketCopy}>
              {account ? (
                <>
                <h2 className={styles.sideTitle}>Bekijk je TOS-avonden</h2>
                <p className={styles.sideText}>
                  Bekijk je komende en open TOS-avonden.
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
                <SecondaryLinkButton href="/tos">Naar TOS-avonden</SecondaryLinkButton>
              ) : (
                <SecondaryLinkButton href="/login?next=%2Ftos">
                  Inloggen / aanmelden
                </SecondaryLinkButton>
              )}
            </div>
            <div className={styles.barcode} aria-hidden="true" />
          </Card> : null}
        </div>
        {homeSnapshot ? (
          <section className={styles.nextTos} aria-labelledby="next-tos-heading">
            <div className={styles.nextTosHeading}>
              <h2 id="next-tos-heading">{homeKind === "live-placed" ? "Jouw TOS is live" : "Jouw volgende TOS"}</h2>
              <Link href="/tos">Alle TOS-avonden <span aria-hidden="true">→</span></Link>
            </div>
            <TosEventCard
              {...homeSnapshot}
              actionOverride={homeKind === "live-placed"
                ? { href: `/live/${homeSnapshot.event.slug}`, label: "Bekijk live schema" }
                : homeKind === "future-waitlist"
                  ? { href: `/tos/${homeSnapshot.event.slug}`, label: "Wachtlijst bekijken" }
                  : homeKind === "open" && !homeSnapshot.registration
                    ? { href: `/tos/${homeSnapshot.event.slug}`, label: "Aanmelden" }
                    : { href: `/tos/${homeSnapshot.event.slug}`, label: "Aanmelding wijzigen" }}
            />
          </section>
        ) : participantHomeResolved ? (
          <section className={styles.nextTos} aria-labelledby="next-tos-heading">
            <Card className={styles.emptyTos}>
              <div>
                <h2 id="next-tos-heading">Geen aankomende TOS-avonden</h2>
                <p>Er staat momenteel geen open of geplande TOS voor je klaar.</p>
              </div>
              <SecondaryLinkButton href="/tos">Bekijk alle TOS-avonden</SecondaryLinkButton>
            </Card>
          </section>
        ) : null}
      </div>
    </main>
  );
}
