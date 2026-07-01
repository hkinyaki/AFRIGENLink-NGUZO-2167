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
const RESEND_FROM = process.env.RESEND_FROM ?? "AFRIGEN Link <notifications@afrigenlink.com>";

let resendClient: { emails: { send: (a: unknown) => Promise<unknown> } } | null = null;
async function getResend() {
  if (!RESEND_API_KEY) return null;
  if (resendClient) return resendClient;
  const { Resend } = await import("resend");
  resendClient = new Resend(RESEND_API_KEY) as unknown as typeof resendClient;
  return resendClient;
}

/**
 * Resolve a profile's real delivery inbox.
 * Staff log in with a synthetic username email (@staff.afrigen.local) that has no
 * inbox — for those we deliver to the profile's real `contactEmail`. Everyone else
 * uses their login email.
 */
async function emailForProfile(profileId: string): Promise<string | null> {
  const [p] = await db.select().from(profile).where(eq(profile.id, profileId)).limit(1);
  if (!p) return null;
  if (p.contactEmail && p.contactEmail.includes("@")) return p.contactEmail;
  const [u] = await db.select().from(authUser).where(eq(authUser.id, p.userId)).limit(1);
  const login = u?.email ?? null;
  // Never try to deliver to a dead synth staff address.
  if (login && login.endsWith("@staff.afrigen.local")) return null;
  return login;
}

/**
 * Resolve a real delivery inbox for a raw login email (used by the auth 2FA OTP send).
 * Staff synth addresses are mapped to their profile.contactEmail.
 */
async function deliveryInboxForLoginEmail(loginEmail: string): Promise<string | null> {
  if (!loginEmail) return null;
  if (!loginEmail.endsWith("@staff.afrigen.local")) return loginEmail;
  const [u] = await db.select().from(authUser).where(eq(authUser.email, loginEmail)).limit(1);
  if (!u) return null;
  const [p] = await db.select().from(profile).where(eq(profile.userId, u.id)).limit(1);
  return p?.contactEmail && p.contactEmail.includes("@") ? p.contactEmail : null;
}

/**
 * Send a login two-factor OTP code to a user's real inbox via Resend.
 * Called by the Better Auth twoFactor plugin's otpOptions.sendOTP.
 */
export async function sendTwoFactorOtpEmail(loginEmail: string, otp: string) {
  const to = await deliveryInboxForLoginEmail(loginEmail);
  if (!to) {
    console.warn("[events] 2FA OTP: no deliverable inbox for", loginEmail);
    return;
  }
  const client = await getResend();
  if (!client) {
    console.warn("[events] 2FA OTP: RESEND_API_KEY not set — code not emailed.");
    return;
  }
  const body = `Your AFRIGEN Link one-time sign-in code is <strong style="font-size:20px;letter-spacing:3px;color:#141B2E">${otp}</strong>. It expires in a few minutes. If you didn't try to sign in, ignore this email.`;
  await client.emails.send({
    from: RESEND_FROM,
    to,
    subject: "AFRIGEN Link — your sign-in code",
    html: emailHtml("Your one-time sign-in code", body),
  });
}

/**
 * Send a staff invite email with login instructions, username and temp password.
 */
export async function sendStaffInviteEmail(opts: {
  to: string;
  name: string;
  role: string;
  username: string;
  tempPassword: string;
  loginUrl: string;
}): Promise<boolean> {
  const client = await getResend();
  if (!client) {
    console.warn("[events] staff invite: RESEND_API_KEY not set — invite not emailed.");
    return false;
  }
  const roleLabel =
    opts.role === "key_account" ? "Key Account Manager" : opts.role === "field" ? "Field Agent" : "Administrator";
  const body = `Welcome to the AFRIGEN Link team, ${opts.name}. An administrator has created your <strong>${roleLabel}</strong> account.
    <br/><br/>
    <strong>Sign in at:</strong> <a href="${opts.loginUrl}" style="color:#D99A2B">${opts.loginUrl}</a><br/>
    <strong>Username:</strong> <code style="background:#f2efe8;padding:2px 6px;border-radius:4px">${opts.username}</code><br/>
    <strong>Temporary password:</strong> <code style="background:#f2efe8;padding:2px 6px;border-radius:4px">${opts.tempPassword}</code>
    <br/><br/>
    On your first sign-in you'll be asked to <strong>change your password</strong> and <strong>secure your account with an authenticator app</strong> (a second factor is required to sign in). Keep these details private.`;
  try {
    await client.emails.send({
      from: RESEND_FROM,
      to: opts.to,
      subject: "Your AFRIGEN Link staff account",
      html: emailHtml("Your staff account is ready", body),
    });
    return true;
  } catch (err) {
    console.warn("[events] staff invite send failed:", (err as Error)?.message);
    return false;
  }
}

function emailHtml(subject: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#F7F6F3;font-family:Arial,Helvetica,sans-serif;color:#141B2E">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#141B2E;border-radius:12px 12px 0 0;padding:20px 24px">
      <span style="color:#D99A2B;font-weight:700;font-size:18px;letter-spacing:.5px">AFRIGEN LINK</span>
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
  /** Optional file attachments (e.g. generated PDF proofs), buffer content. */
  attachments?: { filename: string; content: Buffer | Uint8Array }[];
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
            subject: `AFRIGEN Link — ${opts.subject}`,
            html: emailHtml(opts.subject, opts.body),
            ...(opts.attachments?.length
              ? { attachments: opts.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })) }
              : {}),
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
  msg: { tenderId?: string; subject: string; body: string; channel?: "email" | "sms"; attachments?: { filename: string; content: Buffer | Uint8Array }[] }
) {
  const unique = [...new Set(recipientProfileIds.filter(Boolean))];
  for (const rid of unique) {
    await logNotification({ recipientProfileId: rid, ...msg });
  }
}
