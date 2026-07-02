// Prints a live TOTP code for a given (base32-ish) secret, using the SAME
// primitive Better Auth uses at verify time. Usage: bun tests/otp.ts <secret>
import { createOTP } from "@better-auth/utils/otp";
const secret = process.argv[2];
const code = await createOTP(secret, { period: 30, digits: 6 }).totp();
process.stdout.write(code);
