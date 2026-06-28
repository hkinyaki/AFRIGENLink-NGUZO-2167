import { eq, sql } from "drizzle-orm";
import { db } from "../database";
import { idCounters } from "../database/schema";

export function id(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}_${t}${rnd}`;
}

export function manifestRef(): string {
  const n = Math.floor(100000 + Math.random() * 899999);
  return `AFG-MAN-${n}`;
}

/** role → User-ID prefix (NGZ-<PREFIX>-NNN) */
const ROLE_PREFIX: Record<string, string> = {
  client: "CL",
  supplier: "SUP",
  field: "FA",
  key_account: "KAM",
  parts_supplier: "PS",
  admin: "ADM",
};

/**
 * Issue the next sequential, human-readable User ID for a role.
 * Uses the id_counters table atomically (read-increment-write) so codes are
 * sequential and unique per role — e.g. NGZ-FA-007.
 */
export async function nextUserCode(role: string): Promise<string> {
  const prefix = ROLE_PREFIX[role] ?? "USR";
  // upsert + increment in a single statement
  await db
    .insert(idCounters)
    .values({ role, seq: 1 })
    .onConflictDoUpdate({ target: idCounters.role, set: { seq: sql`${idCounters.seq} + 1` } });
  const [row] = await db.select().from(idCounters).where(eq(idCounters.role, role)).limit(1);
  const n = row?.seq ?? 1;
  return `NGZ-${prefix}-${String(n).padStart(3, "0")}`;
}
