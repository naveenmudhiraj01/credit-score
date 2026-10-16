let pending;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { pending = null; reject(new Error("Could not load Razorpay. Please check your connection.")); };
    document.body.appendChild(s);
  });
  return pending;
}
