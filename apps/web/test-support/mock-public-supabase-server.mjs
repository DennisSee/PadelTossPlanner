import { createServer } from "node:http";
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";

const PUBLIC_COLUMNS = [
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
];
const EXPECTED_QUERY_KEYS = new Set(["select", "is_published", "order", "limit"]);
const XSS_NAME = "<img src=x onerror=alert(1)>";
const LONG_PLAYER_NAME = "Alexandria van den Berg-van der Meer met een bijzonder lange testnaam";
const LONG_COURT_NAME = "Seppworks/Bax Baan met een bijzonder lange sponsornaam";
const TIME_ZONE = "Europe/Amsterdam";
const plannerReceipts = new Map();
const LIVE_KEYS = [1, 2, 3, 4, 5].map((n) => `a4600000-0000-4000-8000-00000000000${n}`);
// Synthetic publication fixture: keys are snapshot identities, not account IDs.
function personalLiveFixture(slug) {
  const offset = slug === "personal-past" ? -24 * 60 : slug === "personal-future" ? 24 * 60 : 0;
  const start = new Date(Date.now() + (offset - 5) * 60_000);
  start.setSeconds(0, 0);
  const clock = (date) => new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date);
  const rounds = [0, 1].map((index) => ({ number: index + 1,
    starts_at: new Date(start.getTime() + index * 20 * 60_000).toISOString(),
    ends_at: new Date(start.getTime() + (index + 1) * 20 * 60_000).toISOString(),
    slots: LIVE_KEYS.map((key, i) => ({ key, state: i === 4 ? "rest" : "playing", court: i === 4 ? null : "Kremer Baan", team: i === 4 ? null : i < 2 ? 1 : 2 })),
  }));
  const end = new Date(rounds[1].ends_at);
  return { id: "a4600000-0000-4000-8000-000000000099", event_slug: slug, event_title: "Persoonlijke TOS", event_sport: "padel",
    event_starts_at: start.toISOString(), event_ends_at: end.toISOString(),
    event_date: new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(start), start_time: clock(start), end_time: clock(end),
    created_by_name: "Testplanner", created_at: start.toISOString(), is_published: true, courts: ["Kremer Baan"],
    participants_public: ["Dezelfde Naam", "Speler 2", "Speler 3", "Rust Speler"],
    schedule_public: rounds.map((round) => ({ Ronde: String(round.number), Tijd: `${clock(new Date(round.starts_at))}–${clock(new Date(round.ends_at))}`, Baan: "Kremer Baan", "Team 1": "Dezelfde Naam & Dezelfde Naam", "Team 2": "Speler 2 & Speler 3", Rust: "Rust Speler", "Nog niet aanwezig": "", "Niet meer beschikbaar": "" })),
    live_identity: { players: LIVE_KEYS.map((key, i) => ({ key, name: i < 2 ? "Dezelfde Naam" : i === 4 ? "Rust Speler" : `Speler ${i}` })), rounds },
  };
}
const jwtSecret = randomBytes(32);
const authUsers = new Map();
const sessions = new Map();
const otpCodes = new Map();
const oauthCodes = new Map();
let nextOAuthAttempt = null;
let attendeeFailureEventId = null;
let plannerDiagnosticFailure = false;

const TOS_EVENT_COLUMNS = [
  "id",
  "slug",
  "title",
  "sport",
  "starts_at",
  "ends_at",
  "signup_deadline",
  "status",
  "max_participants",
];
const OWN_REGISTRATION_COLUMNS = [
  "id",
  "event_id",
  "response",
  "available_from",
  "available_until",
  "attending_since",
  "created_at",
  "updated_at",
];
const OWN_REGISTRATION_SELECT = OWN_REGISTRATION_COLUMNS.join(",");
const OWN_REGISTRATION_WITH_EVENT_SELECT =
  `${OWN_REGISTRATION_SELECT},tos_events!inner(${TOS_EVENT_COLUMNS.join(",")})`;
const registrations = new Map();
const plannerDrafts = new Map();
const staffSchedules = new Map();
const staffPlannerInputOverrides = new Map();
const initialClubCourts = [
  { id: "c9000000-0000-4000-8000-000000000001", sport: "padel", name: "Kremer Baan", active: true, sort_order: 10 },
  { id: "c9000000-0000-4000-8000-000000000002", sport: "padel", name: "ZGA/F&F Baan", active: true, sort_order: 20 },
  { id: "c9000000-0000-4000-8000-000000000003", sport: "padel", name: "PlaySeat Baan", active: true, sort_order: 30 },
  { id: "c9000000-0000-4000-8000-000000000004", sport: "padel", name: "Seppworks/Bax Baan", active: true, sort_order: 40 },
];
const clubCourts = new Map(initialClubCourts.map((court) => [court.id, { ...court }]));
const sportProfileOverrides = new Map();
const historyContactRequests = new Map();
const homeEmptyUsers = new Set();
const HISTORY_CLUBMATE_ID = "5c100000-0000-4000-8000-000000000001";
const HISTORY_EVENT_ID = "7a100000-0000-4000-8000-000000000001";

function relativeIso(hours) {
  const value = new Date();
  value.setSeconds(0, 0);
  value.setTime(value.getTime() + hours * 60 * 60_000);
  return value.toISOString();
}

const tosEvents = [
  {
    id: "10000000-0000-4000-8000-000000000007",
    slug: "concept-padel-tos",
    title: "Concept TOS",
    sport: "padel",
    starts_at: relativeIso(60),
    ends_at: relativeIso(62),
    signup_deadline: relativeIso(36),
    status: "draft",
  },
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "vrijdag-padel",
    title: "Padel TOS vrijdagavond",
    sport: "padel",
    starts_at: relativeIso(72),
    ends_at: relativeIso(74),
    signup_deadline: relativeIso(48),
    status: "open",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "tennis-avond-2026",
    title: "Tennis TOS voor alle clubleden",
    sport: "tennis",
    starts_at: relativeIso(96),
    ends_at: relativeIso(98),
    signup_deadline: null,
    status: "open",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "deadline-verstreken",
    title: "TOS met gesloten inschrijving",
    sport: "padel",
    starts_at: relativeIso(120),
    ends_at: relativeIso(122),
    signup_deadline: relativeIso(-1),
    status: "open",
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    slug: "eigen-gesloten-tos",
    title: "Eigen gesloten TOS",
    sport: "padel",
    starts_at: relativeIso(144),
    ends_at: relativeIso(146),
    signup_deadline: relativeIso(100),
    status: "closed",
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    slug: "eigen-geannuleerde-tos",
    title: "Eigen geannuleerde TOS",
    sport: "padel",
    starts_at: relativeIso(168),
    ends_at: relativeIso(170),
    signup_deadline: relativeIso(140),
    status: "cancelled",
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    slug: "nacht-tos",
    title: "TOS over middernacht met een extra lange titel die veilig moet afbreken op mobiel",
    sport: "padel",
    starts_at: relativeIso(192),
    ends_at: relativeIso(194),
    signup_deadline: relativeIso(180),
    status: "open",
  },
  {
    id: "5d100000-0000-4000-8000-000000000001",
    slug: "web5b1-padel",
    title: "WEB-5B1 Padelavond",
    sport: "padel",
    starts_at: "2099-08-21T18:00:00.000Z",
    ends_at: "2099-08-21T20:00:00.000Z",
    signup_deadline: "2099-08-21T17:00:00.000Z",
    status: "closed",
  },
  {
    id: "5d100000-0000-4000-8000-000000000002",
    slug: "web5b1-tennis",
    title: "WEB-5B1 Tennisavond",
    sport: "tennis",
    starts_at: "2099-08-22T18:00:00.000Z",
    ends_at: "2099-08-22T20:00:00.000Z",
    signup_deadline: null,
    status: "closed",
  },
];
for (const event of tosEvents) {
  event.max_participants = event.slug === "web5b1-padel"
    ? 6
    : event.slug === "tennis-avond-2026"
      ? 2
      : 24;
}
const initialTosEvents = tosEvents.map((event) => ({ ...event }));

const staffPlannerInputFixtures = [
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000001",
    user_id: "5b100000-0000-4000-8000-000000000001",
    member_id: "5c100000-0000-4000-8000-000000000001",
    response: "attending",
    available_from: "2099-08-21T18:00:00.000Z",
    available_until: "2099-08-21T20:00:00.000Z",
    registration_updated_at: "2099-08-01T10:01:00.000Z",
    display_name: "Ready Hele Avond",
    approval_status: "approved",
    member_active: true,
    sport_profile_active: true,
    ranking: 4,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000002",
    user_id: "5b100000-0000-4000-8000-000000000002",
    member_id: "5c100000-0000-4000-8000-000000000002",
    response: "attending",
    available_from: "2099-08-21T18:07:00.000Z",
    available_until: "2099-08-21T19:43:00.000Z",
    registration_updated_at: "2099-08-01T10:02:00.000Z",
    display_name: "Ready Partieel",
    approval_status: "approved",
    member_active: true,
    sport_profile_active: true,
    ranking: 3,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000003",
    user_id: "5b100000-0000-4000-8000-000000000003",
    member_id: "5c100000-0000-4000-8000-000000000003",
    response: "declined",
    available_from: null,
    available_until: null,
    registration_updated_at: "2099-08-01T10:03:00.000Z",
    display_name: "Afgemelde Speler",
    approval_status: "approved",
    member_active: true,
    sport_profile_active: true,
    ranking: 5,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000004",
    user_id: "5b100000-0000-4000-8000-000000000004",
    member_id: "5c100000-0000-4000-8000-000000000004",
    response: "attending",
    available_from: "2099-08-21T18:00:00.000Z",
    available_until: "2099-08-21T20:00:00.000Z",
    registration_updated_at: "2099-08-01T10:04:00.000Z",
    display_name: "Pending Speler",
    approval_status: "pending",
    member_active: true,
    sport_profile_active: true,
    ranking: 3,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000005",
    user_id: "5b100000-0000-4000-8000-000000000005",
    member_id: "5c100000-0000-4000-8000-000000000005",
    response: "attending",
    available_from: "2099-08-21T18:00:00.000Z",
    available_until: "2099-08-21T20:00:00.000Z",
    registration_updated_at: "2099-08-01T10:05:00.000Z",
    display_name: "Rejected Speler",
    approval_status: "rejected",
    member_active: true,
    sport_profile_active: true,
    ranking: 4,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000006",
    user_id: "5b100000-0000-4000-8000-000000000006",
    member_id: "5c100000-0000-4000-8000-000000000006",
    response: "attending",
    available_from: "2099-08-21T18:00:00.000Z",
    available_until: "2099-08-21T20:00:00.000Z",
    registration_updated_at: "2099-08-01T10:06:00.000Z",
    display_name: "Inactief Clublid",
    approval_status: "approved",
    member_active: false,
    sport_profile_active: true,
    ranking: 2,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000007",
    user_id: "5b100000-0000-4000-8000-000000000007",
    member_id: "5c100000-0000-4000-8000-000000000007",
    response: "attending",
    available_from: "2099-08-21T18:00:00.000Z",
    available_until: "2099-08-21T20:00:00.000Z",
    registration_updated_at: "2099-08-01T10:07:00.000Z",
    display_name: "Inactief Padelprofiel",
    approval_status: "approved",
    member_active: true,
    sport_profile_active: false,
    ranking: 2,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000001",
    registration_id: "5e100000-0000-4000-8000-000000000008",
    user_id: "5b100000-0000-4000-8000-000000000008",
    member_id: "5c100000-0000-4000-8000-000000000008",
    response: "attending",
    available_from: "2099-08-21T18:00:00.000Z",
    available_until: "2099-08-21T20:00:00.000Z",
    registration_updated_at: "2099-08-01T10:08:00.000Z",
    display_name: "Niveau Ontbreekt",
    approval_status: "approved",
    member_active: true,
    sport_profile_active: true,
    ranking: null,
  },
  {
    event_id: "5d100000-0000-4000-8000-000000000002",
    registration_id: "5e100000-0000-4000-8000-000000000009",
    user_id: "5b100000-0000-4000-8000-000000000001",
    member_id: "5c100000-0000-4000-8000-000000000001",
    response: "attending",
    available_from: "2099-08-22T18:00:00.000Z",
    available_until: "2099-08-22T20:00:00.000Z",
    registration_updated_at: "2099-08-01T10:09:00.000Z",
    display_name: "Ready Hele Avond",
    approval_status: "approved",
    member_active: true,
    sport_profile_active: true,
    ranking: 2,
  },
];

const attendeeFixtures = [
  { display_name: "Dennis", response: "attending", active: true, approval: "approved" },
  { display_name: "Marieke", response: "attending", active: true, approval: "approved" },
  { display_name: "<b>Veilige testnaam</b>", response: "attending", active: true, approval: "approved" },
  { display_name: "Afgezegd", response: "declined", active: true, approval: "approved" },
  { display_name: "Pending lid", response: "attending", active: true, approval: "pending" },
  { display_name: "Inactief lid", response: "attending", active: false, approval: "approved" },
];

function participantAttendance(event) {
  const names = attendeeFixtures
    .filter(({ response, active, approval }) =>
      response === "attending" && active && approval === "approved")
    .map(({ display_name }, index) => ({
      order: index,
      id: `fixture-${index}`,
      display_name,
    }));
  for (const registration of registrations.values()) {
    if (registration.event_id !== event.id || registration.response !== "attending") continue;
    const attendee = [...authUsers.values()].find(({ id }) => id === registration.user_id);
    if (!validParticipant(attendee)) continue;
    names.push({
      order: Date.parse(registration.attending_since),
      id: registration.id,
      display_name: attendee.membership.display_name,
    });
  }
  const unique = [...new Map(names.map((item) => [item.display_name, item])).values()]
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return unique.map((item, index) => ({
    display_name: item.display_name,
    placement_status: index < event.max_participants ? "placed" : "waitlist",
    waitlist_position: index < event.max_participants ? null : index - event.max_participants + 1,
  }));
}

function staffOverview(event) {
  const fixtures = staffPlannerInputFixtures.filter(({ event_id }) => event_id === event.id);
  let attendingPosition = 0;
  return fixtures.map((fixture) => {
    const effective = { ...fixture, ...staffPlannerInputOverrides.get(fixture.registration_id) };
    const safe = Object.fromEntries(
      Object.entries(effective).filter(([key]) => key !== "event_id"),
    );
    if (effective.response === "declined") {
      return { ...safe, placement_status: "declined", waitlist_position: null };
    }
    attendingPosition += 1;
    return {
      ...safe,
      placement_status: attendingPosition <= event.max_participants ? "placed" : "waitlist",
      waitlist_position: attendingPosition <= event.max_participants
        ? null
        : attendingPosition - event.max_participants,
    };
  });
}

function staffCapacity(event) {
  const fixtureCount = staffPlannerInputFixtures.filter(
    ({ event_id, response }) => event_id === event.id && response === "attending",
  ).length;
  const registrationCount = [...registrations.values()].filter(
    ({ event_id, response }) => event_id === event.id && response === "attending",
  ).length;
  const total = fixtureCount + registrationCount;
  return {
    event_id: event.id,
    max_participants: event.max_participants,
    placed_count: Math.min(total, event.max_participants),
    available_count: Math.max(event.max_participants - total, 0),
    waitlist_count: Math.max(total - event.max_participants, 0),
  };
}

function staffMemberDirectory() {
  const members = new Map();
  for (const fixture of staffPlannerInputFixtures) {
    const existing = members.get(fixture.member_id) ?? {
      member_id: fixture.member_id,
      profile_id: fixture.user_id,
      account_role: "participant",
      display_name: fixture.display_name,
      login_email: null,
      approval_status: fixture.approval_status,
      member_active: fixture.member_active,
      account_linked: true,
      padel_profile_active: false,
      padel_ranking: null,
      tennis_profile_active: false,
      tennis_ranking: null,
    };
    const event = eventById(fixture.event_id);
    if (event?.sport === "padel") {
      existing.padel_profile_active = fixture.sport_profile_active;
      existing.padel_ranking = fixture.ranking;
    } else if (event?.sport === "tennis") {
      existing.tennis_profile_active = fixture.sport_profile_active;
      existing.tennis_ranking = fixture.ranking;
    }
    members.set(fixture.member_id, existing);
  }
  for (const user of authUsers.values()) {
    if (!user.membership) continue;
    const existing = members.get(user.membership.id) ?? {
        member_id: user.membership.id,
        profile_id: user.id,
        account_role: user.role,
        display_name: user.membership.display_name,
        login_email: null,
        approval_status: user.membership.approval_status,
        member_active: user.membership.active,
        account_linked: false,
        padel_profile_active: false,
        padel_ranking: null,
        tennis_profile_active: false,
        tennis_ranking: null,
      };
    existing.login_email = user.email;
    existing.account_linked = true;
    existing.profile_id = user.id;
    existing.account_role = user.role;
    members.set(user.membership.id, existing);
  }
  for (const [key, override] of sportProfileOverrides) {
    const [memberId, sport] = key.split(":");
    const member = members.get(memberId);
    if (!member) continue;
    member[`${sport}_profile_active`] = override.active;
    member[`${sport}_ranking`] = override.ranking;
  }
  return [...members.values()].sort((left, right) =>
    left.display_name.localeCompare(right.display_name, "nl", { sensitivity: "base" }));
}

function registrationKey(userId, eventId) {
  return `${userId}:${eventId}`;
}

function eventById(eventId) {
  return tosEvents.find(({ id }) => id === eventId) ?? null;
}

function registrationFor(userId, eventId) {
  return registrations.get(registrationKey(userId, eventId)) ?? null;
}

function registrationRow(registration, nestedEvent = false) {
  const row = Object.fromEntries(
    OWN_REGISTRATION_COLUMNS.map((column) => [column, registration[column]]),
  );
  if (nestedEvent) row.tos_events = eventById(registration.event_id);
  return row;
}

function seedRegistration(user, eventId, response) {
  const event = eventById(eventId);
  if (!event || registrationFor(user.id, eventId)) return;
  const now = new Date().toISOString();
  registrations.set(registrationKey(user.id, eventId), {
    id: randomUUID(),
    event_id: eventId,
    user_id: user.id,
    member_id: user.membership?.id ?? randomUUID(),
    response,
    available_from: response === "attending" ? event.starts_at : null,
    available_until: response === "attending" ? event.ends_at : null,
    attending_since: response === "attending" ? now : null,
    source: "self",
    created_at: now,
    updated_at: now,
  });
}

function seedUserRegistrations(user) {
  if (!user.email.includes("dashboard")) return;
  seedRegistration(user, tosEvents.find(({ slug }) => slug === "vrijdag-padel").id, "attending");
  seedRegistration(user, tosEvents.find(({ slug }) => slug === "tennis-avond-2026").id, "declined");
  seedRegistration(user, tosEvents.find(({ slug }) => slug === "eigen-gesloten-tos").id, "attending");
  seedRegistration(user, tosEvents.find(({ slug }) => slug === "eigen-geannuleerde-tos").id, "attending");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function jwtFor(user) {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    aud: "authenticated",
    exp: now + 3_600,
    iat: now,
    iss: "http://127.0.0.1/auth/v1",
    role: "authenticated",
    sub: user.id,
    email: user.email,
  }));
  const signature = createHmac("sha256", jwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function roleForEmail(email) {
  if (email.startsWith("admin")) return "admin";
  if (email.startsWith("planner")) return "planner";
  return "participant";
}

function membershipForEmail(email) {
  if (email.includes("no-member")) return null;
  const status = email.startsWith("pending") ? "pending" :
    email.startsWith("rejected") ? "rejected" : "approved";
  return {
    id: randomUUID(),
    display_name: "Testlid",
    approval_status: status,
    active: !email.startsWith("inactive-member"),
  };
}

function authUser(email) {
  let user = authUsers.get(email);
  if (!user) {
    const membership = membershipForEmail(email);
    user = {
      id: randomUUID(),
      email,
      role: roleForEmail(email),
      active: !email.startsWith("inactive-profile"),
      membership,
    };
    authUsers.set(email, user);
    seedUserRegistrations(user);
  }
  return user;
}

async function requestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

function bearerUser(request) {
  const authorization = request.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  return sessions.get(authorization.slice(7)) ?? null;
}

function publicAuthUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function oauthAuthUser(user) {
  return {
    ...publicAuthUser(user),
    app_metadata: { provider: "google", providers: ["email", "google"] },
    user_metadata: { full_name: "Niet gebruiken voor profiel of rollen" },
  };
}

function redirect(response, location) {
  response.writeHead(302, {
    location,
    "cache-control": "private, no-store, max-age=0",
  });
  response.end();
}

function readPort() {
  const index = process.argv.indexOf("--port");
  const value = index >= 0 ? Number(process.argv[index + 1]) : Number.NaN;
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("Geef een geldige lokale mockpoort op met --port.");
  }
  return value;
}

function amsterdamParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDate(value) {
  const parts = amsterdamParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localClock(value) {
  const parts = amsterdamParts(value);
  return `${parts.hour}:${parts.minute}`;
}

function scheduleFixture() {
  const now = new Date();
  const currentStart = new Date(now.getTime() - 20 * 60_000);
  const currentEnd = new Date(now.getTime() + 20 * 60_000);
  const nextStart = new Date(now.getTime() + 30 * 60_000);
  const nextEnd = new Date(now.getTime() + 55 * 60_000);
  const currentTime = `${localClock(currentStart)} – ${localClock(currentEnd)}`;
  const nextTime = `${localClock(nextStart)} – ${localClock(nextEnd)}`;

  return {
    id: "00000000-0000-4000-8000-000000000001",
    event_date: localDate(currentStart),
    created_by_name: "T.C. Zuid testplanner",
    start_time: localClock(currentStart),
    end_time: localClock(nextEnd),
    courts: [LONG_COURT_NAME, "Kremer Baan"],
    participants_public: [
      "Zoë Accent",
      "Anna",
      "Ann",
      "Rust Speler",
      "Nog Niet Speler",
      "Niet Meer Speler",
      LONG_PLAYER_NAME,
      XSS_NAME,
      "Team Eén",
      "Team Twee",
      "Speler Drie",
      "Speler Vier",
    ],
    schedule_public: [
      {
        Ronde: "1",
        Tijd: currentTime,
        Baan: LONG_COURT_NAME,
        "Team 1": "Zoë Accent & Anna",
        "Team 2": `${LONG_PLAYER_NAME} & Niet Meer Speler`,
        Rust: `Rust Speler, Ann, ${XSS_NAME}`,
        "Nog niet aanwezig": "Nog Niet Speler",
        "Niet meer beschikbaar": "",
      },
      {
        Ronde: "1",
        Tijd: currentTime,
        Baan: "Kremer Baan",
        "Team 1": "Team Eén & Team Twee",
        "Team 2": "Speler Drie & Speler Vier",
        Rust: "",
        "Nog niet aanwezig": "",
        "Niet meer beschikbaar": "",
      },
      {
        Ronde: "2",
        Tijd: nextTime,
        Baan: LONG_COURT_NAME,
        "Team 1": "Zoë Accent & Rust Speler",
        "Team 2": `Nog Niet Speler & ${LONG_PLAYER_NAME}`,
        Rust: `Anna, Ann, ${XSS_NAME}`,
        "Nog niet aanwezig": "",
        "Niet meer beschikbaar": "Niet Meer Speler",
      },
      {
        Ronde: "2",
        Tijd: nextTime,
        Baan: "Kremer Baan",
        "Team 1": "Team Eén & Speler Drie",
        "Team 2": "Team Twee & Speler Vier",
        Rust: "",
        "Nog niet aanwezig": "",
        "Niet meer beschikbaar": "",
      },
    ],
    is_published: true,
    created_at: now.toISOString(),
  };
}

function validateScheduleRequest(requestUrl) {
  if (requestUrl.pathname !== "/rest/v1/schedules") {
    return "onverwacht endpoint";
  }
  const keys = [...requestUrl.searchParams.keys()];
  if (
    keys.length !== EXPECTED_QUERY_KEYS.size ||
    keys.some((key) => !EXPECTED_QUERY_KEYS.has(key)) ||
    [...EXPECTED_QUERY_KEYS].some((key) => requestUrl.searchParams.getAll(key).length !== 1)
  ) {
    return "onverwachte queryparameters";
  }
  if (requestUrl.searchParams.get("select") !== PUBLIC_COLUMNS.join(",")) {
    return "publieke kolomprojectie wijkt af";
  }
  if (requestUrl.searchParams.get("is_published") !== "eq.true") {
    return "publicatiefilter ontbreekt";
  }
  if (requestUrl.searchParams.get("order") !== "event_date.desc,created_at.desc") {
    return "sortering wijkt af";
  }
  if (requestUrl.searchParams.get("limit") !== "1") {
    return "limiet wijkt af";
  }
  return null;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index]);
}

function singleQueryValue(requestUrl, key) {
  const values = requestUrl.searchParams.getAll(key);
  return values.length === 1 ? values[0] : null;
}

function eqValue(requestUrl, key) {
  const value = singleQueryValue(requestUrl, key);
  return value?.startsWith("eq.") ? value.slice(3) : null;
}

function hasOnlyQueryKeys(requestUrl, allowed) {
  return [...requestUrl.searchParams.keys()].every((key) => allowed.has(key)) &&
    [...new Set(requestUrl.searchParams.keys())].every(
      (key) => requestUrl.searchParams.getAll(key).length === 1,
    );
}

function selfServiceOpen(event) {
  return event.status === "open" &&
    (!event.signup_deadline || new Date() <= new Date(event.signup_deadline));
}

function validParticipant(user) {
  return Boolean(
    user?.active &&
    user.membership?.active &&
    user.membership.approval_status === "approved",
  );
}

function validStaff(user) {
  return Boolean(user?.active && (user.role === "planner" || user.role === "admin"));
}

function visibleEventForUser(event, user) {
  return validStaff(user) || event.status === "open" ||
    (validParticipant(user) && event.status === "closed") ||
    Boolean(user && registrationFor(user.id, event.id));
}

function validEventPayload(body) {
  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(body.ends_at);
  const deadline = body.signup_deadline === null ? null : new Date(body.signup_deadline);
  return (
    typeof body.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(body.slug) &&
    !tosEvents.some(({ slug }) => slug === body.slug) &&
    typeof body.title === "string" && body.title.trim().length >= 1 && body.title.trim().length <= 160 &&
    new Set(["padel", "tennis"]).has(body.sport) &&
    new Set(["draft", "open", "closed", "cancelled"]).has(body.status) &&
    Number.isInteger(body.max_participants) && body.max_participants > 0 && body.max_participants <= 500 &&
    !Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime()) && endsAt > startsAt &&
    (deadline === null || (!Number.isNaN(deadline.getTime()) && deadline <= startsAt))
  );
}

function registrationAvailability(event, response, from, until) {
  if (response === "declined") return { from: null, until: null };
  const availableFrom = from ?? event.starts_at;
  const availableUntil = until ?? event.ends_at;
  if (
    response !== "attending" ||
    typeof availableFrom !== "string" ||
    typeof availableUntil !== "string" ||
    new Date(availableFrom) < new Date(event.starts_at) ||
    new Date(availableUntil) > new Date(event.ends_at) ||
    new Date(availableUntil) <= new Date(availableFrom)
  ) {
    return null;
  }
  return { from: availableFrom, until: availableUntil };
}

function rejectMockContract(response, detail) {
  console.error(`TOS mock weigerde request: ${detail}.`);
  json(response, 422, { error: "TOS query contract rejected" });
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin": "http://127.0.0.1:31000",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  });
  response.end(payload);
}

const port = readPort();
let nextDelayMilliseconds = 0;
const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "http://127.0.0.1:31000",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/__health") {
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__delay") {
    const requestedDelay = Number(requestUrl.searchParams.get("milliseconds"));
    nextDelayMilliseconds = Number.isFinite(requestedDelay)
      ? Math.max(0, Math.min(2_000, Math.trunc(requestedDelay)))
      : 0;
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/oauth") {
    const body = await requestJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const outcome = String(body.outcome ?? "success");
    if (
      !email ||
      !email.includes("@") ||
      !new Set(["success", "cancel", "exchange-error"]).has(outcome)
    ) {
      json(response, 400, { error: "invalid OAuth test setup" });
      return;
    }
    nextOAuthAttempt = { email, outcome };
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/attendee-failure") {
    const body = await requestJson(request);
    const event = tosEvents.find(({ slug }) => slug === String(body.slug ?? ""));
    if (!event) {
      json(response, 400, { error: "unknown test fixture" });
      return;
    }
    attendeeFailureEventId = event.id;
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/staff-registration") {
    const body = await requestJson(request);
    const fixture = staffPlannerInputFixtures.find(
      ({ registration_id }) => registration_id === String(body.registration_id ?? ""),
    );
    if (!exactKeys(body, ["registration_id", "response"]) ||
        !fixture || !new Set(["attending", "declined"]).has(body.response)) {
      json(response, 400, { error: "invalid staff registration fixture" });
      return;
    }
    staffPlannerInputOverrides.set(fixture.registration_id, { response: body.response });
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/history-contact") {
    const body = await requestJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const status = String(body.status ?? "");
    if (!email.includes("@") || !new Set(["incoming", "accepted"]).has(status)) {
      json(response, 400, { error: "invalid history contact fixture" });
      return;
    }
    const user = authUser(email);
    if (!validParticipant(user)) {
      json(response, 400, { error: "invalid history member fixture" });
      return;
    }
    const id = randomUUID();
    historyContactRequests.set(id, {
      id,
      requester: status === "incoming" ? HISTORY_CLUBMATE_ID : user.membership.id,
      recipient: status === "incoming" ? user.membership.id : HISTORY_CLUBMATE_ID,
      status: status === "accepted" ? "accepted" : "pending",
      created_at: new Date().toISOString(),
      responded_at: status === "accepted" ? new Date().toISOString() : null,
    });
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/home-state") {
    const body = await requestJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const state = String(body.state ?? "");
    if (!email.includes("@") || !new Set(["live", "closed", "closed-published", "waitlist", "waitlist-closed", "same-day", "multiple-placed", "empty"]).has(state)) {
      json(response, 400, { error: "invalid home state fixture" });
      return;
    }
    const user = authUser(email);
    if (!validParticipant(user)) {
      json(response, 400, { error: "invalid home participant fixture" });
      return;
    }
    if (state === "same-day" || state === "multiple-placed") {
      for (const [slug, hour] of [["vrijdag-padel", 8], ["tennis-avond-2026", 12], ["nacht-tos", 18]]) {
        const event = tosEvents.find((event) => event.slug === slug);
        event.starts_at = `2099-08-28T${String(hour).padStart(2, "0")}:00:00.000Z`;
        event.ends_at = `2099-08-28T${String(hour + 2).padStart(2, "0")}:00:00.000Z`;
        event.signup_deadline = null;
      }
      if (state === "multiple-placed") {
        for (const slug of ["vrijdag-padel", "tennis-avond-2026"]) {
          const event = tosEvents.find((event) => event.slug === slug);
          event.max_participants = 24;
          seedRegistration(user, event.id, "attending");
          if (slug === "tennis-avond-2026") {
            event.status = "closed";
            event.signup_deadline = relativeIso(-2);
          }
        }
      }
    } else if (state === "live" || state === "closed" || state === "closed-published") {
      const event = tosEvents.find(({ slug }) => slug === "vrijdag-padel");
      if (!event) {
        json(response, 500, { error: "missing live home fixture" });
        return;
      }
      event.starts_at = relativeIso(state === "live" ? -1 : 24 * 60);
      event.ends_at = relativeIso(state === "live" ? 1 : 26 * 60);
      event.signup_deadline = relativeIso(-2);
      if (state !== "live") event.status = "closed";
      seedRegistration(user, event.id, "attending");
      if (state !== "closed") {
        const published = scheduleFixture();
        staffSchedules.set(published.id, { ...published, event_id: event.id });
      }
    } else if (state === "waitlist" || state === "waitlist-closed") {
      const event = tosEvents.find(({ slug }) => slug === "tennis-avond-2026");
      if (state === "waitlist-closed") {
        event.status = "closed";
        event.signup_deadline = relativeIso(-2);
      }
      seedRegistration(user, event.id, "attending");
    } else {
      homeEmptyUsers.add(user.id);
    }
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/planner-diagnostic-failure") {
    const body = await requestJson(request);
    if (!exactKeys(body, ["enabled"]) || typeof body.enabled !== "boolean") {
      json(response, 400, { error: "invalid planner diagnostic fixture" });
      return;
    }
    plannerDiagnosticFailure = body.enabled;
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/planner-best-effort-fixture") {
    const event = tosEvents.find(({ slug }) => slug === "web5b1-padel");
    const now = new Date().toISOString();
    plannerDrafts.set(event.id, {
      event_id: event.id,
      players: Array.from({ length: 12 }, (_, index) => ({
        row_id: `be${String(index + 1).padStart(2, "0")}0000-0000-4000-8000-000000000001`,
        name: `Best effort ${String(index + 1).padStart(2, "0")}`,
        ranking: [5, 3, 3, 1, 4, 4, 3, 3, 4, 2, 4, 2][index], included: true,
        available_from: "20:00", available_until: "22:00",
      })),
      selected_courts: initialClubCourts.slice(0, 3).map(({ id }) => id),
      match_minutes: 20, rest_minutes: 0, search_profile: "Normaal",
      allow_repeat_partners: false, level_mix: 100, team_difference_tolerance: 1,
      revision: 1, updated_by: null, updated_by_name: "Planner", updated_at: now, created_at: now,
    });
    json(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/reset-state") {
    plannerReceipts.clear();
    tosEvents.splice(0, tosEvents.length, ...initialTosEvents.map((event) => ({ ...event })));
    authUsers.clear();
    sessions.clear();
    otpCodes.clear();
    oauthCodes.clear();
    registrations.clear();
    plannerDrafts.clear();
    staffSchedules.clear();
    staffPlannerInputOverrides.clear();
    clubCourts.clear();
    for (const court of initialClubCourts) clubCourts.set(court.id, { ...court });
    sportProfileOverrides.clear();
    historyContactRequests.clear();
    homeEmptyUsers.clear();
    nextOAuthAttempt = null;
    attendeeFailureEventId = null;
    plannerDiagnosticFailure = false;
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/generate") {
    const body = await requestJson(request);
    const expected = ["players","courts","start_time","end_time","match_minutes","rest_minutes","search_profile","allow_repeat_partners","level_mix","tolerance","generation_seed","checkpoint_context"];
    if (body.checkpoint !== undefined) expected.push("checkpoint");
    const validPlayers = Array.isArray(body.players) && body.players.length >= 4 && body.players.every((player) =>
      exactKeys(player, ["name","ranking","available_from","available_until"]) &&
      typeof player.name === "string" && Number.isInteger(player.ranking) &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(player.available_from) &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(player.available_until));
    if (!exactKeys(body, expected) || !validPlayers || !Array.isArray(body.courts) || body.courts.length < 1 ||
        !Number.isSafeInteger(body.generation_seed)) {
      json(response, 422, { error: "invalid-input" });
      return;
    }
    const { checkpoint, ...input } = body;
    const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    if (checkpoint !== undefined) {
      const receipt = plannerReceipts.get(checkpoint);
      if (!receipt || receipt.inputHash !== inputHash) {
        json(response, 409, { error: "INVALID_CHECKPOINT" });
        return;
      }
      plannerReceipts.delete(checkpoint);
      json(response, 200, receipt.result);
      return;
    }
    if (plannerDiagnosticFailure) {
      plannerDiagnosticFailure = false;
      json(response, 422, {
        error: "INVALID_PLANNER_INPUT",
        summary: "De planneropzet is niet speelbaar.",
        diagnostics: [{
          code: "AVAILABILITY_SHORTAGE", severity: "blocking",
          message: "Om 20:40 zijn 8 spelers beschikbaar; voor 3 banen zijn er 12 nodig.",
          suggested_change: "Pas beschikbaarheid of het aantal banen aan.",
          setting: "availability", current_value: 8, suggested_value: 12,
        }],
        probes_run: 0,
      });
      return;
    }
    const names = body.players.map(({ name }) => String(name));
    const totalMinutes = 120;
    const roundCount = Math.floor((totalMinutes + body.rest_minutes) / (body.match_minutes + body.rest_minutes));
    const bestEffortFixture = names.length === 12 && body.courts.length === 3;
    const opponentRepeats = bestEffortFixture ? (body.rest_minutes === 0 ? 6 : 2) : 0;
    const schedule = [];
    for (let round = 0; round < roundCount; round += 1) {
      const rotated = names.map((_, index) => names[(index + round) % names.length]);
      for (let courtIndex = 0; courtIndex < body.courts.length; courtIndex += 1) {
        const offset = courtIndex * 4;
        schedule.push({
          Ronde: round + 1, Tijd: `${body.start_time} - ${body.end_time}`, Baan: body.courts[courtIndex],
          "Team 1": `${rotated[offset]} & ${rotated[offset + 1]}`, "Niveau T1": 3,
          "Team 2": `${rotated[offset + 2]} & ${rotated[offset + 3]}`, "Niveau T2": 3,
          Teamverschil: 0, Rust: "Niemand", "Nog niet aanwezig": "Niemand",
          "Niet meer beschikbaar": "Niemand",
        });
      }
    }
    const result = {
      seed: body.generation_seed,
      schedule,
      statistics: names.map((name) => ({ Speler: name, Ranking: 3, Wedstrijden: 1 })),
      diagnostics: {
        rounds: roundCount, unused_minutes: 0, courts_used: body.courts.length,
        quality_summary: {
          partner_repeats: 0, opponent_repeats: opponentRepeats,
          max_rest_difference: 0, max_team_difference: 0,
          compromises: opponentRepeats ? ["OPPONENT_REPEATS"] : [],
        },
      },
    };
    const token = `${randomBytes(16).toString("hex")}.${randomBytes(32).toString("hex")}`;
    plannerReceipts.set(token, { inputHash, result });
    json(response, 200, { ...result, checkpoint: token });
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/auth/v1/authorize") {
    const attempt = nextOAuthAttempt ?? {
      email: `google-${randomUUID()}@example.test`,
      outcome: "success",
    };
    nextOAuthAttempt = null;
    const redirectTo = requestUrl.searchParams.get("redirect_to") ?? "";
    const provider = requestUrl.searchParams.get("provider");
    const codeChallenge = requestUrl.searchParams.get("code_challenge") ?? "";
    const codeChallengeMethod = requestUrl.searchParams.get("code_challenge_method");
    let callback;
    try {
      callback = new URL(redirectTo);
    } catch {
      json(response, 400, { error: "invalid OAuth redirect" });
      return;
    }
    if (
      provider !== "google" ||
      callback.origin !== "http://127.0.0.1:31000" ||
      callback.pathname !== "/auth/callback" ||
      !codeChallenge ||
      codeChallengeMethod !== "s256" ||
      requestUrl.searchParams.has("scopes") ||
      requestUrl.searchParams.has("access_type")
    ) {
      json(response, 400, { error: "OAuth contract rejected" });
      return;
    }
    if (attempt.outcome === "cancel") {
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set(
        "error_description",
        "private provider fixture detail",
      );
      redirect(response, callback.toString());
      return;
    }
    const code = randomUUID();
    oauthCodes.set(code, {
      user: authUser(attempt.email),
      codeChallenge,
      exchangeError: attempt.outcome === "exchange-error",
    });
    callback.searchParams.set("code", code);
    redirect(response, callback.toString());
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/auth/v1/otp") {
    const body = await requestJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !body.create_user) {
      json(response, 400, { code: "validation_failed", msg: "invalid request" });
      return;
    }
    authUser(email);
    otpCodes.set(email, String(randomInt(10_000_000, 100_000_000)));
    json(response, 200, {});
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/__test/latest-otp") {
    const body = await requestJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = otpCodes.get(email);
    if (!token) {
      json(response, 404, { error: "not found" });
      return;
    }
    json(response, 200, { token });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/auth/v1/verify") {
    const body = await requestJson(request);
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = String(body.token ?? "");
    if (body.type !== "email" || !email || otpCodes.get(email) !== token) {
      json(response, 403, { code: "otp_expired", msg: "Token has expired or is invalid" });
      return;
    }
    otpCodes.delete(email);
    const user = authUser(email);
    const accessToken = jwtFor(user);
    const refreshToken = randomBytes(32).toString("base64url");
    sessions.set(accessToken, user);
    json(response, 200, {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3_600,
      expires_at: Math.floor(Date.now() / 1_000) + 3_600,
      refresh_token: refreshToken,
      user: publicAuthUser(user),
    });
    return;
  }
  if (
    request.method === "POST" &&
    requestUrl.pathname === "/auth/v1/token" &&
    requestUrl.searchParams.get("grant_type") === "pkce"
  ) {
    const body = await requestJson(request);
    const code = String(body.auth_code ?? "");
    const verifier = String(body.code_verifier ?? "");
    const exchange = oauthCodes.get(code);
    oauthCodes.delete(code);
    const actualChallenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    if (
      !exchange ||
      exchange.exchangeError ||
      !verifier ||
      actualChallenge !== exchange.codeChallenge
    ) {
      json(response, 400, { code: "bad_code_verifier", msg: "invalid grant" });
      return;
    }
    const accessToken = jwtFor(exchange.user);
    const refreshToken = randomBytes(32).toString("base64url");
    sessions.set(accessToken, exchange.user);
    json(response, 200, {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3_600,
      expires_at: Math.floor(Date.now() / 1_000) + 3_600,
      refresh_token: refreshToken,
      user: oauthAuthUser(exchange.user),
    });
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/auth/v1/user") {
    const user = bearerUser(request);
    if (!user) {
      json(response, 401, { code: "bad_jwt", msg: "invalid JWT" });
      return;
    }
    json(response, 200, publicAuthUser(user));
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/auth/v1/logout") {
    const authorization = request.headers.authorization ?? "";
    if (authorization.startsWith("Bearer ")) sessions.delete(authorization.slice(7));
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/rest/v1/profiles") {
    const user = bearerUser(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    json(response, 200, [{
      id: user.id,
      display_name: user.display_name ?? user.membership?.display_name ?? "Testlid",
      role: user.role,
      active: user.active,
      member_id: user.membership?.id ?? null,
    }]);
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/rest/v1/club_members") {
    const user = bearerUser(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    json(response, 200, user.membership && user.active ? [user.membership] : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/self_onboard_member") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    if (!exactKeys(body, ["p_display_name"])) {
      rejectMockContract(response, "onboardingpayload bevat onverwachte velden");
      return;
    }
    const displayName = String(body.p_display_name ?? "").trim();
    if (!user.active || user.membership || !displayName || displayName.length > 120) {
      json(response, 403, { code: "42501", message: "onboarding rejected" });
      return;
    }
    user.membership = {
      id: randomUUID(),
      display_name: displayName,
      approval_status: user.email.startsWith("pending-onboarding") ? "pending" : "approved",
      active: true,
    };
    json(response, 200, [user.membership]);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/update_my_display_name") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, ["new_display_name"])) {
      json(response, user ? 400 : 401, { code: "42501", message: "display-name rejected" });
      return;
    }
    const displayName = String(body.new_display_name ?? "").trim();
    if (!validParticipant(user) || !displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
      json(response, 403, { code: "42501", message: "display-name rejected" });
      return;
    }
    user.membership.display_name = displayName;
    user.display_name = displayName;
    json(response, 200, [{ display_name: displayName }]);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/participant_event_capacity") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const event = eventById(String(body.p_event_id ?? ""));
    if (!user || !exactKeys(body, ["p_event_id"])) {
      json(response, user ? 400 : 401, { code: "42501", message: "capacity rejected" });
      return;
    }
    if (!validParticipant(user) || !event || !new Set(["open", "closed"]).has(event.status) || new Date(event.ends_at) < new Date()) {
      json(response, 200, []);
      return;
    }
    const attendance = participantAttendance(event);
    const placedCount = attendance.filter(({ placement_status }) => placement_status === "placed").length;
    json(response, 200, [{
      max_participants: event.max_participants,
      placed_count: placedCount,
      available_count: Math.max(event.max_participants - placedCount, 0),
      waitlist_count: attendance.filter(({ placement_status }) => placement_status === "waitlist").length,
    }]);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/participant_event_attendance") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const event = eventById(String(body.p_event_id ?? ""));
    if (!user || !exactKeys(body, ["p_event_id"])) {
      json(response, user ? 400 : 401, { code: "42501", message: "attendance rejected" });
      return;
    }
    if (event?.id === attendeeFailureEventId) {
      attendeeFailureEventId = null;
      json(response, 503, { code: "PGRST500", message: "fixture failure" });
      return;
    }
    if (!validParticipant(user) || !event || !new Set(["open", "closed"]).has(event.status) || new Date(event.ends_at) < new Date()) {
      json(response, 200, []);
      return;
    }
    json(response, 200, participantAttendance(event));
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/participant_own_registration_position") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const event = eventById(String(body.p_event_id ?? ""));
    if (!user || !exactKeys(body, ["p_event_id"])) {
      json(response, user ? 400 : 401, { code: "42501", message: "position rejected" });
      return;
    }
    const registration = event ? registrationFor(user.id, event.id) : null;
    if (!validParticipant(user) || !registration) {
      json(response, 200, []);
      return;
    }
    if (registration.response === "declined") {
      json(response, 200, [{ placement_status: "declined", waitlist_position: null }]);
      return;
    }
    const position = participantAttendance(event).find(
      ({ display_name }) => display_name === user.membership.display_name,
    );
    json(response, 200, [{
      placement_status: position?.placement_status ?? "placed",
      waitlist_position: position?.waitlist_position ?? null,
    }]);
    return;
  }
  if (
    request.method === "POST" &&
    requestUrl.pathname === "/rest/v1/rpc/participant_event_attendee_names"
  ) {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    if (!exactKeys(body, ["p_event_id"])) {
      rejectMockContract(response, "namen-RPC bevat onverwachte velden");
      return;
    }
    const event = eventById(String(body.p_event_id ?? ""));
    if (event?.id === attendeeFailureEventId) {
      attendeeFailureEventId = null;
      json(response, 503, { code: "PGRST500", message: "fixture failure" });
      return;
    }
    if (
      !validParticipant(user) ||
      !event ||
      event.status !== "open" ||
      new Date(event.ends_at) < new Date()
    ) {
      json(response, 200, []);
      return;
    }
    const names = attendeeFixtures
      .filter(({ response: choice, active, approval }) =>
        choice === "attending" && active && approval === "approved")
      .map(({ display_name }) => display_name);
    for (const registration of registrations.values()) {
      if (registration.event_id !== event.id || registration.response !== "attending") continue;
      const attendee = [...authUsers.values()].find(({ id }) => id === registration.user_id);
      if (validParticipant(attendee)) names.push(attendee.membership.display_name);
    }
    const unique = [...new Set(names)].sort((left, right) =>
      left.localeCompare(right, "nl", { sensitivity: "base" }));
    json(response, 200, unique.map((display_name) => ({ display_name })));
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_event_capacity_summaries") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, [])) {
      json(response, user ? 400 : 401, { code: "42501", message: "staff capacity rejected" });
      return;
    }
    json(response, 200, validStaff(user) ? tosEvents.map(staffCapacity) : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_event_registration_overview") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const event = eventById(String(body.p_event_id ?? ""));
    if (!user || !exactKeys(body, ["p_event_id"])) {
      json(response, user ? 400 : 401, { code: "42501", message: "staff overview rejected" });
      return;
    }
    json(response, 200, validStaff(user) && event ? staffOverview(event) : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_member_directory") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, [])) {
      json(response, user ? 400 : 401, { code: "42501", message: "member directory rejected" });
      return;
    }
    json(response, 200, validStaff(user) ? staffMemberDirectory() : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_update_member_sport_profile") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, ["p_member_id", "p_sport", "p_active", "p_ranking"])) {
      json(response, user ? 400 : 401, { code: "42501", message: "sport profile rejected" });
      return;
    }
    const directory = staffMemberDirectory();
    const memberId = String(body.p_member_id ?? "");
    const sport = String(body.p_sport ?? "");
    const ranking = body.p_ranking;
    if (
      !validStaff(user) ||
      !directory.some(({ member_id }) => member_id === memberId) ||
      !new Set(["padel", "tennis"]).has(sport) ||
      typeof body.p_active !== "boolean" ||
      (ranking !== null && (!Number.isInteger(ranking) || ranking < 1 || ranking > 5))
    ) {
      json(response, 403, { code: "42501", message: "sport profile rejected" });
      return;
    }
    sportProfileOverrides.set(`${memberId}:${sport}`, { active: body.p_active, ranking });
    json(response, 200, [{ member_id: memberId, sport, active: body.p_active, ranking }]);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/admin_set_profile_role") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const target = [...authUsers.values()].find(({ id }) => id === body.p_target_profile_id);
    if (!user || !exactKeys(body, ["p_target_profile_id", "p_role"]) || user.role !== "admin" || !user.active || !target?.membership || target.id === user.id || !new Set(["participant", "planner", "admin"]).has(body.p_role)) {
      json(response, 403, { code: "42501", message: "role update rejected" });
      return;
    }
    target.role = body.p_role;
    json(response, 200, [{ profile_id: target.id, role: target.role }]);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/admin_delete_tos_event") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const eventIndex = tosEvents.findIndex(({ id }) => id === body.p_event_id);
    if (!user || !exactKeys(body, ["p_event_id"]) || user.role !== "admin" || !user.active || eventIndex < 0) {
      json(response, 403, { code: "42501", message: "event delete rejected" });
      return;
    }
    const [deleted] = tosEvents.splice(eventIndex, 1);
    for (const [key, registration] of registrations) if (registration.event_id === deleted.id) registrations.delete(key);
    plannerDrafts.delete(deleted.id);
    for (const [key, schedule] of staffSchedules) if (schedule.event_id === deleted.id) staffSchedules.delete(key);
    json(response, 200, true);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/admin_delete_member_account") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const memberId = String(body.p_member_id ?? "");
    const target = [...authUsers.values()].find((candidate) => candidate.membership?.id === memberId);
    const activeParticipation = [...registrations.values()].some((registration) =>
      registration.member_id === memberId && registration.response === "attending" &&
      new Date(eventById(registration.event_id)?.ends_at ?? 0) > new Date());
    if (!user || !exactKeys(body, ["p_member_id"]) || user.role !== "admin" || !user.active ||
        user.membership?.id === memberId || !target || activeParticipation) {
      json(response, activeParticipation ? 409 : 403, {
        code: activeParticipation ? "55000" : "42501",
        message: "member delete rejected",
      });
      return;
    }
    authUsers.delete(target.email);
    for (const [token, sessionUser] of sessions) if (sessionUser.id === target.id) sessions.delete(token);
    for (const [key, registration] of registrations) if (registration.member_id === memberId) registrations.delete(key);
    for (const key of sportProfileOverrides.keys()) if (key.startsWith(`${memberId}:`)) sportProfileOverrides.delete(key);
    for (const [key, contact] of historyContactRequests) {
      if (contact.requester === memberId || contact.recipient === memberId) historyContactRequests.delete(key);
    }
    json(response, 200, true);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/my_tos_history") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, [])) { json(response, user ? 400 : 401, { code: "42501", message: "history rejected" }); return; }
    json(response, 200, validParticipant(user) && !user.email.startsWith("empty-history") ? [{
      event_id: HISTORY_EVENT_ID, title: "Zomeravond TOS", sport: "padel",
      starts_at: "2026-07-17T18:00:00.000Z", ends_at: "2026-07-17T20:00:00.000Z",
      match_count: 1, rest_count: 1, rounds: [
        { round_number: 1, starts_at: "2026-07-17T18:00:00.000Z", ends_at: "2026-07-17T18:20:00.000Z", state: "playing", court_name: "Kremer Baan", partners: [{ member_id: HISTORY_CLUBMATE_ID, display_name: "Ready Hele Avond" }], opponents: [{ member_id: null, display_name: "Gastspeler" }] },
        { round_number: 2, starts_at: "2026-07-17T18:20:00.000Z", ends_at: "2026-07-17T18:40:00.000Z", state: "rest", court_name: null, partners: [], opponents: [] },
      ],
    }] : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/my_tos_clubmates") {
    const user = bearerUser(request); const body = await requestJson(request);
    if (!user || !exactKeys(body, [])) { json(response, user ? 400 : 401, { code: "42501", message: "clubmates rejected" }); return; }
    json(response, 200, validParticipant(user) && !user.email.startsWith("empty-history") ? [{ member_id: HISTORY_CLUBMATE_ID, display_name: "Ready Hele Avond", shared_matches: 1, shared_events: 1, last_shared_at: "2026-07-17T20:00:00.000Z" }] : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/my_shared_tos_history") {
    const user = bearerUser(request); const body = await requestJson(request);
    if (!user || !exactKeys(body, ["p_other_member_id"])) { json(response, user ? 400 : 401, { code: "42501", message: "shared history rejected" }); return; }
    json(response, 200, validParticipant(user) && !user.email.startsWith("empty-history") && body.p_other_member_id === HISTORY_CLUBMATE_ID ? [{ event_id: HISTORY_EVENT_ID, title: "Zomeravond TOS", sport: "padel", starts_at: "2026-07-17T18:00:00.000Z", shared_matches: 1 }] : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/my_history_contact_requests") {
    const user = bearerUser(request); const body = await requestJson(request);
    if (!user || !exactKeys(body, [])) { json(response, user ? 400 : 401, { code: "42501", message: "contacts rejected" }); return; }
    const ownMemberId = user.membership?.id;
    const values = validParticipant(user) ? [...historyContactRequests.values()].filter((item) => item.requester === ownMemberId || item.recipient === ownMemberId).map((item) => ({
      request_id: item.id,
      other_member_id: item.requester === ownMemberId ? item.recipient : item.requester,
      display_name: "Ready Hele Avond", status: item.status,
      direction: item.requester === ownMemberId ? "outgoing" : "incoming",
      created_at: item.created_at, responded_at: item.responded_at,
    })) : [];
    json(response, 200, values); return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/request_history_contact") {
    const user = bearerUser(request); const body = await requestJson(request);
    if (!validParticipant(user) || !exactKeys(body, ["p_other_member_id"]) || body.p_other_member_id !== HISTORY_CLUBMATE_ID || body.p_other_member_id === user.membership.id) { json(response, 403, { code: "42501", message: "contact rejected" }); return; }
    const id = randomUUID(); historyContactRequests.set(id, { id, requester: user.membership.id, recipient: HISTORY_CLUBMATE_ID, status: "pending", created_at: new Date().toISOString(), responded_at: null }); json(response, 200, id); return;
  }
  if (request.method === "POST" && new Set(["/rest/v1/rpc/respond_history_contact", "/rest/v1/rpc/cancel_history_contact", "/rest/v1/rpc/revoke_history_contact"]).has(requestUrl.pathname)) {
    const user = bearerUser(request); const body = await requestJson(request); const requestId = body.p_request_id; const item = historyContactRequests.get(requestId);
    const expected = requestUrl.pathname.endsWith("respond_history_contact") ? ["p_request_id", "p_accept"] : ["p_request_id"];
    const isRespond = requestUrl.pathname.endsWith("respond_history_contact");
    const isCancel = requestUrl.pathname.endsWith("cancel_history_contact");
    const allowed = item && (
      (isRespond && item.status === "pending" && item.recipient === user?.membership?.id) ||
      (isCancel && item.status === "pending" && item.requester === user?.membership?.id) ||
      (!isRespond && !isCancel && item.status === "accepted" && [item.requester, item.recipient].includes(user?.membership?.id))
    );
    if (!validParticipant(user) || !exactKeys(body, expected) || !allowed) { json(response, 403, { code: "42501", message: "contact mutation rejected" }); return; }
    item.status = isRespond ? (body.p_accept ? "accepted" : "declined") : "revoked";
    item.responded_at = new Date().toISOString(); json(response, 200, true); return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/my_accepted_history_contact") {
    const user = bearerUser(request); const body = await requestJson(request);
    if (!validParticipant(user) || !exactKeys(body, ["p_other_member_id"])) { json(response, user ? 400 : 401, { code: "42501", message: "contact detail rejected" }); return; }
    const accepted = [...historyContactRequests.values()].some((item) => item.status === "accepted" && [item.requester, item.recipient].includes(user.membership.id) && [item.requester, item.recipient].includes(body.p_other_member_id));
    json(response, 200, accepted ? [{ contact_email: "clubgenoot@example.test" }] : []); return;
  }
  if (
    request.method === "POST" &&
    requestUrl.pathname === "/rest/v1/rpc/staff_event_planner_input"
  ) {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    if (!exactKeys(body, ["p_event_id"])) {
      rejectMockContract(response, "staff plannerinput-RPC bevat onverwachte velden");
      return;
    }
    const eventId = String(body.p_event_id ?? "");
    if (!validStaff(user) || !eventById(eventId)) {
      json(response, 200, []);
      return;
    }
    const event = eventById(eventId);
    json(response, 200, staffOverview(event)
      .filter(({ placement_status }) => placement_status === "placed")
      .map((fixture) => Object.fromEntries(
        Object.entries(fixture).filter(
          ([key]) => key !== "placement_status" && key !== "waitlist_position",
        ),
      )));
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_courts") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, ["p_sport"]) || !validStaff(user)) {
      json(response, user ? 200 : 401, user ? [] : { code: "42501", message: "court read rejected" });
      return;
    }
    const sport = body.p_sport;
    const rows = [...clubCourts.values()]
      .filter((court) => sport === null || court.sport === sport)
      .sort((left, right) => left.sport.localeCompare(right.sport) || left.sort_order - right.sort_order || left.name.localeCompare(right.name));
    json(response, 200, rows);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_create_court") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const expected = ["p_sport","p_name","p_active","p_sort_order"];
    const name = typeof body.p_name === "string" ? body.p_name.trim() : "";
    const valid = user && validStaff(user) && exactKeys(body, expected) && ["padel","tennis"].includes(body.p_sport) &&
      name && name.length <= 80 && typeof body.p_active === "boolean" && Number.isInteger(body.p_sort_order) &&
      body.p_sort_order >= 0 && body.p_sort_order <= 10000 &&
      ![...clubCourts.values()].some((court) => court.sport === body.p_sport && court.name.toLowerCase() === name.toLowerCase());
    if (!valid) { json(response, 403, { code: "42501", message: "court create rejected" }); return; }
    const id = randomUUID();
    clubCourts.set(id, { id, sport: body.p_sport, name, active: body.p_active, sort_order: body.p_sort_order });
    json(response, 200, id); return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_update_court") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const expected = ["p_court_id","p_name","p_active","p_sort_order"];
    const court = clubCourts.get(body.p_court_id);
    const name = typeof body.p_name === "string" ? body.p_name.trim() : "";
    const valid = user && validStaff(user) && exactKeys(body, expected) && court && name && name.length <= 80 &&
      typeof body.p_active === "boolean" && Number.isInteger(body.p_sort_order) && body.p_sort_order >= 0 && body.p_sort_order <= 10000 &&
      ![...clubCourts.values()].some((candidate) => candidate.id !== court.id && candidate.sport === court.sport && candidate.name.toLowerCase() === name.toLowerCase());
    if (!valid) { json(response, 403, { code: "42501", message: "court update rejected" }); return; }
    Object.assign(court, { name, active: body.p_active, sort_order: body.p_sort_order });
    json(response, 200, true); return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_event_planner_draft") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, ["p_event_id"])) {
      json(response, user ? 400 : 401, { code: "42501", message: "draft read rejected" });
      return;
    }
    const eventId = String(body.p_event_id ?? "");
    const event = eventById(eventId);
    const draft = plannerDrafts.get(eventId);
    json(response, 200, validStaff(user) && event && draft ? [draft] : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_save_event_planner_draft") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const expected = ["p_event_id","p_expected_revision","p_players","p_selected_courts","p_match_minutes","p_rest_minutes","p_search_profile","p_allow_repeat_partners","p_level_mix","p_team_difference_tolerance"];
    const event = eventById(String(body.p_event_id ?? ""));
    const current = plannerDrafts.get(body.p_event_id);
    const allowedPlayerKeys = new Set(["row_id","name","ranking","included","available_from","available_until","member_id","user_id","registration_id","registration_updated_at","source_event_id"]);
    const validPlayers = Array.isArray(body.p_players) && body.p_players.every((player) =>
      player && typeof player === "object" && !Array.isArray(player) &&
      Object.keys(player).every((key) => allowedPlayerKeys.has(key)) &&
      ["row_id","name","ranking","included","available_from","available_until"].every((key) => Object.hasOwn(player, key)));
    const validCourts = Array.isArray(body.p_selected_courts) && new Set(body.p_selected_courts).size === body.p_selected_courts.length &&
      body.p_selected_courts.every((id) => clubCourts.get(id)?.sport === event?.sport);
    if (!user || !validStaff(user) || !exactKeys(body, expected) || !validPlayers || !validCourts || !event || event.status === "cancelled") {
      json(response, 403, { code: "42501", message: "draft save rejected" });
      return;
    }
    if ((current?.revision ?? 0) !== body.p_expected_revision) {
      json(response, 409, { code: "40001", message: "draft changed" });
      return;
    }
    const revision = (current?.revision ?? 0) + 1;
    const now = new Date().toISOString();
    plannerDrafts.set(body.p_event_id, {
      event_id: body.p_event_id, players: body.p_players, selected_courts: body.p_selected_courts,
      match_minutes: body.p_match_minutes, rest_minutes: body.p_rest_minutes,
      search_profile: body.p_search_profile, allow_repeat_partners: body.p_allow_repeat_partners,
      level_mix: body.p_level_mix, team_difference_tolerance: body.p_team_difference_tolerance,
      revision, updated_by: user.id, updated_by_name: user.role === "admin" ? "Admin" : "Planner",
      updated_at: now, created_at: current?.created_at ?? now,
    });
    json(response, 200, revision);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_event_schedule_summaries") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user || !exactKeys(body, ["p_event_id"])) {
      json(response, 401, { code: "42501", message: "schedule read rejected" });
      return;
    }
    const values = validStaff(user) ? [...staffSchedules.values()]
      .filter(({ event_id }) => event_id === body.p_event_id)
      .map((item) => ({
        id: item.id, event_id: item.event_id, created_by: item.created_by,
        created_by_name: item.created_by_name, is_published: item.is_published,
        generation_seed: item.generation_seed, planner_draft_revision: item.planner_draft_revision,
        created_at: item.created_at,
      })) : [];
    json(response, 200, values);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_save_event_schedule") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const expected = ["p_event_id","p_planner_draft_revision","p_generation_seed","p_schedule_private","p_history_identity_private","p_statistics_private","p_diagnostics"];
    const event = eventById(String(body.p_event_id ?? ""));
    const draft = plannerDrafts.get(body.p_event_id);
    const scheduleKeys = ["Ronde","Tijd","Baan","Team 1","Niveau T1","Team 2","Niveau T2","Teamverschil","Rust","Nog niet aanwezig","Niet meer beschikbaar"];
    const validSchedule = Array.isArray(body.p_schedule_private) && body.p_schedule_private.length > 0 &&
      body.p_schedule_private.every((row) => exactKeys(row, scheduleKeys));
    const courtNames = Array.isArray(draft?.selected_courts) ? draft.selected_courts.map((id) => clubCourts.get(id)?.name) : [];
    const validCourts = courtNames.length > 0 && courtNames.every(Boolean) && body.p_schedule_private?.every((row) => courtNames.includes(row.Baan));
    if (!user || !validStaff(user) || !exactKeys(body, expected) || !validSchedule || !validCourts || !event || !draft || draft.revision !== body.p_planner_draft_revision) {
      json(response, 403, { code: "42501", message: "schedule save rejected" });
      return;
    }
    const id = randomUUID();
    staffSchedules.set(id, {
      id, event_id: event.id, created_by: user.id, created_by_name: user.role === "admin" ? "Admin" : "Planner",
      title: event.title, event_date: event.starts_at.slice(0, 10), start_time: "20:00", end_time: "22:00",
      match_minutes: draft.match_minutes, courts: courtNames, players_private: draft.players,
      participants_public: draft.players.filter(({ included }) => included).map(({ name }) => name),
      schedule_public: body.p_schedule_private.map((row) => Object.fromEntries([
        "Ronde", "Tijd", "Baan", "Team 1", "Team 2", "Rust", "Nog niet aanwezig", "Niet meer beschikbaar",
      ].map((key) => [key, row[key]]))),
      schedule_private: body.p_schedule_private, statistics_private: body.p_statistics_private,
      history_identity_private: body.p_history_identity_private,
      diagnostics: body.p_diagnostics, is_published: false, generation_seed: body.p_generation_seed,
      planner_draft_revision: body.p_planner_draft_revision, created_at: new Date().toISOString(),
    });
    json(response, 200, id);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_event_schedule") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const schedule = staffSchedules.get(body.p_schedule_id);
    if (!user || !exactKeys(body, ["p_event_id","p_schedule_id"])) {
      json(response, 401, { code: "42501", message: "schedule detail rejected" });
      return;
    }
    json(response, 200, validStaff(user) && schedule?.event_id === body.p_event_id ? [{
      id: schedule.id, event_id: schedule.event_id, created_by: schedule.created_by,
      created_by_name: schedule.created_by_name, title: schedule.title, event_date: schedule.event_date,
      start_time: schedule.start_time, end_time: schedule.end_time, match_minutes: schedule.match_minutes,
      courts: schedule.courts, players_private: schedule.players_private,
      schedule_private: schedule.schedule_private, statistics_private: schedule.statistics_private,
      diagnostics: schedule.diagnostics, is_published: schedule.is_published,
      generation_seed: schedule.generation_seed, planner_draft_revision: schedule.planner_draft_revision,
      created_at: schedule.created_at,
    }] : []);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/staff_set_schedule_published") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const schedule = staffSchedules.get(body.p_schedule_id);
    if (!user || !exactKeys(body, ["p_schedule_id","p_published"]) || !validStaff(user) || !schedule || (schedule.created_by !== user.id && user.role !== "admin")) {
      json(response, 403, { code: "42501", message: "publish rejected" });
      return;
    }
    if (body.p_published) for (const candidate of staffSchedules.values()) if (candidate.event_id === schedule.event_id) candidate.is_published = false;
    schedule.is_published = body.p_published;
    json(response, 200, true);
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/rest/v1/tos_events") {
    const user = bearerUser(request);
    if (singleQueryValue(requestUrl, "select") !== TOS_EVENT_COLUMNS.join(",")) {
      rejectMockContract(response, "eventprojectie wijkt af");
      return;
    }
    const slug = eqValue(requestUrl, "slug");
    if (slug !== null) {
      const allowed = new Set(["select", "slug", "status", "limit"]);
      const status = eqValue(requestUrl, "status");
      if (
        !hasOnlyQueryKeys(requestUrl, allowed) ||
        singleQueryValue(requestUrl, "limit") !== "2" ||
        (!user && status !== "open") ||
        (status !== null && status !== "open")
      ) {
        rejectMockContract(response, "eventdetailfilter wijkt af");
        return;
      }
      const event = tosEvents.find((candidate) => candidate.slug === slug) ?? null;
      json(
        response,
        200,
        event && (!status || event.status === status) && visibleEventForUser(event, user)
          ? [event]
          : [],
      );
      return;
    }
    const id = eqValue(requestUrl, "id");
    if (id !== null) {
      if (!validStaff(user) || !hasOnlyQueryKeys(requestUrl, new Set(["select", "id", "limit"])) ||
          singleQueryValue(requestUrl, "limit") !== "2") {
        rejectMockContract(response, "staff event-ID filter wijkt af");
        return;
      }
      const event = eventById(id);
      json(response, 200, event ? [event] : []);
      return;
    }
    if (
      validStaff(user) &&
      hasOnlyQueryKeys(requestUrl, new Set(["select", "order"])) &&
      singleQueryValue(requestUrl, "order") === "starts_at.desc"
    ) {
      json(response, 200, [...tosEvents].sort((left, right) =>
        new Date(right.starts_at) - new Date(left.starts_at)));
      return;
    }
    if (
      validParticipant(user) &&
      hasOnlyQueryKeys(requestUrl, new Set(["select", "status", "ends_at", "order"])) &&
      singleQueryValue(requestUrl, "status") === "in.(open,closed)" &&
      (singleQueryValue(requestUrl, "ends_at") === null || singleQueryValue(requestUrl, "ends_at")?.startsWith("gte.")) &&
      singleQueryValue(requestUrl, "order") === "starts_at.asc"
    ) {
      json(response, 200, homeEmptyUsers.has(user.id) ? [] : tosEvents
        .filter((event) => new Set(["open", "closed"]).has(event.status) &&
          (singleQueryValue(requestUrl, "ends_at") === null || new Date(event.ends_at) >= new Date()))
        .sort((left, right) => new Date(left.starts_at) - new Date(right.starts_at)));
      return;
    }
    const allowed = new Set(["select", "status", "ends_at", "or", "order"]);
    if (
      !user ||
      !hasOnlyQueryKeys(requestUrl, allowed) ||
      eqValue(requestUrl, "status") !== "open" ||
      !singleQueryValue(requestUrl, "ends_at")?.startsWith("gte.") ||
      !singleQueryValue(requestUrl, "or")?.includes("signup_deadline") ||
      singleQueryValue(requestUrl, "order") !== "starts_at.asc"
    ) {
      rejectMockContract(response, "open-eventfilters wijken af");
      return;
    }
    json(
      response,
      200,
      tosEvents
        .filter((event) =>
          event.status === "open" &&
          new Date(event.ends_at) >= new Date() &&
          (!event.signup_deadline || new Date(event.signup_deadline) >= new Date()))
        .sort((left, right) => new Date(left.starts_at) - new Date(right.starts_at)),
    );
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/tos_events") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    if (
      !validStaff(user) ||
      !hasOnlyQueryKeys(requestUrl, new Set()) ||
      !exactKeys(body, ["slug", "title", "sport", "starts_at", "ends_at", "signup_deadline", "status", "max_participants"])
    ) {
      json(response, 403, { code: "42501", message: "event insert rejected" });
      return;
    }
    if (!validEventPayload(body)) {
      const conflict = tosEvents.some(({ slug }) => slug === body.slug);
      json(response, conflict ? 409 : 400, { code: conflict ? "23505" : "23514", message: "event constraint rejected" });
      return;
    }
    tosEvents.push({
      id: randomUUID(),
      slug: body.slug,
      title: body.title.trim(),
      sport: body.sport,
      starts_at: new Date(body.starts_at).toISOString(),
      ends_at: new Date(body.ends_at).toISOString(),
      signup_deadline: body.signup_deadline === null ? null : new Date(body.signup_deadline).toISOString(),
      status: body.status,
      max_participants: body.max_participants,
    });
    json(response, 201, []);
    return;
  }
  if (request.method === "PATCH" && requestUrl.pathname === "/rest/v1/tos_events") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    const id = eqValue(requestUrl, "id");
    const slug = eqValue(requestUrl, "slug");
    const event = tosEvents.find((candidate) => candidate.id === id && candidate.slug === slug) ?? null;
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    if (
      !validStaff(user) ||
      !hasOnlyQueryKeys(requestUrl, new Set(["id", "slug"])) ||
      !event ||
      !exactKeys(body, ["title", "signup_deadline", "status", "max_participants"])
    ) {
      json(response, 403, { code: "42501", message: "event update rejected" });
      return;
    }
    const deadline = body.signup_deadline === null ? null : new Date(body.signup_deadline);
    if (
      typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 160 ||
      !new Set(["draft", "open", "closed", "cancelled"]).has(body.status) ||
      !Number.isInteger(body.max_participants) || body.max_participants < 1 || body.max_participants > 500 ||
      (deadline !== null && (Number.isNaN(deadline.getTime()) || deadline > new Date(event.starts_at)))
    ) {
      json(response, 400, { code: "23514", message: "event constraint rejected" });
      return;
    }
    Object.assign(event, {
      title: body.title.trim(),
      signup_deadline: deadline?.toISOString() ?? null,
      status: body.status,
      max_participants: body.max_participants,
    });
    json(response, 200, []);
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/rest/v1/registrations") {
    const user = bearerUser(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    const select = singleQueryValue(requestUrl, "select");
    if (eqValue(requestUrl, "user_id") !== user.id) {
      rejectMockContract(response, "eigen userfilter ontbreekt");
      return;
    }
    if (select === OWN_REGISTRATION_WITH_EVENT_SELECT) {
      const allowed = new Set(["select", "user_id", "tos_events.ends_at"]);
      if (
        !hasOnlyQueryKeys(requestUrl, allowed) ||
        !singleQueryValue(requestUrl, "tos_events.ends_at")?.startsWith("gte.")
      ) {
        rejectMockContract(response, "dashboardregistratiefilter wijkt af");
        return;
      }
      const result = homeEmptyUsers.has(user.id) ? [] : [...registrations.values()]
        .filter(({ user_id, event_id }) =>
          user_id === user.id && new Date(eventById(event_id)?.ends_at ?? 0) >= new Date())
        .sort((left, right) =>
          new Date(eventById(left.event_id).starts_at) -
          new Date(eventById(right.event_id).starts_at))
        .map((registration) => registrationRow(registration, true));
      json(response, 200, result);
      return;
    }
    if (select === OWN_REGISTRATION_SELECT) {
      const allowed = new Set(["select", "event_id", "user_id", "limit"]);
      const eventId = eqValue(requestUrl, "event_id");
      if (
        !hasOnlyQueryKeys(requestUrl, allowed) ||
        !eventId ||
        singleQueryValue(requestUrl, "limit") !== "2"
      ) {
        rejectMockContract(response, "eigen registratiefilter wijkt af");
        return;
      }
      const registration = registrationFor(user.id, eventId);
      json(response, 200, registration ? [registrationRow(registration)] : []);
      return;
    }
    rejectMockContract(response, "registrationprojectie wijkt af");
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/registrations") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    if (
      !hasOnlyQueryKeys(requestUrl, new Set(["select", "limit"])) ||
      singleQueryValue(requestUrl, "select") !== OWN_REGISTRATION_SELECT ||
      singleQueryValue(requestUrl, "limit") !== "2" ||
      !exactKeys(body, ["event_id", "response", "available_from", "available_until"])
    ) {
      rejectMockContract(response, "registrationinsert bevat verboden velden");
      return;
    }
    const event = eventById(String(body.event_id ?? ""));
    if (!event || !validParticipant(user) || !selfServiceOpen(event)) {
      json(response, 403, { code: "42501", message: "registration rejected" });
      return;
    }
    if (registrationFor(user.id, event.id)) {
      json(response, 409, { code: "23505", message: "duplicate registration" });
      return;
    }
    const availability = registrationAvailability(
      event,
      body.response,
      body.available_from,
      body.available_until,
    );
    if (!availability) {
      json(response, 400, { code: "22007", message: "invalid availability" });
      return;
    }
    const now = new Date().toISOString();
    const registration = {
      id: randomUUID(),
      event_id: event.id,
      user_id: user.id,
      member_id: user.membership.id,
      response: body.response,
      available_from: availability.from,
      available_until: availability.until,
      attending_since: body.response === "attending" ? now : null,
      source: "self",
      created_at: now,
      updated_at: now,
    };
    registrations.set(registrationKey(user.id, event.id), registration);
    json(response, 201, [registrationRow(registration)]);
    return;
  }
  if (request.method === "PATCH" && requestUrl.pathname === "/rest/v1/registrations") {
    const user = bearerUser(request);
    const body = await requestJson(request);
    if (!user) {
      json(response, 401, { code: "PGRST301", message: "invalid JWT" });
      return;
    }
    const allowed = new Set(["select", "id", "user_id", "event_id", "limit"]);
    const eventId = eqValue(requestUrl, "event_id");
    const registration = eventId ? registrationFor(user.id, eventId) : null;
    if (
      !hasOnlyQueryKeys(requestUrl, allowed) ||
      singleQueryValue(requestUrl, "select") !== OWN_REGISTRATION_SELECT ||
      singleQueryValue(requestUrl, "limit") !== "2" ||
      eqValue(requestUrl, "user_id") !== user.id ||
      !registration ||
      eqValue(requestUrl, "id") !== registration.id ||
      !exactKeys(body, ["response", "available_from", "available_until"])
    ) {
      rejectMockContract(response, "registrationupdate bevat verboden velden of filters");
      return;
    }
    const event = eventById(eventId);
    if (!event || !validParticipant(user) || !selfServiceOpen(event)) {
      json(response, 403, { code: "42501", message: "registration rejected" });
      return;
    }
    const availability = registrationAvailability(
      event,
      body.response,
      body.available_from,
      body.available_until,
    );
    if (!availability) {
      json(response, 400, { code: "22007", message: "invalid availability" });
      return;
    }
    Object.assign(registration, {
      response: body.response,
      available_from: availability.from,
      available_until: availability.until,
      attending_since: body.response === "attending"
        ? registration.response === "attending"
          ? registration.attending_since
          : new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    });
    json(response, 200, [registrationRow(registration)]);
    return;
  }
  if (request.method === "DELETE" && requestUrl.pathname === "/rest/v1/registrations") {
    rejectMockContract(response, "DELETE is verboden");
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/public_live_schedule_candidates") {
    const body = await requestJson(request);
    if (!exactKeys(body, [])) { rejectMockContract(response, "live resolver bevat onverwachte velden"); return; }
    const delay = nextDelayMilliseconds;
    nextDelayMilliseconds = 0;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const published = [...staffSchedules.values()].filter(({ is_published }) => is_published)
      .map((schedule) => ({ schedule, event: eventById(schedule.event_id) }))
      .filter(({ event }) => event && event.status !== "cancelled")
      .map(({ event }) => ({ slug: event.slug, title: event.title, sport: event.sport, starts_at: event.starts_at, ends_at: event.ends_at }));
    if (published.length) { json(response, 200, published); return; }
    const now = Date.now();
    json(response, 200, [{
      slug: "live-schema", title: "Live TOS-schema", sport: "padel",
      starts_at: new Date(now - 20 * 60_000).toISOString(),
      ends_at: new Date(now + 55 * 60_000).toISOString(),
    }]);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/public_event_live_schedule") {
    const body = await requestJson(request);
    if (!exactKeys(body, ["p_slug"]) || typeof body.p_slug !== "string") {
      rejectMockContract(response, "event live read bevat onverwachte velden"); return;
    }
    if (["personal-live", "personal-past", "personal-future"].includes(body.p_slug)) { json(response, 200, [personalLiveFixture(body.p_slug)]); return; }
    const event = tosEvents.find((candidate) => candidate.slug === body.p_slug && candidate.status !== "cancelled");
    const eventSchedule = event ? [...staffSchedules.values()]
      .filter((schedule) => schedule.event_id === event.id && schedule.is_published)
      .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] : null;
    if (event && eventSchedule) {
      json(response, 200, [{
        id: eventSchedule.id, event_slug: event.slug, event_title: event.title, event_sport: event.sport,
        event_starts_at: event.starts_at, event_ends_at: event.ends_at, event_date: eventSchedule.event_date,
        created_by_name: eventSchedule.created_by_name, start_time: eventSchedule.start_time, end_time: eventSchedule.end_time,
        courts: eventSchedule.courts, participants_public: eventSchedule.participants_public,
        schedule_public: eventSchedule.schedule_public, is_published: true, created_at: eventSchedule.created_at,
      }]);
      return;
    }
    if (body.p_slug !== "live-schema") { json(response, 200, []); return; }
    const fixture = scheduleFixture();
    const now = Date.now();
    json(response, 200, [{
      ...fixture, event_slug: "live-schema", event_title: "Live TOS-schema", event_sport: "padel",
      event_starts_at: new Date(now - 20 * 60_000).toISOString(),
      event_ends_at: new Date(now + 55 * 60_000).toISOString(),
    }]);
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/my_published_event_schedule_identity") {
    const body = await requestJson(request);
    const user = bearerUser(request);
    if (!user) { json(response, 403, { code: "42501" }); return; }
    if (!exactKeys(body, ["p_slug"])) { rejectMockContract(response, "unexpected identity arguments"); return; }
    const matches = validParticipant(user) && body.p_slug === "personal-live" && user.email.startsWith("live-member");
    json(response, 200, matches ? [{ schedule_id: "a4600000-0000-4000-8000-000000000099", player_key: LIVE_KEYS[user.email.includes("rest") ? 4 : 1] }] : []);
    return;
  }
  if (request.method !== "GET") {
    json(response, 405, { error: "method not allowed" });
    return;
  }

  const contractError = validateScheduleRequest(requestUrl);
  if (contractError) {
    console.error(`Public schedule mock weigerde request: ${contractError}.`);
    json(response, 422, { error: "public schedule query contract rejected" });
    return;
  }

  const delay = nextDelayMilliseconds;
  nextDelayMilliseconds = 0;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  const eventSchedule = [...staffSchedules.values()]
    .filter(({ is_published }) => is_published)
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0];
  json(response, 200, [eventSchedule ? {
    id: eventSchedule.id,
    event_date: eventSchedule.event_date,
    created_by_name: eventSchedule.created_by_name,
    start_time: eventSchedule.start_time,
    end_time: eventSchedule.end_time,
    courts: eventSchedule.courts,
    participants_public: eventSchedule.participants_public,
    schedule_public: eventSchedule.schedule_public,
    is_published: true,
    created_at: eventSchedule.created_at,
  } : scheduleFixture()]);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Public schedule mock luistert lokaal op poort ${port}.`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
