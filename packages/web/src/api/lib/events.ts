/**
 * Activity timeline + notification helpers.
 *
 * Notifications are persisted ON-RECORD (in-app feed) AND, when RESEND_API_KEY
 * is configured, also delivered by email via Resend. Without a key the send
 * degrades gracefully and the row is kept with status "Logged".
 *
 * SMS / WhatsApp delivery is still deferred (no gateway wired yet).
 */
import { eq } from "drizzle-orm";
import { db } from "../database";
import { activityEvents, notifications, profile } from "../database/schema";
import { user as authUser } from "../database/auth-schema";
import { id } from "./ids";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM = process.env.RESEND_FROM ?? "Nguzo Africa <notifications@nguzo.africa>";

let resendClient: { emails: { send: (a: unknown) => Promise<unknown> } } | null = null;
async function getResend() {
  if (!RESEND_API_KEY) return null;
  if (resendClient) return resendClient;
  const { Resend } = await import("resend");
  resendClient = new Resend(RESEND_API_KEY) as unknown as typeof resendClient;
  return resendClient;
}

/** Resolve a profile's login email (for email delivery). */
async function emailForProfile(profileId: string): Promise<string | null> {
  const [p] = await db.select().from(profile).where(eq(profile.id, profileId)).limit(1);
  if (!p) return null;
  const [u] = await db.select().from(authUser).where(eq(authUser.id, p.userId)).limit(1);
  return u?.email ?? null;
}

function emailHtml(subject: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#F7F6F3;font-family:Arial,Helvetica,sans-serif;color:#141B2E">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#141B2E;border-radius:12px 12px 0 0;padding:20px 24px">
      <span style="color:#D99A2B;font-weight:700;font-size:18px;letter-spacing:.5px">NGUZO AFRICA</span>
    </div>
    <div style="background:#fff;border:1px solid #e7e4dd;border-top:none;border-radius:0 0 12px 12px;padding:28px 24px">
      <h2 style="margin:0 0 12px;font-size:18px;color:#141B2E">${subject}</h2>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#3a4055">${body}</p>
    </div>
    <p style="margin:16px 4px 0;font-size:12px;color:#8a8f9c">Cargo &amp; Machinery Coordination — Secured.</p>
  </div></body></html>`;
}

export async function logEvent(opts: {
  tenderId?: string;
  contractId?: string;
  actorProfileId?: string;
  type: string;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  await db.insert(activityEvents).values({
    id: id("evt"),
    tenderId: opts.tenderId ?? "",
    contractId: opts.contractId ?? "",
    actorProfileId: opts.actorProfileId ?? "",
    type: opts.type,
    summary: opts.summary,
    meta: opts.meta ?? {},
  });
}

export async function logNotification(opts: {
  recipientProfileId: string;
  tenderId?: string;
  channel?: "email" | "sms";
  subject: string;
  body: string;
}) {
  if (!opts.recipientProfileId) return;
  const ntfId = id("ntf");
  let status = "Logged"; // default: on-record only

  // Attempt real email delivery when configured (email channel only).
  if ((opts.channel ?? "email") === "email") {
    try {
      const client = await getResend();
      if (client) {
        const to = await emailForProfile(opts.recipientProfileId);
        if (to) {
          await client.emails.send({
            from: RESEND_FROM,
            to,
            subject: `Nguzo Africa — ${opts.subject}`,
            html: emailHtml(opts.subject, opts.body),
          });
          status = "Sent";
        }
      }
    } catch (err) {
      console.warn("[events] email send failed, keeping on-record:", (err as Error)?.message);
      status = "Logged";
    }
  }

  await db.insert(notifications).values({
    id: ntfId,
    recipientProfileId: opts.recipientProfileId,
    tenderId: opts.tenderId ?? "",
    channel: opts.channel ?? "email",
    subject: opts.subject,
    body: opts.body,
    status,
  });
}

/** Notify several recipients at once with the same message. */
export async function notifyMany(
  recipientProfileIds: string[],
  msg: { tenderId?: string; subject: string; body: string; channel?: "email" | "sms" }
) {
  const unique = [...new Set(recipientProfileIds.filter(Boolean))];
  for (const rid of unique) {
    await logNotification({ recipientProfileId: rid, ...msg });
  }
}
