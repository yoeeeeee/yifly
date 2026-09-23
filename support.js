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
const energyMessage = document.querySelector("#energy-message");
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
  const selectedButton = amountButtons.find((button) => button.dataset.amount === String(amount));
  energyMessage.classList.add("changing");
  window.setTimeout(() => {
    energyMessage.textContent = selectedButton.dataset.message;
    energyMessage.classList.remove("changing");
  }, 120);
  if (usingCustomAmount) customAmount.focus(); else { selectedAmount = Number(amount); setError(); }
}
amountButtons.forEach((button) => button.addEventListener("click", () => selectAmount(button.dataset.amount)));
customAmount.addEventListener("input", chosenAmount);

// The iOS app opens this page with ?amount=50 (or another integer), so the
// supporter lands on the exact amount they selected in the app.
const requestedAmount = Number(new URLSearchParams(window.location.search).get("amount"));
if (Number.isInteger(requestedAmount) && requestedAmount >= minimumAmount) {
  const preset = amountButtons.find((button) => Number(button.dataset.amount) === requestedAmount);
  if (preset) {
    selectAmount(preset.dataset.amount);
  } else {
    selectAmount("custom");
    customAmount.value = String(requestedAmount);
    chosenAmount();
  }
}

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
