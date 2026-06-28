/**
 * In-process daily scheduler (Bun server).
 *
 * Two jobs, run on boot and every 24h:
 *  1) 10-day-before-end reminder for active machinery contracts — asks the
 *     client to extend or end. Fires once (guarded by reminderSentAt).
 *  2) Overdue check — any contract past its end date with an UNPAID extension
 *     is flagged PaymentOverdue and the supplier gains removalRight.
 *
 * Delivery: in-app notification (always) + email when Resend is configured
 * (handled inside logNotification). No SMS gateway yet.
 */
import { and, eq, ne } from "drizzle-orm";
import { db } from "../database";
import { contracts, extensions } from "../database/schema";
import { logNotification } from "./events";

const DAY_MS = 24 * 60 * 60 * 1000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b)) return NaN;
  return Math.round((b - a) / DAY_MS);
}

async function runReminderSweep() {
  const today = todayIso();
  // Active machinery contracts with an end date, not yet reminded, not finished.
  const rows = await db
    .select()
    .from(contracts)
    .where(and(ne(contracts.endDate, ""), eq(contracts.reminderSentAt, "")));

  for (const ct of rows) {
    if (ct.milestoneStatus === "FundsDisbursed") continue;
    if (!ct.dailyRateTzs) continue; // only machinery hires are extendable
    const left = daysBetween(today, ct.endDate);
    if (isNaN(left)) continue;
    // Fire when 10 days or fewer remain (and not already past).
    if (left <= 10 && left >= 0) {
      await db.update(contracts).set({ reminderSentAt: today }).where(eq(contracts.id, ct.id));
      await logNotification({
        recipientProfileId: ct.clientId,
        tenderId: ct.tenderId ?? "",
        subject: "Hire ending soon — extend or end?",
        body: `"${ct.title}" reaches its end date on ${ct.endDate} (${left} day${left === 1 ? "" : "s"} left). To keep the machine on site, request an extension before the end date. Otherwise the hire will close and the machine returns to the yard.`,
      });
      await logNotification({
        recipientProfileId: ct.supplierId,
        tenderId: ct.tenderId ?? "",
        subject: "Hire ending soon",
        body: `"${ct.title}" reaches its end date on ${ct.endDate}. The client has been asked to extend or end. We'll confirm once they decide.`,
      });
    }
  }
}

async function runOverdueSweep() {
  const today = todayIso();
  // Contracts past end date with a pending extension that was never paid.
  const pendingExts = await db
    .select()
    .from(extensions)
    .where(eq(extensions.status, "PendingPayment"));

  for (const ext of pendingExts) {
    const [ct] = await db.select().from(contracts).where(eq(contracts.id, ext.contractId)).limit(1);
    if (!ct) continue;
    const overdue = daysBetween(ext.dueDate, today) > 0; // past the due (= current end) date
    if (overdue) {
      await db.update(extensions).set({ status: "Lapsed" }).where(eq(extensions.id, ext.id));
      await db
        .update(contracts)
        .set({ extensionStatus: "PaymentOverdue", removalRight: 1 })
        .where(eq(contracts.id, ct.id));
      await logNotification({
        recipientProfileId: ct.supplierId,
        tenderId: ct.tenderId ?? "",
        subject: "Extension lapsed — recovery authorised",
        body: `The extension on "${ct.title}" was not funded before its due date (${ext.dueDate}). You are now authorised to recover the machine. Our team will coordinate.`,
      });
      await logNotification({
        recipientProfileId: ct.clientId,
        tenderId: ct.tenderId ?? "",
        subject: "Extension lapsed",
        body: `Payment for the extension on "${ct.title}" was not received by ${ext.dueDate}. The hire is now overdue and the supplier may recover the machine.`,
      });
    }
  }
}

async function sweep() {
  try {
    await runReminderSweep();
    await runOverdueSweep();
  } catch (err) {
    console.warn("[scheduler] sweep error:", (err as Error)?.message);
  }
}

let started = false;
export function startScheduler() {
  if (started) return;
  started = true;
  // Run shortly after boot, then daily.
  setTimeout(sweep, 5000);
  setInterval(sweep, DAY_MS);
  console.log("[scheduler] hire-extension reminder + overdue sweep active (daily).");
}
