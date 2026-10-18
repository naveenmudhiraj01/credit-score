"use client";

import { Suspense } from "react";
import { PendingView, Loading } from "@/components/PaymentResultViews";
import CustomerShell from "@/components/CustomerShell";

export default function PaymentPendingPage() {
  return (
    <Suspense
      fallback={
        <CustomerShell>
          <Loading />
        </CustomerShell>
      }
    >
      <PendingView />
    </Suspense>
  );
}
