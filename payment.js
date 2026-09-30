/**
 * Payment boundary for yifly sponsorship.
 *
 * TODO: Connect to ECPay payment backend.
 * ECPay MerchantID, HashKey, HashIV, API secrets and signature generation must
 * live only in a backend or serverless function. GitHub Pages is public static
 * hosting, so no payment secret may ever be placed in this file or the browser.
 */
export const supportContact = {
  email: "neroprect@gmail.com",
};

// Set only after deploying the Worker. This URL is public; secrets stay in Worker Secrets.
export const paymentApiOrigin = "https://yifly-ecpay.yoeee.workers.dev";

export async function startEcpayPayment({ amount, planId, description }) {
  void description;
  if (!paymentApiOrigin) return { status: "not_ready" };
  // The website's public support flow deliberately creates an anonymous order.
  // App payments use /api/payment/create with a verified Firebase ID token.
  const response = await fetch(`${paymentApiOrigin}/api/payment/create-public`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(planId ? { planId, amount } : { amount }),
  });
  if (!response.ok) throw new Error("Unable to create payment");
  return response.json();
}
