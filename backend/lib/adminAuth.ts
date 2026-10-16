import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireEnv } from "./env";
import { fail } from "./http";

export const ADMIN_COOKIE = "admin_session";
const TTL_MS = 8 * 60 * 60 * 1000;

const sign = (data: string) => crypto.createHmac("sha256", requireEnv("ADMIN_SESSION_SECRET")).update(data).digest("base64url");
const digest = (s: string) => crypto.createHash("sha256").update(s).digest();

export function passwordMatches(input: string) {
  return crypto.timingSafeEqual(digest(input), digest(requireEnv("ADMIN_PASSWORD")));
}
export function createSessionToken() {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(exp)}`;
}
export function isValidSessionToken(token?: string | null) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  return mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}
/** Use at the top of every /admin server page or layout. */
export async function requireAdminPage() {
  const jar = await cookies();
  if (!isValidSessionToken(jar.get(ADMIN_COOKIE)?.value)) redirect("/admin/login");
}
/** Use at the top of every /api/admin/* handler (except login). Returns a 401 response or null. */
export function adminGuard(req: NextRequest) {
  return isValidSessionToken(req.cookies.get(ADMIN_COOKIE)?.value) ? null : fail(401, "UNAUTHORIZED", "Sign in required.");
}
