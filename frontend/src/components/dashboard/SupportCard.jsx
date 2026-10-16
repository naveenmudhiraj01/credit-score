import { useEffect } from "react";
import { LifeBuoy, Mail } from "lucide-react";
import GlassCard from "./GlassCard";
import { PrimaryButton } from "./Buttons";
import { SUPPORT_EMAIL } from "../../config";

/** Uses only the configured contact (VITE_SUPPORT_EMAIL). Nothing is invented when it is missing. */
export default function SupportCard({ orderId, className = "" }) {
  useEffect(() => {
    if (!SUPPORT_EMAIL && import.meta.env.DEV) console.warn("[dashboard] VITE_SUPPORT_EMAIL is not configured; the support card shows an unavailable state.");
  }, []);

  return (
    <GlassCard aria-labelledby="support-title" delay={0.2} className={className}>
      <h2 id="support-title" className="cd-title cd-h2">
        <span className="cd-h2-icon"><LifeBuoy className="h-4 w-4" aria-hidden="true" /></span>Need help?
      </h2>
      {SUPPORT_EMAIL ? (
        <>
          <p className="cd-muted mt-3 text-sm leading-relaxed">Contact support if you have a question about your order or need to correct your details. Please quote your Order ID.</p>
          <p className="cd-title mt-3 break-all text-sm font-semibold">{SUPPORT_EMAIL}</p>
          <PrimaryButton href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Order ${orderId}`)}`} className="mt-4 w-full sm:w-auto">
            <Mail className="h-4 w-4" aria-hidden="true" />Contact Support
          </PrimaryButton>
        </>
      ) : (
        <p className="cd-muted mt-3 text-sm leading-relaxed" role="status">Support contact details aren't available right now. Please check your registered email for instructions from our team.</p>
      )}
    </GlassCard>
  );
}
