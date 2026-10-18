"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import CustomerShell from "@/components/CustomerShell";
import NotFound from "@/app/not-found";
import { findProduct, startPurchase } from "@/data/catalog";
import { inrRupees } from "@/lib/format";
import { useServiceFee } from "@/hooks/useServiceFee";

/** Product landing page: /product-a, /products/:slug */
export default function ProductDetail() {
  const params = useParams();
  const slug = (params?.slug as string) || "";
  const router = useRouter();
  const product = findProduct(slug);
  const { feeRupees, isLoading: feeLoading, hasError: feeError } = useServiceFee();

  if (!product) return <NotFound />;

  const isServiceFeeProduct = product.slug === "product-a";
  const feeUnavailable = isServiceFeeProduct && (feeLoading || feeError);
  const feeLabel = isServiceFeeProduct
    ? feeLoading
      ? "Loading…"
      : feeError
      ? "Unavailable"
      : inrRupees(feeRupees)
    : inrRupees(product.price);
  const out = product.stock === 0;

  return (
    <CustomerShell header>
      <div className="px-5 pt-4">
        <Link
          href="/products"
          className="btn-ghost btn-sm inline-flex items-center gap-1.5 !px-2.5"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>
      </div>
      <img
        src="/credit-score.png"
        alt=""
        className="mx-5 mt-3 h-44 w-[calc(100%-2.5rem)] rounded-xl object-cover sm:h-52"
      />
      <div className="px-5 pb-6 pt-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{product.name}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{product.description}</p>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-sm font-medium text-slate-500">Service Fee:</span>
          <span className="text-2xl font-bold text-ink">{feeLabel}</span>
        </div>
        {isServiceFeeProduct && feeError && (
          <p role="status" className="mt-2 text-xs text-red-600">
            Unable to load the current service fee. Please refresh and try again.
          </p>
        )}

        <button
          type="button"
          onClick={() => startPurchase(product, router)}
          disabled={out || feeUnavailable}
          className="btn-primary btn-lg w-full mt-5 font-bold"
        >
          {out ? "Service Unavailable" : "APPLY FOR SERVICE →"}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />
          Secure 256-bit payment via Razorpay
        </p>
      </div>
    </CustomerShell>
  );
}
