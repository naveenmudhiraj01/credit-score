"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Printer, ShieldCheck } from "lucide-react";
import GlassCard from "./GlassCard";
import StatusBadge from "./StatusBadge";
import { SecondaryButton } from "./Buttons";
import { BRAND } from "@/config";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    try {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<any>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onCopy = async () => {
    setState((await copyText(value)) ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  };
  return (
    <>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className="cd-btn cd-btn--secondary cd-btn--sm no-print"
      >
        {state === "copied" ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
      </button>
      <span role="status" className="sr-only">
        {state === "copied"
          ? `${label} copied to clipboard`
          : state === "failed"
          ? `Could not copy ${label}. Select the text and copy it manually.`
          : ""}
      </span>
    </>
  );
}

export default function OrderReceipt({
  order,
  rows,
  onPrint,
  className = "",
}: {
  order: any;
  rows: [string, any][];
  onPrint?: () => void;
  className?: string;
}) {
  const take = (pred: (k: string) => boolean) => rows.find(([k]) => pred(k));
  const orderRow = take((k) => k === "Order number");
  const amountRow = take((k) => k.startsWith("Amount"));
  const rest = rows.filter((r) => r !== orderRow && r !== amountRow);

  return (
    <GlassCard aria-labelledby="receipt-title" delay={0.05} className={className}>
      <div id="receipt">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="receipt-title" className="cd-title cd-h2 !text-xl">
              Order receipt
            </h2>
            <p className="cd-muted mt-0.5 text-xs font-medium">{BRAND}</p>
          </div>
          <StatusBadge value={order.status} size="lg" />
        </div>

        {orderRow && (
          <div className="cd-order-id mt-5">
            <div className="min-w-0">
              <p className="cd-muted text-xs font-semibold uppercase tracking-wide">{orderRow[0]}</p>
              <p className="cd-title cd-mono mt-0.5 break-all text-base font-bold">{orderRow[1]}</p>
            </div>
            <CopyButton value={String(orderRow[1])} label="order ID" />
          </div>
        )}

        {amountRow && (
          <div className="cd-amount mt-4">
            <p className="cd-muted text-xs font-semibold uppercase tracking-wide">{amountRow[0]}</p>
            <p className="cd-amount-value mt-0.5">{amountRow[1]}</p>
          </div>
        )}

        <dl className="cd-rows mt-3">
          {rest.map(([k, v]) => (
            <div key={k} className="cd-row">
              <dt>{k}</dt>
              <dd className={k === "Payment ID" ? "cd-mono text-[0.85rem]" : undefined}>{v}</dd>
            </div>
          ))}
        </dl>

        <p
          className="cd-muted mt-2 flex items-center gap-1.5 border-t pt-3 text-xs"
          style={{ borderColor: "var(--cd-divider)" }}
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          Payment verified by our payment processor.
        </p>
      </div>

      <div className="no-print mt-5">
        <SecondaryButton onClick={onPrint} className="w-full sm:w-auto">
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print receipt
        </SecondaryButton>
      </div>
    </GlassCard>
  );
}
