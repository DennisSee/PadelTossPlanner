export const TOS_EVENT_SELECT =
  "id,slug,title,sport,starts_at,ends_at,signup_deadline,status" as const;
export const OWN_REGISTRATION_SELECT =
  "id,event_id,response,available_from,available_until,created_at,updated_at" as const;
export const OWN_REGISTRATION_WITH_EVENT_SELECT =
  `${OWN_REGISTRATION_SELECT},tos_events!inner(${TOS_EVENT_SELECT})` as const;

export type TosSport = "padel" | "tennis";
export type TosEventStatus = "draft" | "open" | "closed" | "cancelled";
export type RegistrationResponse = "attending" | "declined";

export type TosEvent = Readonly<{
  id: string;
  slug: string;
  title: string;
  sport: TosSport;
  startsAt: string;
  endsAt: string;
  signupDeadline: string | null;
  status: TosEventStatus;
}>;

export type OwnRegistration = Readonly<{
  id: string;
  eventId: string;
  response: RegistrationResponse;
  availableFrom: string | null;
  availableUntil: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type OwnRegistrationWithEvent = OwnRegistration &
  Readonly<{ event: TosEvent }>;

export type RegistrationWrite = Readonly<{
  response: RegistrationResponse;
  availableFrom: string | null;
  availableUntil: string | null;
}>;

export type MemberApprovalStatus = "pending" | "approved" | "rejected";

export type StaffPlannerInput = Readonly<{
  registrationId: string;
  userId: string;
  memberId: string;
  response: RegistrationResponse;
  availableFrom: string | null;
  availableUntil: string | null;
  registrationUpdatedAt: string;
  displayName: string;
  approvalStatus: MemberApprovalStatus;
  memberActive: boolean;
  sportProfileActive: boolean;
  ranking: number | null;
}>;

export const PLANNER_COURTS = [
  "Kremer Baan",
  "ZGA/F&F Baan",
  "PlaySeat Baan",
  "Seppworks/Bax Baan",
] as const;
export const PLANNER_SEARCH_PROFILES = ["Snel", "Normaal", "Uitgebreid"] as const;
export type PlannerCourt = (typeof PLANNER_COURTS)[number];
export type PlannerSearchProfile = (typeof PLANNER_SEARCH_PROFILES)[number];

export type PlannerPlayer = Readonly<{
  rowId: string;
  name: string;
  ranking: number;
  included: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  memberId?: string;
  userId?: string;
  registrationId?: string;
  registrationUpdatedAt?: string;
  sourceEventId?: string;
}>;

export type EditablePlannerPlayer = Readonly<{
  rowId: string;
  name: string;
  ranking: number;
  included: boolean;
  availableFrom: string;
  availableUntil: string;
  linked: boolean;
}>;

export type PlannerDraft = Readonly<{
  eventId: string;
  players: readonly PlannerPlayer[];
  selectedCourts: readonly PlannerCourt[];
  matchMinutes: 15 | 20 | 25 | 30;
  restMinutes: number;
  searchProfile: PlannerSearchProfile;
  allowRepeatPartners: boolean;
  levelMix: number;
  teamDifferenceTolerance: number;
  revision: number;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}>;

export type PlannerDraftWrite = Readonly<{
  players: readonly PlannerPlayer[];
  selectedCourts: readonly PlannerCourt[];
  matchMinutes: 15 | 20 | 25 | 30;
  restMinutes: number;
  searchProfile: PlannerSearchProfile;
  allowRepeatPartners: boolean;
  levelMix: number;
  teamDifferenceTolerance: number;
}>;

export type StaffScheduleSummary = Readonly<{
  id: string;
  eventId: string;
  createdBy: string;
  createdByName: string;
  isPublished: boolean;
  generationSeed: number;
  plannerDraftRevision: number;
  createdAt: string;
}>;

export type StaffScheduleDetail = StaffScheduleSummary & Readonly<{
  title: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  matchMinutes: number;
  courts: readonly string[];
  schedule: readonly import("../planner-api/types").PrivateScheduleRow[];
  statistics: readonly Readonly<Record<string, string | number>>[];
  diagnostics: Readonly<Record<string, unknown>>;
}>;
