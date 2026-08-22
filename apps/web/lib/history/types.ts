export type HistorySport = "padel" | "tennis";
export type HistoryRoundState = "playing" | "rest" | "not_arrived" | "unavailable";

export type HistoryPerson = Readonly<{
  memberId: string | null;
  displayName: string;
}>;

export type HistoryRound = Readonly<{
  roundNumber: number;
  startsAt: string;
  endsAt: string;
  state: HistoryRoundState;
  courtName: string | null;
  partners: readonly HistoryPerson[];
  opponents: readonly HistoryPerson[];
}>;

export type HistoryEvent = Readonly<{
  eventId: string;
  title: string;
  sport: HistorySport;
  startsAt: string;
  endsAt: string;
  matchCount: number;
  restCount: number;
  rounds: readonly HistoryRound[];
}>;

export type HistoryClubmate = Readonly<{
  memberId: string;
  displayName: string;
  sharedMatches: number;
  sharedEvents: number;
  lastSharedAt: string;
}>;

export type SharedHistoryEvent = Readonly<{
  eventId: string;
  title: string;
  sport: HistorySport;
  startsAt: string;
  sharedMatches: number;
}>;

export type ContactStatus = "pending" | "accepted" | "declined" | "revoked";
export type ContactDirection = "incoming" | "outgoing";

export type HistoryContactRequest = Readonly<{
  requestId: string;
  otherMemberId: string;
  displayName: string;
  status: ContactStatus;
  direction: ContactDirection;
  createdAt: string;
  respondedAt: string | null;
}>;

export type HistoryContactDetail = Readonly<{
  request: HistoryContactRequest | null;
  email: string | null;
}>;
