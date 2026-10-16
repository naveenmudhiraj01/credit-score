import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { validateEmail } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const emailParam = req.nextUrl.searchParams.get("email");
  if (!emailParam || typeof emailParam !== "string") {
    return fail(400, "MISSING_EMAIL", "Email query parameter is required.");
  }

  const validation = validateEmail(emailParam);
  if (!validation.valid) {
    return fail(400, "INVALID_EMAIL", validation.error || "Invalid email format.");
  }

  const normalized = validation.value!;

  try {
    const count = await prisma.paymentOrder.count({
      where: { customerEmail: normalized },
    });

    return ok({
      exists: count > 0,
      totalOrders: count,
      message: count > 0
        ? "An application with this email already exists in our system. You are submitting a new application."
        : null,
    });
  } catch (err) {
    console.error("[check-email] query error:", err instanceof Error ? err.name : "DBError");
    return fail(500, "DB_ERROR", "Could not check email status.");
  }
}
