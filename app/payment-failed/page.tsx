"use client";

import { Suspense } from "react";
import { FailedView, Loading } from "@/components/PaymentResultViews";
import CustomerShell from "@/components/CustomerShell";

export default function PaymentFailedPage() {
  return (
    <Suspense
      fallback={
        <CustomerShell>
          <Loading />
        </CustomerShell>
      }
    >
      <FailedView />
    </Suspense>
  );
}
