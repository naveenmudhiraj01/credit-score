const BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Thin fetch wrapper for the backend's { ok, ... } / { ok:false, error:{code,message} } envelope.
 * Returns the parsed body whenever body.ok === true (even on 202 / 502 such as admin retry),
 * otherwise throws an Error carrying .status, .code and .data.
 */
export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: BASE ? "include" : "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Network error. Please check your connection and try again.");
    err.code = "NETWORK";
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (data?.ok) return { ...data, _status: res.status };
  if (res.status === 401 && path.startsWith("/api/admin")) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("admin-unauthorized"));
    }
  }
  const err = new Error(data?.error?.message || "Something went wrong. Please try again.");
  err.status = res.status;
  err.code = data?.error?.code;
  err.data = data;
  throw err;
}
