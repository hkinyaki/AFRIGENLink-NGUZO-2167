import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, twoFactor } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db } from "./database";
import { allowedOrigins } from "./lib/security";
import { sendTwoFactorOtpEmail } from "./lib/events";

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  // Only ever trust explicitly allowlisted origins — never reflect arbitrary ones.
  trustedOrigins: allowedOrigins(),
  plugins: [
    // Second factor for every login + money actions.
    //  - TOTP (authenticator app) is the universal factor.
    //  - OTP is emailed (via Resend) as an alternative for real-inbox users.
    twoFactor({
      issuer: "AFRIGEN Link",
      otpOptions: {
        // Deliver the login OTP to the account's real inbox.
        async sendOTP({ user, otp }) {
          await sendTwoFactorOtpEmail(user.email, otp);
        },
      },
    }),
    bearer(),
    expo(),
  ],
});
