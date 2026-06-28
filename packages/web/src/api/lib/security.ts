import { createMiddleware } from "hono/factory";

/**
 * Allowed origins for CORS + better-auth trusted origins.
 * Driven by env ALLOWED_ORIGINS (comma-separated). Falls back to the
 * deployment WEBSITE_URL and localhost dev ports. Never reflects "*".
 */
export function allowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const site = process.env.WEBSITE_URL?.trim();
  const defaults = [
    "http://localhost:4200",
    "http://localhost:4319",
    "http://127.0.0.1:4200",
  ];
  return [...new Set([...fromEnv, ...(site ? [site] : []), ...defaults])];
}

export function isOriginAllowed(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

/** Resolve a CORS origin: echo back only if allowlisted, else null. */
export function corsOrigin(origin: string): string | null {
  return isOriginAllowed(origin) ? origin : null;
}

/** Security response headers applied to every response. */
export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-XSS-Protection", "0");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  c.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
});

/**
 * Simple in-memory sliding-window rate limiter, keyed by IP + route bucket.
 * Best-effort (per-instance) — adequate for a single-server B2B back office.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(opts: { windowMs: number; max: number; bucket: string }) {
  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "local";
    const key = `${opts.bucket}:${ip}`;
    const now = Date.now();
    const rec = buckets.get(key);
    if (!rec || rec.reset < now) {
      buckets.set(key, { count: 1, reset: now + opts.windowMs });
    } else {
      rec.count += 1;
      if (rec.count > opts.max) {
        const retry = Math.ceil((rec.reset - now) / 1000);
        c.header("Retry-After", String(retry));
        return c.json({ error: "Too many requests. Please slow down." }, 429);
      }
    }
    return next();
  });
}

/** Allowed upload MIME types (documents + images only). */
export const ALLOWED_UPLOAD_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

/** Max upload size in bytes (15 MB). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function isAllowedUpload(mime: string | undefined): boolean {
  return !!mime && ALLOWED_UPLOAD_MIME.has(mime.toLowerCase());
}

/** Naive idempotency cache (per-instance) for mutating money/award routes. */
const idem = new Map<string, { at: number }>();
const IDEM_TTL = 60_000;
export function idempotent(key: string | undefined): boolean {
  if (!key) return true; // no key => allow (not enforced)
  const now = Date.now();
  for (const [k, v] of idem) if (now - v.at > IDEM_TTL) idem.delete(k);
  if (idem.has(key)) return false;
  idem.set(key, { at: now });
  return true;
}
