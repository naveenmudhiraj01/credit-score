import Razorpay from "razorpay";
import crypto from "node:crypto";
import { requireEnv } from "./env.ts";

let client: Razorpay | null = null;
export function getRazorpay(): Razorpay {
  if (!client) {
    client = new Razorpay({
      key_id: requireEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID"),
      key_secret: requireEnv("RAZORPAY_KEY_SECRET"),
    });
  }
  return client;
}

const hmacHex = (secret: string, payload: string) =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout callback signature: HMAC_SHA256(order_id|payment_id, key_secret) */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  return safeEqualHex(hmacHex(requireEnv("RAZORPAY_KEY_SECRET"), `${orderId}|${paymentId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook_secret) */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  return safeEqualHex(hmacHex(requireEnv("RAZORPAY_WEBHOOK_SECRET"), rawBody), signature);
}

export type RzpPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  email?: string;
  contact?: string;
  error_description?: string;
};
