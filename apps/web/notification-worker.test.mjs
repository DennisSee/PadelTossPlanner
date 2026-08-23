import { describe, expect, it, vi } from "vitest";

import {
  deliverWaitlistPromotions,
  NotificationConfigurationError,
  readNotificationConfig,
  sendPromotionEmail,
} from "./notification-worker.mjs";

const config = {
  appBaseUrl: "https://tos.example",
  supabaseUrl: "https://project.supabase.co",
  serviceRoleKey: "service-role-key-with-at-least-thirty-two-characters",
  resendApiKey: "re_secret",
  fromEmail: "tos@example.test",
};
const target = {
  notification_id: "11111111-1111-4111-8111-111111111111",
  recipient_email: "participant@example.test",
  event_title: "Vrijdag <TOS>",
  event_slug: "vrijdag-padel",
  event_sport: "padel",
  event_starts_at: "2026-08-28T18:00:00Z",
  event_ends_at: "2026-08-28T20:00:00Z",
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

describe("isolated waitlist notification worker", () => {
  it("fails closed unless all server-only runtime values are valid", () => {
    expect(readNotificationConfig({ APP_BASE_URL: config.appBaseUrl, SUPABASE_URL: config.supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey, RESEND_API_KEY: config.resendApiKey,
      NOTIFICATION_FROM_EMAIL: config.fromEmail })).toMatchObject(config);
    expect(() => readNotificationConfig({})).toThrow(NotificationConfigurationError);
  });

  it("claims, revalidates, sends and completes exactly once", async () => {
    const request = vi.fn(async (url) => {
      if (String(url).endsWith("claim_waitlist_promotion_notifications")) return response([{ notification_id: target.notification_id }]);
      if (String(url).endsWith("waitlist_promotion_delivery_target")) return response([target]);
      if (String(url).endsWith("complete_waitlist_promotion_notification")) return response(true);
      if (String(url) === "https://api.resend.com/emails") return response({}, 202);
      return response({}, 500);
    });
    await expect(deliverWaitlistPromotions(config, request)).resolves.toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
    const providerCall = request.mock.calls.find(([url]) => url === "https://api.resend.com/emails");
    expect(providerCall).toBeTruthy();
    expect(JSON.parse(providerCall[1].body).html).toContain("Vrijdag &lt;TOS&gt;");
    expect(String(providerCall[1].body)).not.toContain(config.resendApiKey);
  });

  it("never sends after the database marks a claimed task stale", async () => {
    const request = vi.fn(async (url) => String(url).endsWith("claim_waitlist_promotion_notifications")
      ? response([{ notification_id: target.notification_id }]) : response([]));
    await expect(deliverWaitlistPromotions(config, request)).resolves.toEqual({ claimed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(request.mock.calls.some(([url]) => url === "https://api.resend.com/emails")).toBe(false);
  });

  it("categorizes provider failure without reading or persisting its body", async () => {
    const request = vi.fn(async (url) => url === "https://api.resend.com/emails"
      ? new Response("private provider detail", { status: 503 }) : response({}));
    await expect(sendPromotionEmail({
      notificationId: target.notification_id, recipientEmail: target.recipient_email,
      eventTitle: target.event_title, eventSlug: target.event_slug, eventSport: "padel",
      eventStartsAt: target.event_starts_at,
    }, config, request)).resolves.toEqual({ success: false, errorCode: "provider-temporary" });
  });

  it("reports a retryable result through the narrow completion RPC", async () => {
    let completionBody = null;
    const request = vi.fn(async (url, init) => {
      if (String(url).endsWith("claim_waitlist_promotion_notifications")) return response([{ notification_id: target.notification_id }]);
      if (String(url).endsWith("waitlist_promotion_delivery_target")) return response([target]);
      if (String(url) === "https://api.resend.com/emails") return new Response("private", { status: 503 });
      if (String(url).endsWith("complete_waitlist_promotion_notification")) {
        completionBody = JSON.parse(init.body);
        return response(true);
      }
      return response({}, 500);
    });
    await expect(deliverWaitlistPromotions(config, request)).resolves.toEqual({ claimed: 1, sent: 0, skipped: 0, failed: 1 });
    expect(completionBody).toEqual({
      p_notification_id: target.notification_id,
      p_success: false,
      p_error_code: "provider-temporary",
    });
  });
});
