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
const jwtSecret = randomBytes(32);
const authUsers = new Map();
const sessions = new Map();
const otpCodes = new Map();
const oauthCodes = new Map();
let nextOAuthAttempt = null;
let attendeeFailureEventId = null;

const TOS_EVENT_COLUMNS = [
  "id",
  "slug",
  "title",
  "sport",
  "starts_at",
  "ends_at",
  "signup_deadline",
  "status",
];
const OWN_REGISTRATION_COLUMNS = [
  "id",
  "event_id",
  "response",
  "available_from",
  "available_until",
  "created_at",
  "updated_at",
];
const OWN_REGISTRATION_SELECT = OWN_REGISTRATION_COLUMNS.join(",");
const OWN_REGISTRATION_WITH_EVENT_SELECT =
  `${OWN_REGISTRATION_SELECT},tos_events!inner(${TOS_EVENT_COLUMNS.join(",")})`;
const registrations = new Map();
const plannerDrafts = new Map();
const staffSchedules = new Map();

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
  return validStaff(user) || event.status === "open" || Boolean(user && registrationFor(user.id, event.id));
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
  if (request.method === "POST" && requestUrl.pathname === "/__test/reset-state") {
    tosEvents.splice(0, tosEvents.length, ...initialTosEvents.map((event) => ({ ...event })));
    authUsers.clear();
    sessions.clear();
    otpCodes.clear();
    oauthCodes.clear();
    registrations.clear();
    plannerDrafts.clear();
    staffSchedules.clear();
    nextOAuthAttempt = null;
    attendeeFailureEventId = null;
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/generate") {
    const body = await requestJson(request);
    const expected = ["players","courts","start_time","end_time","match_minutes","rest_minutes","search_profile","allow_repeat_partners","level_mix","tolerance","generation_seed"];
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
    const names = body.players.map(({ name }) => String(name));
    json(response, 200, {
      seed: body.generation_seed,
      schedule: body.courts.map((court, index) => ({
        Ronde: 1, Tijd: `${body.start_time} - ${body.end_time}`, Baan: court,
        "Team 1": `${names[index * 4]} & ${names[index * 4 + 1]}`, "Niveau T1": 3,
        "Team 2": `${names[index * 4 + 2]} & ${names[index * 4 + 3]}`, "Niveau T2": 3,
        Teamverschil: 0, Rust: "Niemand", "Nog niet aanwezig": "Niemand",
        "Niet meer beschikbaar": "Niemand",
      })),
      statistics: names.map((name) => ({ Speler: name, Ranking: 3, Wedstrijden: 1 })),
      diagnostics: { rounds: 1, unused_minutes: 0, courts_used: body.courts.length },
    });
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
      display_name: "Testlid",
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
    json(response, 200, staffPlannerInputFixtures
      .filter(({ event_id }) => event_id === eventId)
      .map((fixture) => Object.fromEntries(
        Object.entries(fixture).filter(([key]) => key !== "event_id"),
      )));
    return;
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
    json(response, 200, validStaff(user) && event?.sport === "padel" && draft ? [draft] : []);
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
    if (!user || !validStaff(user) || !exactKeys(body, expected) || !validPlayers || event?.sport !== "padel" || event.status === "cancelled") {
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
    const expected = ["p_event_id","p_planner_draft_revision","p_generation_seed","p_schedule_private","p_statistics_private","p_diagnostics"];
    const event = eventById(String(body.p_event_id ?? ""));
    const draft = plannerDrafts.get(body.p_event_id);
    const scheduleKeys = ["Ronde","Tijd","Baan","Team 1","Niveau T1","Team 2","Niveau T2","Teamverschil","Rust","Nog niet aanwezig","Niet meer beschikbaar"];
    const validSchedule = Array.isArray(body.p_schedule_private) && body.p_schedule_private.length > 0 &&
      body.p_schedule_private.every((row) => exactKeys(row, scheduleKeys));
    if (!user || !validStaff(user) || !exactKeys(body, expected) || !validSchedule || event?.sport !== "padel" || !draft || draft.revision !== body.p_planner_draft_revision) {
      json(response, 403, { code: "42501", message: "schedule save rejected" });
      return;
    }
    const id = randomUUID();
    staffSchedules.set(id, {
      id, event_id: event.id, created_by: user.id, created_by_name: user.role === "admin" ? "Admin" : "Planner",
      title: event.title, event_date: event.starts_at.slice(0, 10), start_time: "20:00", end_time: "22:00",
      match_minutes: draft.match_minutes, courts: draft.selected_courts, players_private: draft.players,
      participants_public: draft.players.filter(({ included }) => included).map(({ name }) => name),
      schedule_public: body.p_schedule_private.map((row) => Object.fromEntries([
        "Ronde", "Tijd", "Baan", "Team 1", "Team 2", "Rust", "Nog niet aanwezig", "Niet meer beschikbaar",
      ].map((key) => [key, row[key]]))),
      schedule_private: body.p_schedule_private, statistics_private: body.p_statistics_private,
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
    if (
      validStaff(user) &&
      hasOnlyQueryKeys(requestUrl, new Set(["select", "order"])) &&
      singleQueryValue(requestUrl, "order") === "starts_at.desc"
    ) {
      json(response, 200, [...tosEvents].sort((left, right) =>
        new Date(right.starts_at) - new Date(left.starts_at)));
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
      !exactKeys(body, ["slug", "title", "sport", "starts_at", "ends_at", "signup_deadline", "status"])
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
      !exactKeys(body, ["title", "signup_deadline", "status"])
    ) {
      json(response, 403, { code: "42501", message: "event update rejected" });
      return;
    }
    const deadline = body.signup_deadline === null ? null : new Date(body.signup_deadline);
    if (
      typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 160 ||
      !new Set(["draft", "open", "closed", "cancelled"]).has(body.status) ||
      (deadline !== null && (Number.isNaN(deadline.getTime()) || deadline > new Date(event.starts_at)))
    ) {
      json(response, 400, { code: "23514", message: "event constraint rejected" });
      return;
    }
    Object.assign(event, {
      title: body.title.trim(),
      signup_deadline: deadline?.toISOString() ?? null,
      status: body.status,
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
      const result = [...registrations.values()]
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
      updated_at: new Date().toISOString(),
    });
    json(response, 200, [registrationRow(registration)]);
    return;
  }
  if (request.method === "DELETE" && requestUrl.pathname === "/rest/v1/registrations") {
    rejectMockContract(response, "DELETE is verboden");
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
