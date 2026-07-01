// Runtime-agnostic PIN hashing.
//
// The master PIN is verified in BOTH the Bun production server and the
// Node-based Vite dev server, so we cannot rely on `Bun.password`. Node's
// scrypt is available in every runtime we target and is a sound choice for
// hashing a short numeric secret.
//
// Format: scrypt$<saltHex>$<hashHex>

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEYLEN = 32;

function scryptAsync(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEYLEN, (err, derived) => (err ? reject(err) : resolve(derived)));
  });
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(pin, salt);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (!stored?.startsWith("scrypt$")) return false;
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scryptAsync(pin, salt);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
