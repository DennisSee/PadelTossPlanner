import type { HomeEventSelection } from "./home-event";
import { eventDisplayTitle, formatEventClock, formatEventDate, TOS_TIME_ZONE } from "./time";
import type { TosEvent } from "./types";

export type HomeHeroPresentation = Readonly<{
  title: string;
  lead: string;
  cue: string | null;
  action: Readonly<{ href: string; label: string }>;
}>;

function eventCue(event: TosEvent): string {
  const weekday = new Intl.DateTimeFormat("nl-NL", {
    timeZone: TOS_TIME_ZONE,
    weekday: "long",
  }).format(new Date(event.startsAt));
  return `${weekday} · ${formatEventClock(event.startsAt)}`;
}

export function homeHeroPresentation(
  kind: HomeEventSelection["kind"] | null,
  event: TosEvent | null,
): HomeHeroPresentation {
  if (kind === "live-placed" && event) {
    return Object.freeze({
      title: "Jouw TOS-avond. Live.",
      lead: "Bekijk de actuele wedstrijden, wie er rust heeft en op welke baan je volgende ronde speelt.",
      cue: "Nu bezig",
      action: Object.freeze({ href: `/live/${event.slug}`, label: "Bekijk live TOS-schema" }),
    });
  }
  if (kind === "future-placed" && event) {
    return Object.freeze({
      title: "Je volgende TOS staat klaar.",
      lead: `Je bent geplaatst voor ${eventDisplayTitle(event)} op ${formatEventDate(event.startsAt)}.`,
      cue: eventCue(event),
      action: Object.freeze({ href: `/tos/${event.slug}`, label: "Bekijk je aanmelding" }),
    });
  }
  if (kind === "future-waitlist" && event) {
    return Object.freeze({
      title: "Je staat op de wachtlijst.",
      lead: `Bekijk je actuele wachtlijststatus voor ${eventDisplayTitle(event)}.`,
      cue: eventCue(event),
      action: Object.freeze({ href: `/tos/${event.slug}`, label: "Bekijk je wachtlijst" }),
    });
  }
  if (kind === "open" && event) {
    return Object.freeze({
      title: "Zin in een TOS-avond?",
      lead: "Bekijk de eerstvolgende open TOS en meld je eenvoudig aan.",
      cue: eventCue(event),
      action: Object.freeze({ href: "/tos", label: "Bekijk TOS-avonden" }),
    });
  }
  return Object.freeze({
    title: "Samen spelen. Iedere ronde anders.",
    lead: "Bekijk komende TOS-avonden en meld je aan wanneer het jou uitkomt.",
    cue: null,
    action: Object.freeze({ href: "/tos", label: "Bekijk TOS-avonden" }),
  });
}
