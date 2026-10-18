"use client";

import { useRouter } from "next/navigation";
import AdminLoginForm from "@/components/admin-login/AdminLogin.jsx";
import { api } from "@/lib/api";

export default function AdminLogin({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const router = useRouter();

  const submit = ({ password }: { password: string }) =>
    api("/api/admin/login", { method: "POST", body: { password } });

  const onSuccess = () => {
    onLoginSuccess?.();
    router.replace("/admin");
    router.refresh();
  };

  return (
    <AdminLoginForm
      identifierMode="none"
      forgotPasswordHref={undefined}
      showRememberMe={false}
      title="Admin Login"
      subtitle="Sign in to manage customer onboarding and payment verification."
      onSubmit={submit}
      onSuccess={onSuccess}
    />
  );
}
