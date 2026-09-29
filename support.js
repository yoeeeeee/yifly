import { startEcpayPayment, supportContact } from "./payment.js";

const minimumAmount = 50;
const maximumAmount = 10000;
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
  if (!Number.isInteger(amount) || amount < minimumAmount || amount > maximumAmount) { setError(`請輸入 NT$${minimumAmount} 至 NT$${maximumAmount} 的整數金額。`); return null; }
  selectedAmount = amount;
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

function initializeAmountFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const amountParam = params.get("amount");
  const plan = params.get("plan");
  // `once` is the only plan today. Keep reading it so future plans can extend
  // this initialization without creating a separate amount-selection path.
  if (plan && plan !== "once") return;
  if (!amountParam || !/^\d+$/.test(amountParam)) return;

  const requestedAmount = Number(amountParam);
  if (!Number.isInteger(requestedAmount) || requestedAmount < minimumAmount || requestedAmount > maximumAmount) return;

  const fixedChoice = amountButtons.find((button) => Number(button.dataset.amount) === requestedAmount);
  if (fixedChoice) {
    selectAmount(fixedChoice.dataset.amount);
    return;
  }

  selectAmount("custom");
  customAmount.value = String(requestedAmount);
  chosenAmount();
}

initializeAmountFromUrl();
function showToast() { toast.hidden = false; toast.focus(); window.clearTimeout(showToast.timeout); showToast.timeout = window.setTimeout(() => { toast.hidden = true; }, 5000); }
async function handleSponsor() {
  const amount = chosenAmount();
  if (!amount) { customAmount.focus(); return; }
  sponsorButton.disabled = true;
  try {
    const payment = await startEcpayPayment({ amount, description: "支持 yifly 開發" });
    if (payment.status === "not_ready") { showToast(); return; }
    const form = document.createElement("form"); form.method = "POST"; form.action = payment.action;
    Object.entries(payment.params).forEach(([name, value]) => { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.append(input); });
    document.body.append(form); form.submit();
  } catch { toast.textContent = "暫時無法建立付款，請稍後再試。"; showToast(); }
  finally { sponsorButton.disabled = false; }
}
sponsorForm.addEventListener("submit", (event) => { event.preventDefault(); handleSponsor(); });
if (supportContact.email) contact.innerHTML = `<a href="mailto:${supportContact.email}">${supportContact.email}</a>`;
else contact.textContent = "正式客服 Email 即將提供。";
