export const adminOrderSelect = {
  receipt: true, razorpayOrderId: true, product: true, customerName: true, customerEmail: true, customerMobile: true,
  amount: true, currency: true, status: true, razorpayPaymentId: true, failureReason: true,
  emailStatus: true, emailSentAt: true, sheetStatus: true, sheetSyncedAt: true,
  consentGiven: true, consentVersion: true, consentText: true, consentTimestamp: true, consentIp: true,
  reviewStatus: true, reviewDeadline: true, reviewStartedAt: true, reviewStartedBy: true, teamRespondedAt: true, teamResponseNotes: true, teamRespondedBy: true,
  createdAt: true, paidAt: true, updatedAt: true,
} as const;

export const LEGACY_PRODUCTS = ["Rolex Submariner Watch", "Levi's Denim Jacket"] as const;

/** Identifies Product A orders independently of the configurable service fee. */
export function isCreditScoreOrder(order: { product: string; amount: number }): boolean {
  return order.product === "Product A" || order.product === "Credit Score Access" || order.product === "Loan Assistance Service";
}

/**
 * Identifies legacy or demo orders (e.g. Rolex watch, Levi's denim jacket).
 */
export function isLegacyOrder(order: { product: string; amount: number }): boolean {
  if ((LEGACY_PRODUCTS as readonly string[]).includes(order.product)) return true;
  return !isCreditScoreOrder(order);
}

/**
 * Formats an order for admin display without mutating underlying database records.
 * Displays "Credit Score Access" for Product A orders,
 * flags legacy/demo orders, and preserves all amounts, statuses, and payment IDs.
 */
export function formatAdminOrder<T extends { product: string; amount: number }>(order: T) {
  const isLegacy = isLegacyOrder(order);
  const isCreditScore = isCreditScoreOrder(order);
  return {
    ...order,
    originalProduct: order.product,
    product: isCreditScore ? "Credit Score Access" : order.product,
    isLegacy,
  };
}
