// InvestAI asistentas: pokalbio langas, kuris klausimus siunčia per mūsų serverį (Cloudflare) į AI modelį.
// Pokalbis laikomas tik šioje naršyklės kortelėje (sessionStorage) ir uždarius ją dingsta.
"use strict";
(function () {
  const STORE = "investai.ai.chat.v1";
  const PF_OPT = "investai.ai.pf";
  let CFG = null, busy = false, chat = [], left = null, dlg = null;

  const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (v) => (v === null || v === undefined || !Number.isFinite(+v) ? "–" : `${v > 0 ? "+" : ""}${(+v).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %`);
  const num = (v, d = 2) => (+v).toLocaleString("lt-LT", { maximumFractionDigits: d });
  const ltN = (n, one, few, many) => { const t = n % 10, h = n % 100; return t === 1 && h !== 11 ? one : t >= 2 && t <= 9 && (h < 12 || h > 19) ? few : many; };
  const load = () => { try { return JSON.parse(sessionStorage.getItem(STORE) || "[]"); } catch { return []; } };
  const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify(chat.slice(-20))); } catch {} };
  const pfAllowed = () => { try { return localStorage.getItem(PF_OPT) !== "0"; } catch { return true; } };
  const holdings = () => { try { const d = JSON.parse(localStorage.getItem("investai.portfolio.v1") || "null"); return (d && d.holdings) || []; } catch { return []; } };
  const pageSym = () => (document.body.dataset.page === "asset" ? new URLSearchParams(location.search).get("s") : null);

  /* ---------- Paprastas tekstas → HTML (paryškinimai, sąrašai, pastraipos) ---------- */
  function md(text) {
    const lines = escH(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split(/\n/);
    let out = "", list = false;
    for (const raw of lines) {
      const l = raw.trim();
      const m = l.match(/^(?:[-•*]|\d+[.)])\s+(.*)/);
      if (m) { if (!list) { out += "<ul>"; list = true; } out += `<li>${m[1]}</li>`; continue; }
      if (list) { out += "</ul>"; list = false; }
      if (l) out += `<p>${l.replace(/^#+\s*/, "")}</p>`;
    }
    return out + (list ? "</ul>" : "");
  }

  /* ---------- Kontekstas iš svetainės ---------- */
  let ASSET_LIST = null;
  async function assets() {
    if (ASSET_LIST) return ASSET_LIST;
    try { ASSET_LIST = (await getJSON("data/assets.json")).groups.flatMap((g) => g.items); } catch { ASSET_LIST = []; }
    return ASSET_LIST;
  }
  async function context(withPf) {
    const out = [];
    const P = await loadPrices().catch(() => ({ items: {} }));
    const A = await assets();
    const info = (s) => A.find((a) => a.s === s) || {};
    out.push(`Puslapis: ${document.title.replace(/\s*[–|-]\s*InvestAI.*$/, "")}`);
    if (typeof ONBOARD !== "undefined" && ONBOARD.describe(ONBOARD.get())) out.push(ONBOARD.describe(ONBOARD.get()) + " Pritaikyk paaiškinimų lygį, bet rekomendacijų neteik.");
    // Rinka trumpai
    const idx = [["AMEX:SPY", "S&P 500 (SPY)"], ["NASDAQ:QQQ", "Nasdaq 100 (QQQ)"], ["XETR:VWCE", "Pasaulio akcijos (VWCE)"], ["BITSTAMP:BTCUSD", "Bitcoin"], ["AMEX:GLD", "Auksas (GLD)"]]
      .filter(([s]) => P.items[s]).map(([s, n]) => `${n}: dienos pokytis ${pct(P.items[s].d1)}, metų pradžios ${pct(P.items[s].ytd)}`);
    if (idx.length) out.push(`Rinka (${P.items["AMEX:SPY"] ? priceStamp(P.items["AMEX:SPY"]) : "uždelsti duomenys"}):\n- ${idx.join("\n- ")}`);
    // Aktyvas, kurį žmogus žiūri
    const sym = pageSym();
    if (sym) {
      const p = P.items[sym], a = info(sym);
      if (p) {
        const parts = [`Kaina ${num(p.price)} ${p.cur || ""} (${priceStamp(p)})`, `diena ${pct(p.d1)}`, `savaitė ${pct(p.w1)}`, `mėnuo ${pct(p.m1)}`, `nuo metų pradžios ${pct(p.ytd)}`, `metai ${pct(p.y1)}`, `52 sav. intervalas ${num(p.lo52)}–${num(p.hi52)}`];
        if (p.pe) parts.push(`P/E ${num(p.pe, 1)}`);
        if (p.fpe) parts.push(`ateities P/E ${num(p.fpe, 1)}`);
        if (p.dy) parts.push(`dividendų pajamingumas ${num(p.dy, 2)} %`);
        if (p.mcap) parts.push(`kapitalizacija ${num(p.mcap / 1e9, 0)} mlrd.`);
        if (p.ed) parts.push(`ataskaitų data ${p.ed}`);
        if (p.an && p.an.n) parts.push(`analitikai (${p.an.n}): vidutinė tikslinė kaina ${num(p.an.tMean)} (intervalas ${num(p.an.tLow)}–${num(p.an.tHigh)}), sutarimas „${p.an.key}“ – tai analitikų nuomonė, ne faktas`);
        out.push(`Žiūrimas aktyvas: ${a.n || sym} (${sym}${a.type ? `, ${a.type}` : ""}${a.sector ? `, ${a.sector}` : ""}${a.country ? `, ${a.country}` : ""}).\n${parts.join("; ")}.`);
      }
      try {
        const ex = (await loadExplain())[sym];
        if (ex) out.push(`InvestAI paaiškinimas „kodėl ${ex.direction === "up" ? "kilo" : "krito"}“ (${ex.date}): ${ex.headline}. ${(ex.points || []).join(" ")}`);
      } catch {}
    }
    // Naujienos
    try {
      const N = await getJSON("data/news.json");
      const nm = sym ? ((A.find((a) => a.s === sym) || {}).n || "").toLowerCase() : "";
      const rel = [...(N.stories || []), ...(N.events || [])].filter((x) => !sym || (x.symbols || []).includes(sym) || (nm.length > 2 && String(x.title).toLowerCase().includes(nm))).slice(0, 5);
      if (rel.length) out.push(`InvestAI naujienos:\n${rel.map((x) => `- ${x.date}: ${x.title}${x.lead ? ` – ${x.lead}` : ""}`).join("\n")}`);
    } catch {}
    // Portfelis (tik dalys procentais, be sumų)
    const hs = holdings().filter((h) => h.value > 0);
    if (withPf && hs.length) {
      const total = hs.reduce((t, h) => t + h.value, 0);
      const rows = hs.sort((x, y) => y.value - x.value).slice(0, 25).map((h) => {
        const a = info(h.s), name = h.n || a.n || h.s;
        const meta = [a.type, a.sector, a.country].filter(Boolean).join(", ");
        const pnl = typeof h.pnlPct === "number" ? `, rezultatas nuo pirkimo ${pct(h.pnlPct)}` : "";
        return `- ${name}${h.s && !h.s.startsWith("X:") && h.s !== "CASH" ? ` (${h.s})` : ""}: ${num((h.value / total) * 100, 1)} % portfelio${meta ? `; ${meta}` : ""}${pnl}`;
      });
      out.push(`Vartotojo portfelis (${hs.length} ${ltN(hs.length, "pozicija", "pozicijos", "pozicijų")}; sumos nesiunčiamos, tik dalys):\n${rows.join("\n")}`);
    }
    return out.join("\n\n");
  }

  /* ---------- Siūlomi klausimai pagal puslapį ---------- */
  function suggestions() {
    const page = document.body.dataset.page, sym = pageSym();
    const name = sym ? (document.title.replace(/\s*[–|-]\s*InvestAI.*$/, "").trim() || sym.split(":")[1]) : "";
    if (sym) return [["markets", `Kodėl ${name} kaina pastaruoju metu keitėsi?`], ["glossary", `Ką reiškia ${name} P/E rodiklis?`], ["strategy", `Kokios rizikos būdingos ${name}?`]];
    if (page === "portfolio" && holdings().length) return [["portfolio", "Kaip išskaidytas mano portfelis?"], ["markets", "Kurie sektoriai mano portfelyje dominuoja?"], ["strategy", "Kokios rizikos būdingos tokiai sudėčiai?"]];
    if (page === "tools") return [["tools", "Kaip veikia sudėtinės palūkanos?"], ["glossary", "Kaip apmokestinamas investicijų pelnas Lietuvoje?"], ["portfolio", "Kas yra investicinė sąskaita?"]];
    return [["glossary", "Kas yra ETF ir kuo jis skiriasi nuo akcijos?"], ["markets", "Kas šiandien vyksta rinkose?"], ["news", "Ką reiškia dividendai?"]];
  }
  const ico = (id, n = 20) => (typeof icon === "function" ? icon(id, n) : "");
  const premiumToken = () => { try { return localStorage.getItem("investai.premium.ai") || ""; } catch { return ""; } };
  const isPrem = () => { try { return !!localStorage.getItem("investai.premium.v1"); } catch { return false; } };

  /* ---------- Langas ---------- */
  const SPARK = typeof icon === "function" ? icon("ai", 22) : "";
  const ORB = (cls = "") => `<span class="ai-orb ${cls}" aria-hidden="true">${SPARK}</span>`;
  function bubbles() {
    if (!chat.length) return `<div class="ai-hello">${ORB("big")}<h2>Labas! Ko nori paklausti?</h2><p>Paaiškinu terminus, rinkos įvykius ir tavo portfelio sudėtį – paprastai ir lietuviškai.</p></div>
      <div class="ai-sugg">${suggestions().map(([i, q]) => `<button type="button" class="ai-card"><span class="ai-card-ico">${ico(i, 20)}</span><span>${escH(q)}</span><span class="ai-card-go">${ico("chevron", 18)}</span></button>`).join("")}</div>`;
    return chat.map((m) => m.role === "user"
      ? `<div class="ai-msg me"><p>${escH(m.content)}</p></div>`
      : `<div class="ai-msg bot${m.err ? " err" : ""}">${ORB("sm")}<div class="ai-txt">${md(m.content) || '<span class="ai-think">Galvoju…</span>'}</div></div>`).join("");
  }
  function render() {
    if (!dlg) return;
    const log = dlg.querySelector(".ai-log");
    log.innerHTML = bubbles();
    log.scrollTop = log.scrollHeight;
    const sub = dlg.querySelector(".ai-left");
    sub.innerHTML = `${left === null ? "Pasiruošęs" : `Liko ${left} ${ltN(left, "klausimas", "klausimai", "klausimų")} šiandien`}${prem ? ' <span class="ai-prem">${ico("gem", 11)} Premium</span>' : ""}`;
    dlg.querySelector(".ai-send").disabled = busy;
    dlg.querySelector(".ai-clear").hidden = !chat.length || busy;
    dlg.classList.toggle("is-busy", busy);
  }
  let prem = false;
  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "ai-sheet";
    dlg.setAttribute("aria-label", "InvestAI asistentas");
    const hasPf = holdings().length > 0;
    prem = !!premiumToken();
    const upsell = !prem ? (isPrem() ? `<a class="ai-up" href="premium.html">${ico("gem", 14)} Premium: įvesk slaptažodį iš naujo</a>` : `<a class="ai-up" href="premium.html">${ico("gem", 14)} Premium – 2× daugiau klausimų</a>`) : "";
    dlg.innerHTML = `<div class="ai-inner"><div class="ai-aurora" aria-hidden="true"></div>
      <header class="ai-head">${ORB()}<div><b>InvestAI asistentas</b><small class="ai-left"></small></div>
        <button type="button" class="icon-btn ai-clear" hidden aria-label="Naujas pokalbis" title="Naujas pokalbis"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        <button type="button" class="icon-btn ai-close" aria-label="Uždaryti">${ico("close", 22) || "✕"}</button></header>
      <div class="ai-log" aria-live="polite"></div>
      <form class="ai-form">
        ${hasPf ? `<label class="ai-pf"><input type="checkbox" ${pfAllowed() ? "checked" : ""}><span class="ai-switch" aria-hidden="true"></span>Asistentas mato mano portfelio sudėtį (tik %)</label>` : ""}
        <div class="ai-row"><textarea rows="1" maxlength="2000" placeholder="Klausk bet ko apie investavimą…" aria-label="Klausimas"></textarea><button class="ai-send" type="submit" aria-label="Siųsti"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div>
        <p class="ai-note">${upsell}AI gali klysti, o tai nėra investavimo rekomendacija. Klausimai per mūsų serverį perduodami OpenAI ir nesaugomi. <a href="apie.html#ai">Daugiau</a></p>
      </form></div>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector("textarea");
    const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
    ta.addEventListener("input", grow);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); dlg.querySelector(".ai-form").requestSubmit(); } });
    dlg.querySelector(".ai-form").addEventListener("submit", (e) => { e.preventDefault(); const q = ta.value.trim(); if (q && !busy) { ta.value = ""; grow(); ask(q); } });
    dlg.querySelector(".ai-log").addEventListener("click", (e) => { const b = e.target.closest(".ai-card"); if (b) ask(b.textContent.trim()); });
    dlg.querySelector(".ai-close").addEventListener("click", () => dlg.close());
    dlg.querySelector(".ai-clear").addEventListener("click", () => { chat = []; save(); render(); ta.focus(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    const pf = dlg.querySelector(".ai-pf input");
    if (pf) pf.addEventListener("change", () => { try { localStorage.setItem(PF_OPT, pf.checked ? "1" : "0"); } catch {} });
  }
  async function open(q) {
    if (!dlg) build();
    chat = load();
    render();
    if (!dlg.open) dlg.showModal();
    if (q) ask(q); else if (matchMedia("(pointer: fine)").matches) dlg.querySelector("textarea").focus();
    if (left === null) {
      fetch(CFG.url + "/limits", { headers: premiumToken() ? { "X-Premium": premiumToken() } : {} }).then((r) => r.json()).then((d) => { if (typeof d.left === "number") { left = d.left; prem = !!d.premium; render(); } }).catch(() => {});
    }
  }

  async function ask(q) {
    if (busy) return;
    busy = true;
    chat.push({ role: "user", content: q });
    const bot = { role: "assistant", content: "" };
    chat.push(bot);
    render();
    try {
      const pfBox = dlg.querySelector(".ai-pf input");
      const ctx = await context(pfBox ? pfBox.checked : false);
      const msgs = chat.filter((m) => m !== bot && !m.err).slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const r = await fetch(CFG.url + "/chat", { method: "POST", headers: { "Content-Type": "application/json", ...(premiumToken() ? { "X-Premium": premiumToken() } : {}) }, body: JSON.stringify({ messages: msgs, context: ctx }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (typeof d.left === "number") left = d.left;
        throw new Error(d.error || "Asistentas šiuo metu neatsako.");
      }
      const l = r.headers.get("X-Left");
      if (l !== null) left = +l;
      const reader = r.body.getReader(), dec = new TextDecoder();
      let last = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bot.content += dec.decode(value, { stream: true });
        if (Date.now() - last > 60) { last = Date.now(); render(); }
      }
      if (!bot.content.trim()) throw new Error("Atsakymas tuščias. Pabandyk perklausti.");
    } catch (e) {
      bot.content = e.message && !/fetch|network/i.test(e.message) ? e.message : "Nepavyko susisiekti su asistentu. Patikrink internetą ir pabandyk dar kartą.";
      bot.err = true;
    }
    busy = false;
    save();
    render();
  }

  /* ---------- Paleidimas ---------- */
  async function init() {
    try { CFG = await getJSON("data/ai.json"); } catch { return; }
    if (!CFG || !/^https:\/\//.test(CFG.url || "")) return; // serverio nėra – mygtuko nerodome
    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "ai-fab";
    fab.setAttribute("aria-label", "Klausti InvestAI asistento");
    fab.innerHTML = `<span class="ai-fab-ico">${SPARK}</span><span>Klausti AI</span>`;
    fab.addEventListener("click", () => open());
    document.body.appendChild(fab);
    document.body.classList.add("has-ai");
    document.querySelectorAll("[data-ai-open]").forEach((b) => { b.hidden = false; b.addEventListener("click", () => open(b.dataset.aiQ || "")); });
    window.openAI = open;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
