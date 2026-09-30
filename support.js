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
let selectedPlan = "once";

function setError(message = "") { amountError.textContent = message; customAmount.setAttribute("aria-invalid", String(Boolean(message))); }
function chosenAmount() {
  if (!usingCustomAmount) return selectedAmount;
  const amount = Number(customAmount.value);
  if (!Number.isInteger(amount) || amount < minimumAmount) { setError(`請輸入至少 NT$${minimumAmount} 的整數金額。`); return null; }
  setError(); return amount;
}
function selectAmount(amount) {
  usingCustomAmount = amount === "custom";
  const selectedButton = amountButtons.find((button) => button.dataset.amount === String(amount));
  selectedPlan = selectedButton?.dataset.plan || "once";
  amountButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.amount === String(amount))));
  customWrap.hidden = !usingCustomAmount;
  energyMessage.classList.add("changing");
  window.setTimeout(() => {
    energyMessage.textContent = selectedButton?.dataset.message || "❤️ 謝謝你願意贊助 yifly。";
    energyMessage.classList.remove("changing");
  }, 120);
  if (usingCustomAmount) customAmount.focus(); else { selectedAmount = Number(amount); setError(); }
}
amountButtons.forEach((button) => button.addEventListener("click", () => selectAmount(button.dataset.amount)));
customAmount.addEventListener("input", chosenAmount);
function showToast() { toast.hidden = false; toast.focus(); window.clearTimeout(showToast.timeout); showToast.timeout = window.setTimeout(() => { toast.hidden = true; }, 5000); }
async function handleSponsor() {
  const amount = chosenAmount();
  if (!amount) { customAmount.focus(); return; }
  if (selectedPlan === "monthly") {
    toast.textContent = "每月固定贊助正在進行 Stage 測試，暫時不會建立付款。";
    showToast();
    return;
  }
  sponsorButton.disabled = true;
  try {
    const planId = usingCustomAmount ? undefined : `support_${amount}`;
    const payment = await startEcpayPayment({ amount, planId, description: "支持 yifly 開發" });
    if (payment.status === "not_ready") { showToast(); return; }
    const form = document.createElement("form"); form.method = "POST"; form.action = payment.action;
    Object.entries(payment.params).forEach(([name, value]) => { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.append(input); });
    document.body.append(form); form.submit();
  } catch { toast.textContent = "暫時無法建立付款，請稍後再試。"; showToast(); }
  finally { sponsorButton.disabled = false; }
}
sponsorForm.addEventListener("submit", (event) => { event.preventDefault(); handleSponsor(); });
function selectAmountFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("plan") && params.get("plan") !== "once") return;
  const amount = Number(params.get("amount"));
  if (!Number.isInteger(amount) || amount < minimumAmount || amount > 10000) return;
  const fixed = amountButtons.find((button) => button.dataset.amount === String(amount) && !button.dataset.plan);
  if (fixed) selectAmount(fixed.dataset.amount);
  else { customAmount.value = String(amount); selectAmount("custom"); selectedAmount = amount; }
}
selectAmountFromUrl();
if (supportContact.email) contact.innerHTML = `<a href="mailto:${supportContact.email}">${supportContact.email}</a>`;
else contact.textContent = "正式客服 Email 即將提供。";
