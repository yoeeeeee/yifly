/**
 * Payment boundary for yifly sponsorship.
 *
 * TODO: Connect to ECPay payment backend.
 * ECPay MerchantID, HashKey, HashIV, API secrets and signature generation must
 * live only in a backend or serverless function. GitHub Pages is public static
 * hosting, so no payment secret may ever be placed in this file or the browser.
 */
export const supportContact = {
  email: "",
  // TODO: Set the official yifly support email when it is available.
};

export async function startEcpayPayment({ amount, description }) {
  void amount;
  void description;
  // TODO: Request a signed payment session from a secure ECPay backend here.
  return { status: "not_ready" };
}
