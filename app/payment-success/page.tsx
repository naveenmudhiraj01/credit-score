"use client";

import { Suspense } from "react";
import { SuccessView, Loading } from "@/components/PaymentResultViews";
import CustomerShell from "@/components/CustomerShell";

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <CustomerShell>
          <Loading />
        </CustomerShell>
      }
    >
      <SuccessView />
    </Suspense>
  );
}
