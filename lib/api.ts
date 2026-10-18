/**
 * Thin fetch wrapper for the unified Next.js API endpoints { ok, ... } / { ok:false, error:{code,message} } envelope.
 * Returns the parsed body whenever body.ok === true (even on 202 / 502 such as admin retry),
 * otherwise throws an Error carrying .status, .code and .data.
 */
export async function api<T = any>(path: string, { method = "GET", body }: { method?: string; body?: any } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err: any = new Error("Network error. Please check your connection and try again.");
    err.code = "NETWORK";
    throw err;
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (data?.ok) return { ...data, _status: res.status };
  if (res.status === 401 && path.startsWith("/api/admin")) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("admin-unauthorized"));
    }
  }
  const err: any = new Error(data?.error?.message || "Something went wrong. Please try again.");
  err.status = res.status;
  err.code = data?.error?.code;
  err.data = data;
  throw err;
}
