// TEST ONLY: enroll demo accounts with a KNOWN TOTP secret so automated tests
// can compute live codes, and set the admin master PIN. Never run in prod.
import { db } from "./src/api/database";
import { user, twoFactor } from "./src/api/database/auth-schema";
import { profile } from "./src/api/database/schema";
import { eq } from "drizzle-orm";
import { symmetricEncrypt } from "better-auth/crypto";
import { randomUUID } from "crypto";

// A fixed base32 secret shared across demo accounts for tests.
const TEST_SECRET = "JBSWY3DPEHPK3PXP"; // base32 "Hello!..." classic test vector
const TEST_PIN = "246810";

const EMAILS = [
  "client@afrigen.link", "supplier@afrigen.link", "supplier2@afrigen.link",
  "field@afrigen.link", "kam@afrigen.link", "parts@afrigen.link", "admin@afrigen.link",
];

async function main() {
  const key = process.env.BETTER_AUTH_SECRET!;
  const enc = await symmetricEncrypt({ key, data: TEST_SECRET });
  for (const email of EMAILS) {
    const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (!u) { console.log("skip (no user):", email); continue; }
    // enable flag
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, u.id));
    // upsert two_factor row
    const [existing] = await db.select().from(twoFactor).where(eq(twoFactor.userId, u.id)).limit(1);
    if (existing) {
      await db.update(twoFactor).set({ secret: enc, backupCodes: "" }).where(eq(twoFactor.userId, u.id));
    } else {
      await db.insert(twoFactor).values({ id: randomUUID(), userId: u.id, secret: enc, backupCodes: "" });
    }
    // admin gets master pin
    if (email === "admin@afrigen.link") {
      const hash = await Bun.password.hash(TEST_PIN);
      await db.update(profile).set({ masterPinHash: hash }).where(eq(profile.userId, u.id));
    }
    console.log("enrolled 2FA:", email);
  }
  console.log("TEST_SECRET:", TEST_SECRET, "TEST_PIN:", TEST_PIN);
}
main().then(() => process.exit(0));
