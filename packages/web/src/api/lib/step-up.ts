// Step-up re-authentication for sensitive money actions.
//
// A user is already fully signed in (they cleared 2FA at login), but before an
// irreversible action — releasing a payout, opening a locked document — we
// demand a FRESH authenticator code. This proves the person at the keyboard is
// still the account owner, not a hijacked live session.
//
// We verify the TOTP directly against the stored (encrypted) shared secret
// using the same primitives Better Auth uses at login, so there is no
// "simulated" code anywhere in this path.

import { eq } from "drizzle-orm";
import { symmetricDecrypt } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { db } from "../database";
import { twoFactor as twoFactorTable } from "../database/auth-schema";

const PERIOD = 30;
const DIGITS = 6;

/**
 * Verify a live 6-digit authenticator code for a given auth user id.
 * Returns true only if the code matches the user's enrolled TOTP secret.
 */
export async function verifyStepUpTotp(userId: string, code: string): Promise<boolean> {
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;

  const [row] = await db
    .select()
    .from(twoFactorTable)
    .where(eq(twoFactorTable.userId, userId))
    .limit(1);
  if (!row?.secret) return false;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return false;

  let plainSecret: string;
  try {
    plainSecret = await symmetricDecrypt({ key: secret, data: row.secret });
  } catch {
    return false;
  }

  try {
    return await createOTP(plainSecret, { period: PERIOD, digits: DIGITS }).verify(clean);
  } catch {
    return false;
  }
}
