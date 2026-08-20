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
