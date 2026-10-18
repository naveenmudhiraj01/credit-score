import { NextRequest } from "next/server";
import { ADMIN_COOKIE, createSessionToken, passwordMatches, adminGuard } from "@/lib/adminAuth";
import { fail, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";

const tries = new Map<string, { n: number; reset: number }>(); // per-instance throttle

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const t = tries.get(ip);
  const live = t && t.reset > Date.now() ? t : undefined;
  if (live && live.n >= 5) return fail(429, "TOO_MANY_ATTEMPTS", "Try again later.");

  let token: string;
  try {
    const { password } = await readJson(req);
    if (typeof password !== "string" || !passwordMatches(password)) {
      tries.set(ip, { n: (live?.n ?? 0) + 1, reset: live?.reset ?? Date.now() + 15 * 60_000 });
      return fail(401, "INVALID_CREDENTIALS", "Incorrect password.");
    }
    token = createSessionToken();
  } catch (e) {
    if ((e as Error).message.startsWith("Missing environment variable")) {
      console.error("[admin/login] configuration missing");
      return fail(500, "NOT_CONFIGURED", "Admin login is not configured.");
    }
    return fail(400, "INVALID_JSON", "Invalid request.");
  }
  tries.delete(ip);
  const res = ok();
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 3600,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const denied = adminGuard(req);
  if (denied) return denied;
  return ok({ authenticated: true });
}

export async function DELETE() {
  const res = ok();
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
