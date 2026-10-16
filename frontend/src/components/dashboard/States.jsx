import { AlertCircle, Inbox } from "lucide-react";
import GlassCard from "./GlassCard";
import Spinner from "../Spinner";

/** Shows layout-shaped placeholders so the page doesn't jump when data arrives. */
export function LoadingState({ label = "Loading your order…" }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 text-sm cd-muted"><Spinner className="h-5 w-5 text-brand" /><span>{label}</span></div>
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="cd-skel motion-safe:animate-pulse h-9 w-2/3 max-w-md" />
        <div className="cd-skel motion-safe:animate-pulse h-4 w-1/2 max-w-sm" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5" aria-hidden="true">
        <div className="cd-glass lg:col-span-3"><div className="cd-skel motion-safe:animate-pulse h-72" /></div>
        <div className="cd-glass lg:col-span-2"><div className="cd-skel motion-safe:animate-pulse h-72" /></div>
      </div>
    </div>
  );
}

function Notice({ icon: Icon, tone, title, children, action, role }) {
  return (
    <GlassCard as="div" lift={false} className="mx-auto max-w-lg !p-8 text-center" role={role}>
      <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${tone === "error" ? "bg-red-100 text-red-700" : tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="cd-title mt-4 text-xl">{title}</h1>
      <p className="cd-muted mt-2 text-sm leading-relaxed">{children}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </GlassCard>
  );
}

export const ErrorState = ({ icon = AlertCircle, tone = "error", ...p }) => <Notice icon={icon} tone={tone} role="alert" {...p} />;
export const EmptyState = ({ icon = Inbox, tone = "info", ...p }) => <Notice icon={icon} tone={tone} role="status" {...p} />;
