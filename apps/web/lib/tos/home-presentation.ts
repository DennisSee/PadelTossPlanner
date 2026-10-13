import type { HomeEventSelection } from "./home-event";
import { eventAllowsSelfService, eventDisplayTitle, formatEventClock, formatEventDate, TOS_TIME_ZONE } from "./time";
import type { TosEvent } from "./types";

type HomeAction = Readonly<{ href: string; label: string; status?: string }>;

export type HomePresentation = Readonly<{
  title: string;
  lead: string;
  cue: string | null;
  action: HomeAction;
  cardAction: HomeAction;
}>;

function eventCue(event: TosEvent): string {
  const weekday = new Intl.DateTimeFormat("nl-NL", {
    timeZone: TOS_TIME_ZONE,
    weekday: "long",
  }).format(new Date(event.startsAt));
  return `${weekday} · ${formatEventClock(event.startsAt)}`;
}

function eventAction(event: TosEvent, label: string, status?: string): HomeAction {
  return Object.freeze({ href: `/tos/${event.slug}`, label, ...(status ? { status } : {}) });
}

export function homePresentation(
  kind: HomeEventSelection["kind"] | null,
  event: TosEvent | null,
  options: Readonly<{
    now: Date;
    hasPublishedSchedule: boolean;
    hasRegistration: boolean;
  }>,
): HomePresentation {
  if (event?.status === "cancelled") {
    const action = eventAction(event, "Bekijk TOS");
    return Object.freeze({
      title: "Deze TOS is geannuleerd.",
      lead: "Bekijk de eventstatus en eventuele vervolginformatie.",
      cue: eventCue(event),
      action,
      cardAction: action,
    });
  }
  if (kind === "live-placed" && event && options.hasPublishedSchedule) {
    const cardAction = Object.freeze({ href: `/live/${event.slug}`, label: "Bekijk live schema" });
    return Object.freeze({
      title: "Jouw TOS. Live.",
      lead: "Bekijk de actuele wedstrijden, wie er rust heeft en op welke baan je volgende ronde speelt.",
      cue: "Nu bezig",
      action: Object.freeze({ ...cardAction, label: "Bekijk live TOS-schema" }),
      cardAction,
    });
  }
  if (kind === "future-placed" && event) {
    if (eventAllowsSelfService(event, options.now)) {
      return Object.freeze({
        title: "Je volgende TOS staat klaar.",
        lead: `Je bent geplaatst voor ${eventDisplayTitle(event)} op ${formatEventDate(event.startsAt)}.`,
        cue: eventCue(event),
        action: eventAction(event, "Mijn aanmelding"),
        cardAction: eventAction(event, "Mijn aanmelding"),
      });
    }
    if (options.hasPublishedSchedule) {
      const action = Object.freeze({ href: `/live/${event.slug}`, label: "Bekijk je schema" });
      return Object.freeze({
        title: "Je schema staat klaar.",
        lead: `Bekijk je wedstrijden voor ${eventDisplayTitle(event)}.`,
        cue: eventCue(event),
        action,
        cardAction: action,
      });
    }
    const action = eventAction(event, "Mijn aanmelding", "Schema volgt");
    return Object.freeze({
      title: "Je plaats staat vast.",
      lead: `De inschrijving voor ${eventDisplayTitle(event)} is gesloten. Het schema volgt.`,
      cue: eventCue(event),
      action,
      cardAction: action,
    });
  }
  if (kind === "live-placed" && event) {
    const action = eventAction(event, "Mijn aanmelding", "Schema volgt");
    return Object.freeze({
      title: "Je TOS is begonnen.",
      lead: "Er is nog geen gepubliceerd wedstrijdschema beschikbaar.",
      cue: "Nu bezig",
      action,
      cardAction: action,
    });
  }
  if (kind === "future-waitlist" && event) {
    const action = eventAction(event, "Mijn wachtlijstpositie");
    return Object.freeze({
      title: "Je staat op de wachtlijst.",
      lead: `Bekijk je actuele wachtlijststatus voor ${eventDisplayTitle(event)}.`,
      cue: eventCue(event),
      action,
      cardAction: action,
    });
  }
  if (kind === "open" && event) {
    const cardAction = eventAction(
      event,
      options.hasRegistration ? "Mijn aanmelding" : "Aanmelden",
    );
    return Object.freeze({
      title: "ZIN IN EEN TOS?",
      lead: "Bekijk alle open TOS-momenten en meld je eenvoudig aan.",
      cue: eventCue(event),
      action: Object.freeze({ href: "/tos", label: "BEKIJK TOS-MOMENTEN" }),
      cardAction,
    });
  }
  const action = Object.freeze({ href: "/tos", label: "BEKIJK TOS-MOMENTEN" });
  return Object.freeze({
    title: "ZIN IN EEN TOS?",
    lead: "Bekijk komende TOS-momenten en meld je aan wanneer het jou uitkomt.",
    cue: null,
    action,
    cardAction: action,
  });
}
