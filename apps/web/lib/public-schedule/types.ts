export const PUBLIC_SCHEDULE_COLUMNS = [
  "id",
  "event_date",
  "created_by_name",
  "start_time",
  "end_time",
  "courts",
  "participants_public",
  "schedule_public",
  "is_published",
  "created_at",
] as const;

export const PUBLIC_SCHEDULE_SELECT = PUBLIC_SCHEDULE_COLUMNS.join(",");

export type PublicScheduleRow = {
  Ronde: string;
  Tijd: string;
  Baan: string;
  "Team 1": string;
  "Team 2": string;
  Rust: string;
  "Nog niet aanwezig": string;
  "Niet meer beschikbaar": string;
};

export type PublicSchedule = {
  id: string;
  eventDate: string;
  createdByName: string;
  startTime: string;
  endTime: string;
  courts: string[];
  participants: string[];
  rows: PublicScheduleRow[];
  isPublished: true;
  createdAt: string;
};

export type GroupedRound = {
  roundNumber: string;
  roundTime: string;
  rows: PublicScheduleRow[];
};

export type TimedRound = GroupedRound & {
  startsAt: Date;
  endsAt: Date;
};

export type PersonalRoundStatus =
  | "playing"
  | "rest"
  | "not-arrived"
  | "unavailable";

export type PersonalRound = {
  roundNumber: string;
  roundTime: string;
  status: PersonalRoundStatus;
  court: string;
  teamOne: string;
  teamTwo: string;
};

export type LiveRoundState =
  | { kind: "untimed" }
  | { kind: "before"; next: TimedRound; startsInMinutes: number }
  | {
      kind: "current";
      current: TimedRound;
      next: TimedRound | null;
      remainingMinutes: number;
      nextIsUrgent: boolean;
    }
  | {
      kind: "between";
      next: TimedRound;
      startsInMinutes: number;
      nextIsUrgent: boolean;
    }
  | { kind: "after"; last: TimedRound };
