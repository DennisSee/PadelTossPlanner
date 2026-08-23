import { pathToFileURL } from "node:url";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const POLL_INTERVAL_MS = 60_000;

export class NotificationConfigurationError extends Error {
  constructor() {
    super("EMAIL_DELIVERY_RUNTIME_CONFIG_REQUIRED");
    this.name = "NotificationConfigurationError";
  }
}

export function readNotificationConfig(environment = process.env) {
  const appBaseUrl = environment.APP_BASE_URL?.trim() ?? "";
  const supabaseUrl = environment.SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const resendApiKey = environment.RESEND_API_KEY?.trim() ?? "";
  const fromEmail = environment.NOTIFICATION_FROM_EMAIL?.trim() ?? "";
  try {
    const app = new URL(appBaseUrl);
    const supabase = new URL(supabaseUrl);
    if (
      app.protocol !== "https:" || app.pathname !== "/" || app.search || app.hash ||
      supabase.protocol !== "https:" || !supabase.hostname.endsWith(".supabase.co") ||
      serviceRoleKey.length < 32 || !resendApiKey.startsWith("re_") || !EMAIL.test(fromEmail)
    ) throw new NotificationConfigurationError();
    return Object.freeze({
      appBaseUrl: app.toString().replace(/\/$/u, ""),
      supabaseUrl: supabase.toString().replace(/\/$/u, ""),
      serviceRoleKey, resendApiKey, fromEmail,
    });
  } catch (error) {
    if (error instanceof NotificationConfigurationError) throw error;
    throw new NotificationConfigurationError();
  }
}

function records(value) {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error("invalid-worker-response");
  }
  return value;
}

function value(row, key) {
  const result = row[key];
  if (typeof result !== "string" || !result) throw new Error("invalid-worker-response");
  return result;
}

function target(valueToParse) {
  const rows = records(valueToParse);
  if (!rows.length) return null;
  if (rows.length !== 1) throw new Error("invalid-worker-response");
  const row = rows[0];
  const sport = value(row, "event_sport");
  if (sport !== "padel" && sport !== "tennis") throw new Error("invalid-worker-response");
  return Object.freeze({
    notificationId: value(row, "notification_id"),
    recipientEmail: value(row, "recipient_email"),
    eventTitle: value(row, "event_title"),
    eventSlug: value(row, "event_slug"),
    eventSport: sport,
    eventStartsAt: value(row, "event_starts_at"),
  });
}

async function rpc(config, name, body, request) {
  const response = await request(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("worker-rpc-failed");
  return response.json();
}

function escapeHtml(input) {
  return input.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function eventDate(input) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "full", timeStyle: "short", timeZone: "Europe/Amsterdam",
  }).format(new Date(input));
}

export async function sendPromotionEmail(deliveryTarget, config, request = fetch) {
  const eventName = deliveryTarget.eventTitle.trim()
    || `${deliveryTarget.eventSport === "padel" ? "Padel" : "Tennis"} TOS-avond`;
  const eventUrl = new URL(`/tos/${encodeURIComponent(deliveryTarget.eventSlug)}`, config.appBaseUrl).toString();
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.fromEmail,
      to: [deliveryTarget.recipientEmail],
      subject: `Je bent geplaatst voor ${eventName}`,
      text: `Er is een plek vrijgekomen. Je staat nu op de deelnemerslijst voor ${eventName} op ${eventDate(deliveryTarget.eventStartsAt)}. Bekijk je aanmelding: ${eventUrl}`,
      html: `<p>Er is een plek vrijgekomen. Je staat nu op de deelnemerslijst voor <strong>${escapeHtml(eventName)}</strong> op ${escapeHtml(eventDate(deliveryTarget.eventStartsAt))}.</p><p><a href="${escapeHtml(eventUrl)}">Bekijk je aanmelding</a></p>`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.ok) return { success: true, errorCode: null };
  return { success: false, errorCode: response.status === 429 || response.status >= 500
    ? "provider-temporary" : "provider-rejected" };
}

export async function deliverWaitlistPromotions(config, request = fetch, limit = 10) {
  const claims = records(await rpc(config, "claim_waitlist_promotion_notifications", { p_limit: limit }, request));
  const ids = claims.map((row) => value(row, "notification_id"));
  const result = { claimed: ids.length, sent: 0, skipped: 0, failed: 0 };
  for (const notificationId of ids) {
    const deliveryTarget = target(await rpc(config, "waitlist_promotion_delivery_target", {
      p_notification_id: notificationId,
    }, request));
    if (!deliveryTarget) { result.skipped += 1; continue; }
    let delivery;
    try { delivery = await sendPromotionEmail(deliveryTarget, config, request); }
    catch { delivery = { success: false, errorCode: "provider-temporary" }; }
    const completed = await rpc(config, "complete_waitlist_promotion_notification", {
      p_notification_id: notificationId,
      p_success: delivery.success,
      p_error_code: delivery.errorCode,
    }, request);
    if (completed !== true) throw new Error("worker-completion-failed");
    if (delivery.success) result.sent += 1;
    else result.failed += 1;
  }
  return Object.freeze(result);
}

async function run() {
  let config;
  try { config = readNotificationConfig(); }
  catch { console.error("EMAIL_DELIVERY_RUNTIME_CONFIG_REQUIRED"); process.exitCode = 1; return; }
  for (;;) {
    try {
      const result = await deliverWaitlistPromotions(config);
      if (result.claimed) console.info(`waitlist-notifications claimed=${result.claimed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
    } catch { console.error("waitlist-notification-worker-unavailable"); }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
