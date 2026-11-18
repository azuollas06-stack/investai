// InvestAI portfelis + AI: nuotraukų atpažinimas su AI, AI portfelio apžvalga ir kainų įspėjimai telefone.
// Naudoja portfolio.js globalius: state, ASSETS, PRICES_PF, analyze, findAsset, csvSymbol, customId, money, esc, isDemo.
"use strict";
const PFAI = (() => {
  let CFG = null;
  const cfg = async () => { if (CFG) return CFG; try { CFG = await getJSON("data/ai.json"); } catch { CFG = {}; } return CFG; };
  const prem = () => { try { return localStorage.getItem("investai.premium.ai") || ""; } catch { return ""; } };
  const premHdr = () => (prem() ? { "X-Premium": prem() } : {});
  const isPremium = () => !!prem();
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  /* ---------- 1. Nuotraukos atpažinimas su AI ---------- */
  const OCR_KEY = "investai.pf.ocr"; // "ai" | "local"
  async function hasAI() { const c = await cfg(); return !!(c && c.url); }
  function chooseMode() {
    const saved = ls.get(OCR_KEY);
    if (saved === "ai" || saved === "local") return Promise.resolve(saved);
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "ocr-choice";
      d.innerHTML = `<form method="dialog" class="oc-in">
        <h2>Kaip atpažinti nuotrauką?</h2>
        <button class="oc-opt oc-ai" value="ai"><span class="oc-ico">${icon("ai", 24)}</span><span><b>Su AI <em>tiksliausia</em></b><small>AI pati „perskaito“ nuotrauką – teisingai atpažįsta įmones, sumas ir rezultatus. Nuotrauka per mūsų serverį perduodama OpenAI ir nesaugoma.</small></span></button>
        <button class="oc-opt" value="local"><span class="oc-ico">${icon("portfolio", 22)}</span><span><b>Tik mano naršyklėje</b><small>Niekur nesiunčiama, bet atpažinimas gali klysti – teks daugiau taisyti ranka.</small></span></button>
        <label class="oc-rem"><input type="checkbox" checked> Prisiminti pasirinkimą</label>
      </form>`;
      document.body.appendChild(d);
      d.addEventListener("close", () => {
        const v = d.returnValue === "local" ? "local" : d.returnValue === "ai" ? "ai" : null;
        if (v && d.querySelector(".oc-rem input").checked) ls.set(OCR_KEY, v);
        d.remove();
        resolve(v || "local");
      });
      d.showModal();
    });
  }
  async function shrink(file) {
    const img = await createImageBitmap(file);
    const s = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  }
  // Grąžina tą pačią struktūrą kaip pfParse: [{ rows, unknown, currency }]
  async function recognize(files, progressEl) {
    const c = await cfg();
    const bar = progressEl.querySelector(".progress-bar span"), txt = progressEl.querySelector("p");
    progressEl.hidden = false;
    bar.style.width = "15%"; txt.textContent = "Ruošiama nuotrauka…";
    const imgs = [];
    for (const f of [...files].filter((f) => f.type.startsWith("image/")).slice(0, 5)) imgs.push(await shrink(f));
    if (!imgs.length) throw new Error("Pasirink nuotrauką (PNG ar JPG).");
    bar.style.width = "45%"; txt.textContent = "AI skaito nuotrauką…";
    let t = 45; const tick = setInterval(() => { t = Math.min(92, t + 3); bar.style.width = t + "%"; }, 600);
    try {
      const r = await fetch(c.url + "/parse", { method: "POST", headers: { "Content-Type": "application/json", ...premHdr() }, body: JSON.stringify({ images: imgs }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "AI nepavyko");
      bar.style.width = "100%"; txt.textContent = "Baigta";
      setTimeout(() => (progressEl.hidden = true), 400);
      const rows = [], unknown = [];
      let usd = 0;
      for (const p of d.positions || []) {
        if (!(p.value > 0)) continue;
        const cur = String(p.currency || "EUR").toUpperCase();
        if (cur === "USD") usd++;
        const isCash = /^CASH$/i.test(p.ticker) || /grynieji|cash/i.test(p.name);
        const s = isCash ? CASH : csvSymbol({ ticker: p.ticker, name: p.name, pcur: cur === "GBX" ? "GBp" : cur });
        let pnlPct = typeof p.pnl_pct === "number" ? p.pnl_pct : null;
        let pnl = typeof p.pnl === "number" ? p.pnl : null;
        if (pnlPct === null && pnl !== null && p.value - pnl > 0) pnlPct = (pnl / (p.value - pnl)) * 100;
        if (pnlPct !== null && pnl === null) pnl = p.value - p.value / (1 + pnlPct / 100);
        const src = `AI: ${p.name}${p.ticker ? ` (${p.ticker})` : ""} · ${p.value.toLocaleString("lt-LT")} ${cur}`;
        const row = { s, n: s ? (findAsset(s) || {}).n || p.name : p.name, value: p.value, cur: cur === "USD" ? "USD" : "EUR", src, pnl: pnl === null ? null : Math.round(pnl * 100) / 100, pnlPct: pnlPct === null ? null : Math.round(pnlPct * 100) / 100, qty: typeof p.qty === "number" ? p.qty : null };
        if (s) rows.push(row); else unknown.push({ ...row, text: src, name: p.name, ticker: p.ticker });
      }
      return [{ rows, unknown, currency: usd > (rows.length + unknown.length) / 2 ? "USD" : "EUR", ai: true }];
    } finally { clearInterval(tick); }
  }

  /* ---------- 2. AI portfelio apžvalga ---------- */
  const REV_KEY = "investai.pf.review.v1"; // { at, sig, text }
  const sigOf = (a) => a.byAsset.map((x) => `${x.s}:${Math.round(x.p * 100)}`).join("|");
  function composition(a) {
    const pct = (p) => `${(p * 100).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %`;
    const lines = [`Portfelis: ${a.rows.length} pozicijos. Sumos nesiunčiamos – tik dalys.`];
    lines.push("Pozicijos:\n" + a.rows.slice().sort((x, y) => y.value - x.value).slice(0, 30).map((r) => `- ${r.n}${r.s && !r.s.startsWith("X:") && r.s !== CASH ? ` (${r.s})` : ""}: ${pct(r.value / a.total)}; ${[r.type, r.sector, r.country].filter(Boolean).join(", ")}${typeof r.pnlPct === "number" ? `; rezultatas nuo pirkimo ${r.pnlPct > 0 ? "+" : ""}${r.pnlPct.toLocaleString("lt-LT")} %` : ""}`).join("\n"));
    lines.push("Sektoriai (fondai išskaidyti apytiksliai): " + a.sectors.slice(0, 8).map((x) => `${x.k} ${pct(x.p)}`).join(", "));
    lines.push("Regionai: " + a.regions.slice(0, 6).map((x) => `${x.k} ${pct(x.p)}`).join(", "));
    lines.push("Tipai: " + a.byType.map((x) => `${x.k} ${pct(x.p)}`).join(", "));
    if (a.pnl && a.pnl.known) lines.push(`Bendras rezultatas nuo pirkimo: ${a.pnl.pct > 0 ? "+" : ""}${(a.pnl.pct || 0).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} % (žinomas ${a.pnl.known} iš ${a.pnl.total} pozicijų).`);
    const P = PRICES_PF.items || {};
    const ev = a.rows.map((r) => ({ r, p: P[r.s] })).filter((x) => x.p && x.p.ed && x.p.ed >= new Date().toISOString().slice(0, 10)).slice(0, 6);
    if (ev.length) lines.push("Artimiausios ataskaitos: " + ev.map((x) => `${x.r.n} ${x.p.ed}`).join(", "));
    const mv = a.rows.map((r) => ({ r, w: (P[r.s] || {}).w1 })).filter((x) => typeof x.w === "number");
    if (mv.length) lines.push("Savaitės pokyčiai: " + mv.sort((x, y) => Math.abs(y.w) - Math.abs(x.w)).slice(0, 6).map((x) => `${x.r.n} ${x.w > 0 ? "+" : ""}${x.w.toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %`).join(", "));
    if (typeof holdingChecks === "function") {
      const fl = a.rows.map((r) => ({ r, c: holdingChecks(r).filter((c) => c.lvl !== "green") })).filter((x) => x.c.length);
      if (fl.length) lines.push("Faktai apie įmones (Yahoo Finance):\n" + fl.map((x) => `- ${x.r.n}: ${x.c.map((c) => c.t).join(" ")}`).join("\n"));
    }
    return lines.join("\n");
  }
  function mdLite(t) {
    const e = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    let out = "", list = false;
    for (const raw of e.split("\n")) {
      const l = raw.trim(), m = l.match(/^(?:[-•*]|\d+[.)])\s+(.*)/);
      if (m) { if (!list) { out += "<ul>"; list = true; } out += `<li>${m[1]}</li>`; continue; }
      if (list) { out += "</ul>"; list = false; }
      if (l) out += /^<b>[^<]+<\/b>:?$/.test(l) ? `<h3>${l.replace(/<\/?b>|:$/g, "")}</h3>` : `<p>${l}</p>`;
    }
    return out + (list ? "</ul>" : "");
  }
  async function renderReview(a) {
    const el = $("#r-ai");
    if (!el) return;
    if (!(await hasAI()) || isDemo || !a.rows.length) { el.hidden = true; return; }
    el.hidden = false;
    let saved = null; try { saved = JSON.parse(ls.get(REV_KEY) || "null"); } catch {}
    const weekMs = 7 * 864e5;
    const canFree = !saved || Date.now() - saved.at > weekMs;
    const allowed = isPremium() || canFree;
    const stale = saved && saved.sig !== sigOf(a);
    const nextTxt = saved && !isPremium() && !canFree ? new Date(saved.at + weekMs).toLocaleDateString("lt-LT", { month: "long", day: "numeric" }) : "";
    el.innerHTML = `<div class="rai-head"><span class="rai-ico">${icon("ai", 22)}</span><div><h2>AI portfelio apžvalga</h2><p class="muted small">${saved ? `Sukurta ${new Date(saved.at).toLocaleDateString("lt-LT", { month: "long", day: "numeric" })}${stale ? " · portfelis nuo to laiko pasikeitė" : ""}` : "Santrauka, išsiskiriantys dalykai ir rizikos – per kelias sekundes"}</p></div></div>
      <div class="rai-body">${saved ? mdLite(saved.text) : `<p class="muted">AI peržiūrės tavo portfelio sudėtį (tik procentus, be sumų) ir paaiškins, kas jame svarbiausia. Rekomendacijų, ką pirkti ar parduoti, neteiks.</p>`}</div>
      <div class="rai-foot">${allowed ? `<button type="button" class="btn ${saved ? "" : "primary"}" id="rai-go">${saved ? "Atnaujinti apžvalgą" : "Sukurti apžvalgą"}</button>` : `<a class="btn" href="premium.html">${icon("gem", 16)} Premium – kada nori</a><span class="muted small">Kita nemokama apžvalga – ${nextTxt}</span>`}
      ${!isPremium() && allowed ? `<span class="muted small">Nemokamai – kartą per savaitę</span>` : ""}</div>
      <p class="rai-note">Apžvalgą rašo AI (OpenAI GPT-6 Luna). Ji gali klysti ir nėra investavimo rekomendacija.</p>`;
    const go = $("#rai-go");
    if (go) go.addEventListener("click", () => runReview(a));
  }
  async function runReview(a) {
    const el = $("#r-ai"), body = el.querySelector(".rai-body"), go = $("#rai-go");
    const c = await cfg();
    go.disabled = true; go.textContent = "AI rašo…";
    body.innerHTML = `<p class="ai-think">Peržiūriu tavo portfelį…</p>`;
    let text = "";
    try {
      const r = await fetch(c.url + "/chat", { method: "POST", headers: { "Content-Type": "application/json", ...premHdr() }, body: JSON.stringify({ mode: "review", context: composition(a), messages: [{ role: "user", content: "Parašyk mano portfelio apžvalgą." }] }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "AI šiuo metu neatsako."); }
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) { const { value, done } = await rd.read(); if (done) break; text += dec.decode(value, { stream: true }); body.innerHTML = mdLite(text); }
      if (!text.trim()) throw new Error("Atsakymas tuščias.");
      ls.set(REV_KEY, JSON.stringify({ at: Date.now(), sig: sigOf(a), text }));
      renderReview(a);
    } catch (e) {
      body.innerHTML = `<p class="rai-err">${esc(e.message || "Nepavyko")}</p>`;
      go.disabled = false; go.textContent = "Bandyti dar kartą";
    }
  }

  /* ---------- 3. Kainų įspėjimai telefone ---------- */
  async function renderAlerts(a) {
    const el = $("#r-alerts");
    if (!el) return;
    if (!(await hasAI()) || isDemo) { el.hidden = true; return; }
    el.hidden = false;
    const P = PRICES_PF.items || {};
    const cands = a.rows.filter((r) => r.s !== CASH && P[r.s]).sort((x, y) => y.value - x.value);
    const cfgA = ALERTS.get();
    const max = isPremium() ? 60 : 3;
    const sel = new Set(cfgA ? cfgA.symbols : cands.slice(0, max).map((r) => r.s));
    const on = ALERTS.isOn();
    const nLv = cfgA ? Object.keys(cfgA.levels || {}).length : 0;
    const head = `<div class="al-head"><span class="al-ico">${icon("bell", 22)}</span><div><h2>Įspėjimai telefone</h2><p class="muted small">${on ? `Įjungta · ${cfgA.symbols.length} ${cfgA.symbols.length === 1 ? "akcija" : "akcijos"} · ±${cfgA.th} % per dieną${nLv ? ` · ${nLv} kainos lygiai` : ""}` : "Pranešime, kai tavo akcija per dieną pajudės smarkiau nei įprastai"}</p></div>${on ? `<span class="al-on">Įjungta</span>` : ""}</div>`;
    if (!ALERTS.canUse()) { el.innerHTML = head + `<p class="al-help">${ALERTS.blockedText()}</p>`; return; }
    el.innerHTML = head + `
      <div class="al-pick" role="group" aria-label="Akcijos įspėjimams">${cands.slice(0, 24).map((r) => `<button type="button" class="al-chip" data-s="${esc(r.s)}" aria-pressed="${sel.has(r.s)}">${logoHTML(r.s, r.n, "#1d3a63", 22)}<span>${esc(r.n)}</span></button>`).join("")}</div>
      <p class="muted small al-max">${isPremium() ? "Premium: gali pasirinkti visas akcijas." : `Nemokamai – iki ${max} akcijų. <a href="premium.html">Premium</a> – visos ir priminimai apie ataskaitas.`} Kainos lygį (pvz., „kai nukris žemiau 140 $“) nustatysi akcijos puslapyje varpeliu.</p>
      <div class="al-row"><span>Pranešti, kai per dieną pajuda</span><div class="seg" role="group" aria-label="Riba" id="al-th">${[3, 5, 10].map((t) => `<button type="button" data-th="${t}" aria-pressed="${((cfgA && cfgA.th) || 5) === t}">±${t} %</button>`).join("")}</div></div>
      <label class="al-row al-ed"><span>Savaitės santrauka sekmadienio vakarą</span><input type="checkbox" id="al-wk" ${!cfgA || cfgA.weekly !== false ? "checked" : ""}></label>
      ${isPremium() ? `<label class="al-row al-ed"><span>Priminti dieną prieš ataskaitas</span><input type="checkbox" id="al-ed" ${!cfgA || cfgA.earnings ? "checked" : ""}></label>` : ""}
      <div class="al-actions"><button type="button" class="btn primary" id="al-save">${on ? "Išsaugoti" : "Įjungti įspėjimus"}</button>${on ? `<button type="button" class="btn" id="al-test">Bandomasis pranešimas</button><button type="button" class="linkish" id="al-off">Išjungti</button>` : ""}</div>
      <p class="al-msg muted small" role="status"></p>`;
    const msg = el.querySelector(".al-msg");
    el.querySelectorAll(".al-chip").forEach((b) => b.addEventListener("click", () => {
      const s = b.dataset.s;
      if (sel.has(s)) sel.delete(s);
      else if (sel.size >= max) { msg.innerHTML = `Nemokamai galima pasirinkti iki ${max} akcijų. <a href="premium.html">Premium</a> – visas.`; return; }
      else sel.add(s);
      b.setAttribute("aria-pressed", sel.has(s));
    }));
    el.querySelectorAll("#al-th button").forEach((b) => b.addEventListener("click", () => el.querySelectorAll("#al-th button").forEach((x) => x.setAttribute("aria-pressed", x === b))));
    $("#al-save").addEventListener("click", async () => {
      const btn = $("#al-save");
      if (!sel.size && !nLv) { msg.textContent = "Pasirink bent vieną akciją."; return; }
      btn.disabled = true; msg.textContent = "Jungiama…";
      try {
        const symbols = [...sel];
        const prev = ALERTS.get() || {};
        const names = { ...(prev.names || {}), ...Object.fromEntries(symbols.map((x) => [x, (cands.find((r) => r.s === x) || {}).n || x])) };
        await ALERTS.save({ ...prev, symbols, names, th: +(el.querySelector("#al-th [aria-pressed=true]") || {}).dataset?.th || 5, weekly: $("#al-wk").checked, earnings: !!($("#al-ed") && $("#al-ed").checked) });
        renderAlerts(a);
      } catch (e) { msg.textContent = e.message || "Nepavyko įjungti."; btn.disabled = false; }
    });
    const t = $("#al-test");
    if (t) t.addEventListener("click", async () => { try { await ALERTS.test(); msg.textContent = "Išsiųsta – pranešimas turėtų ateiti per kelias sekundes."; } catch (e) { msg.textContent = e.message; } });
    const off = $("#al-off");
    if (off) off.addEventListener("click", async () => { await ALERTS.off(); renderAlerts(a); });
  }

  return { hasAI, chooseMode, recognize, renderReview, renderAlerts };
})();
