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
  if (email.startsWith("admin-member")) return "admin";
  if (email.startsWith("admin-no-member")) return "admin";
  if (email.startsWith("planner-no-member")) return "planner";
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

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin": "http://127.0.0.1:31000",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "access-control-allow-methods": "GET, POST, OPTIONS",
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
      "access-control-allow-methods": "GET, POST, OPTIONS",
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
  json(response, 200, [scheduleFixture()]);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Public schedule mock luistert lokaal op poort ${port}.`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
