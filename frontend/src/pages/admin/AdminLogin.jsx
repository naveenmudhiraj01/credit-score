import { useNavigate } from "react-router-dom";
import AdminLoginForm from "./admin-login/AdminLogin.jsx";
import { api } from "../../lib/api";

export default function AdminLogin({ onLoginSuccess }) {
  const nav = useNavigate();

  const submit = ({ password }) =>
    api("/api/admin/login", { method: "POST", body: { password } });

  const onSuccess = () => {
    onLoginSuccess?.();
    nav("/admin", { replace: true });
  };

  return (
    <AdminLoginForm
      identifierMode="none"
      forgotPasswordHref={null}
      showRememberMe={false}
      title="Admin Login"
      subtitle="Sign in to manage customer onboarding and payment verification."
      onSubmit={submit}
      onSuccess={onSuccess}
    />
  );
}
