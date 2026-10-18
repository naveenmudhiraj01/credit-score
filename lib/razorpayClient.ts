let pending: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).Razorpay) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      pending = null;
      reject(new Error("Could not load Razorpay. Please check your connection."));
    };
    document.body.appendChild(s);
  });
  return pending;
}
