import { startEcpayPayment, supportContact } from "./payment.js";

const minimumAmount = 50;
const amountButtons = [...document.querySelectorAll("[data-amount]")];
const customAmount = document.querySelector("#custom-amount");
const customWrap = document.querySelector("#custom-amount-wrap");
const amountError = document.querySelector("#amount-error");
const sponsorButton = document.querySelector("#sponsor-button");
const sponsorForm = document.querySelector("#sponsor-form");
const toast = document.querySelector("#payment-toast");
const contact = document.querySelector("#support-contact");
let selectedAmount = 100;
let usingCustomAmount = false;

function setError(message = "") { amountError.textContent = message; customAmount.setAttribute("aria-invalid", String(Boolean(message))); }
function chosenAmount() {
  if (!usingCustomAmount) return selectedAmount;
  const amount = Number(customAmount.value);
  if (!Number.isInteger(amount) || amount < minimumAmount) { setError(`請輸入至少 NT$${minimumAmount} 的整數金額。`); return null; }
  setError(); return amount;
}
function selectAmount(amount) {
  usingCustomAmount = amount === "custom";
  amountButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.amount === String(amount))));
  customWrap.hidden = !usingCustomAmount;
  if (usingCustomAmount) customAmount.focus(); else { selectedAmount = Number(amount); setError(); }
}
amountButtons.forEach((button) => button.addEventListener("click", () => selectAmount(button.dataset.amount)));
customAmount.addEventListener("input", chosenAmount);
function showToast() { toast.hidden = false; toast.focus(); window.clearTimeout(showToast.timeout); showToast.timeout = window.setTimeout(() => { toast.hidden = true; }, 5000); }
async function handleSponsor() {
  const amount = chosenAmount();
  if (!amount) { customAmount.focus(); return; }
  sponsorButton.disabled = true;
  await startEcpayPayment({ amount, description: "支持 yifly" });
  sponsorButton.disabled = false;
  showToast();
}
sponsorForm.addEventListener("submit", (event) => { event.preventDefault(); handleSponsor(); });
if (supportContact.email) contact.innerHTML = `<a href="mailto:${supportContact.email}">${supportContact.email}</a>`;
else contact.textContent = "正式客服 Email 即將提供。";
