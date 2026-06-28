import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import { profile } from "../database/schema";

export const authMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  if (session?.user) {
    const [p] = await db.select().from(profile).where(eq(profile.userId, session.user.id)).limit(1);
    c.set("profile", p ?? null);
  } else {
    c.set("profile", null);
  }
  return next();
});

export const requireAuth = createMiddleware(async (c, next) => {
  if (!c.get("user")) return c.json({ message: "Unauthorized" }, 401);
  return next();
});

export function requireRole(...roles: string[]) {
  return createMiddleware(async (c, next) => {
    const p = c.get("profile") as { role?: string } | null;
    if (!p || !roles.includes(p.role ?? "")) {
      return c.json({ message: "Forbidden" }, 403);
    }
    return next();
  });
}
