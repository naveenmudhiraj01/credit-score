import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeEmailError } from "@/lib/email";
import { fail, ok, readJson } from "@/lib/http";
import type { DeliveryStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Processes email provider webhook callbacks for delivery confirmation,
 * bounce tracking, and transmission failures.
 * Clearly separates SMTP acceptance from verified mailbox delivery.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return fail(400, "INVALID_JSON", "Malformed webhook body.");
  }

  // Normalize incoming event(s)
  const rawEvents = Array.isArray(body) ? body : [body];
  let updatedCount = 0;

  for (const item of rawEvents) {
    if (!item || typeof item !== "object") continue;
    const evt = item as Record<string, unknown>;

    // Extract message ID across common provider formats
    let messageId: string | undefined =
      (typeof evt.messageId === "string" ? evt.messageId : undefined) ||
      (typeof evt.message_id === "string" ? evt.message_id : undefined) ||
      (typeof evt.sg_message_id === "string" ? evt.sg_message_id.split(".")[0] : undefined);

    if (!messageId && typeof evt["event-data"] === "object" && evt["event-data"]) {
      const ed = evt["event-data"] as Record<string, unknown>;
      const msg = ed.message as Record<string, unknown> | undefined;
      const headers = msg?.headers as Record<string, unknown> | undefined;
      if (typeof headers?.["message-id"] === "string") {
        messageId = headers["message-id"];
      }
    }

    if (!messageId) continue;

    // Clean messageId brackets if present: "<123@domain>" -> "123@domain"
    const cleanId = messageId.replace(/^<|>$/g, "").trim();

    // Determine normalized status
    const rawEvent = String(evt.event || evt.type || "").toLowerCase();
    let newStatus: DeliveryStatus | null = null;
    let isDelivered = false;
    let isBounced = false;
    let isFailed = false;

    if (rawEvent.includes("deliver")) {
      newStatus = "DELIVERED";
      isDelivered = true;
    } else if (rawEvent.includes("bounce")) {
      newStatus = "BOUNCED";
      isBounced = true;
    } else if (rawEvent.includes("fail") || rawEvent.includes("drop") || rawEvent.includes("reject")) {
      newStatus = "FAILED";
      isFailed = true;
    }

    if (!newStatus) continue;

    const errorReason = evt.reason || evt.error || evt.description;
    const sanitizedError = errorReason ? sanitizeEmailError(errorReason) : null;
    const eventTime = evt.timestamp ? new Date(Number(evt.timestamp) * 1000 || String(evt.timestamp)) : new Date();

    try {
      const updated = await prisma.emailNotification.updateMany({
        where: {
          status: "ACCEPTED",
          OR: [
            { messageId: cleanId },
            { messageId: `<${cleanId}>` },
            { messageId: { contains: cleanId } },
          ],
        },
        data: {
          status: newStatus,
          ...(isDelivered ? { deliveredAt: eventTime } : {}),
          ...(isBounced || isFailed ? { errorDetails: sanitizedError } : {}),
        },
      });

      updatedCount += updated.count;
    } catch (err) {
      console.error("[webhooks/email] Failed to update email status for messageId:", cleanId, err);
    }
  }

  return ok({ processed: true, updated: updatedCount });
}
