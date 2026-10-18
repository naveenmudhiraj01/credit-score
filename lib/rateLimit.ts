/**
 * Small in-memory failure limiter (per server instance) used to slow down guessing of the
 * order-verification email/phone. Not a substitute for an edge/WAF limit in multi-instance deployments.
 */
export function createFailureLimiter(opts: { max: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = opts.maxKeys ?? 5000;
  return {
    isBlocked(key: string, now = Date.now()): boolean {
      const h = hits.get(key);
      if (!h) return false;
      if (h.resetAt <= now) { hits.delete(key); return false; }
      return h.count >= opts.max;
    },
    recordFailure(key: string, now = Date.now()): void {
      const h = hits.get(key);
      if (!h || h.resetAt <= now) {
        if (hits.size >= maxKeys) hits.clear(); // crude bound on memory
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      } else {
        h.count += 1;
      }
    },
    reset(key: string): void { hits.delete(key); },
  };
}
