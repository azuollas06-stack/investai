// InvestAI Premium – BANDOMOJI versija. Atrakinama slaptažodžiu naršyklėje (ne saugi apsauga – tik testavimui).
// Vėliau keisime į tikras paskyras ir mokėjimus (pvz., Supabase + Stripe).
"use strict";

const PREMIUM_KEY = "investai.premium.v1";
const PREMIUM_HASH = "543ba024004db07960b6030f32b61d6b7e3a8b100857e81466001954b219e04b";

function isPremium() {
  try { return localStorage.getItem(PREMIUM_KEY) === PREMIUM_HASH; } catch { return false; }
}
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function unlockPremium(password) {
  const h = await sha256(password.trim());
  if (h !== PREMIUM_HASH) return false;
  try { localStorage.setItem(PREMIUM_KEY, h); } catch {}
  applyPremium();
  return true;
}
function lockPremium() {
  try { localStorage.removeItem(PREMIUM_KEY); } catch {}
  applyPremium();
}
// Premium elementai: atrakinus – rodomi; kitaip – rodomas kvietimas
function applyPremium() {
  const on = isPremium();
  document.documentElement.classList.toggle("is-premium", on);
  document.querySelectorAll(".premium-only").forEach((el) => {
    let lock = el.querySelector(":scope > .premium-lock");
    if (on) { if (lock) lock.remove(); return; }
    if (!lock) {
      lock = document.createElement("a");
      lock.className = "premium-lock";
      lock.href = "premium.html";
      lock.innerHTML = `<span class="pl-ico" aria-hidden="true">★</span><span><b>Premium funkcija</b><small>Atrakink bandomąją Premium versiją</small></span>`;
      el.prepend(lock);
    }
  });
}
document.addEventListener("DOMContentLoaded", applyPremium);

/* ---------- Premium puslapis ---------- */
document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.page !== "premium") return;
  const render = () => {
    const on = isPremium();
    $("#pm-locked").hidden = on;
    $("#pm-unlocked").hidden = !on;
  };
  render();
  $("#pm-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await unlockPremium($("#pm-pass").value);
    $("#pm-err").hidden = ok;
    if (ok) { $("#pm-pass").value = ""; render(); }
  });
  $("#pm-lock").addEventListener("click", () => { lockPremium(); render(); });
});
