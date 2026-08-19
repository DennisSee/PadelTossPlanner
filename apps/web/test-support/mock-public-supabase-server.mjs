import { createServer } from "node:http";

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
  });
  response.end(payload);
}

const port = readPort();
let nextDelayMilliseconds = 0;
const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

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
