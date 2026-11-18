// InvestAI – akcijų atranka. Sąrašą lemia vartotojo pasirinkti filtrai; rūšiavimą renkasi vartotojas.
// Naudoja app.js (logoHTML, sparkSVG, fmtPct, loadPrices, loadExplain, helpHTML), portfolio.js (state, load, analyze, meta, CASH, pct, money)
// ir premium.js (isPremium).
"use strict";

const REGION_OF = (c) => (c === "JAV" ? "JAV" : ["Lietuva", "Latvija", "Estija"].includes(c) ? "Baltija" : c === "Pasaulis" ? "Pasaulis" : ["Vokietija", "Prancūzija", "Nyderlandai", "Italija", "Švedija", "Norvegija", "Danija", "Suomija", "Didžioji Britanija", "Šveicarija", "Europa"].includes(c) ? "Europa" : c === "Be šalies" ? "Be šalies" : "Kita");
const AN_LABEL = { strong_buy: "Stipriai pirkti", buy: "Pirkti", hold: "Laikyti", underperform: "Prasčiau už rinką", sell: "Parduoti", none: "–" };
const OPTIONS = {
  type: [["Akcija", "Akcijos"], ["ETF", "ETF fondai"], ["Kriptovaliuta", "Kriptovaliutos"], ["Auksas", "Auksas"], ["Obligacijos", "Obligacijos"]],
  region: [["JAV", "🇺🇸 JAV"], ["Europa", "🇪🇺 Europa"], ["Baltija", "🇱🇹 Baltija"], ["Pasaulis", "🌍 Pasaulis"], ["Kita", "🌐 Kita"]],
  dd: [["", "Bet koks"], ["10", "≥ 10 %"], ["20", "≥ 20 %"], ["30", "≥ 30 %"], ["50", "≥ 50 %"]],
  vol: [["", "Bet koks"], ["25", "Ramesni (≤ 25 %)"], ["40", "Vidutiniai (≤ 40 %)"], ["hi", "Labai svyruojantys (> 40 %)"]],
  an: [["", "Bet koks"], ["buy", "Dauguma „pirkti“"], ["hold", "Dauguma „laikyti“"], ["n10", "Bent 10 analitikų"]],
  up: [["", "Bet kokia"], ["10", "≥ 10 % aukščiau kainos"], ["25", "≥ 25 % aukščiau kainos"], ["neg", "Žemiau dabartinės kainos"]],
  pf: [["", "Rodyti viską"], ["watch", "★ Stebimi"], ["notOwned", "Tik neturimi"], ["newSector", "Sektoriai, kurių neturiu"], ["fit", "Atitinka mano ribas"], ["owned", "Tik turimi"]],
  pe: [["", "P/E: bet koks"], ["15", "P/E ≤ 15"], ["25", "P/E ≤ 25"], ["40", "P/E ≤ 40"]],
  dy: [["", "Dividendai: nesvarbu"], ["any", "Moka dividendus"], ["3", "Dividendai ≥ 3 %"]],
  mcap: [["", "Dydis: bet koks"], ["big", "Didelės (> 100 mlrd. $)"], ["mid", "Vidutinės (10–100 mlrd.)"], ["small", "Mažesnės (< 10 mlrd.)"]],
};
const PRESETS = [
  { name: "Didelės įmonės, nukritusios ≥ 20 %", f: { type: ["Akcija"], dd: "20", mcap: "" }, sort: "dd" },
  { name: "Ramesni pasirinkimai", f: { vol: "25" }, sort: "vol" },
  { name: "Daugumos analitikų „pirkti“", f: { type: ["Akcija"], an: "buy" }, sort: "an" },
  { name: "Plačios rinkos fondai", f: { type: ["ETF"] }, sort: "vol" },
  { name: "Sektoriai, kurių neturiu", f: { type: ["Akcija"], pf: "newSector" }, sort: "dd" },
  { name: "Baltijos akcijos", f: { type: ["Akcija"], region: ["Baltija"] }, sort: "name" },
];
const SAVED_KEY = "investai.screens.v1";
let ALL = [], P = { items: {} }, F = {}, SORT = "dd";

function readURL() {
  const q = new URLSearchParams(location.search);
  F = {};
  for (const k of ["type", "region", "sector"]) if (q.get(k)) F[k] = q.get(k).split(",");
  for (const k of ["dd", "vol", "an", "up", "pf", "pe", "dy", "mcap", "q"]) if (q.get(k)) F[k] = q.get(k);
  SORT = q.get("sort") || "dd";
}
function writeURL() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(F)) if (v && (!Array.isArray(v) || v.length)) q.set(k, Array.isArray(v) ? v.join(",") : v);
  if (SORT !== "dd") q.set("sort", SORT);
  history.replaceState(null, "", `${location.pathname}${q.toString() ? "?" + q : ""}`);
}

function renderFilters() {
  const sectors = [...new Set(ALL.map((a) => a.sector))].filter((s) => s && s !== "Kita").sort((a, b) => a.localeCompare(b, "lt"));
  const opts = { ...OPTIONS, sector: sectors.map((s) => [s, `${keyIcon(s)} ${s}`.trim()]) };
  document.querySelectorAll(".chipset").forEach((box) => {
    const k = box.dataset.f, single = box.classList.contains("single");
    box.innerHTML = opts[k].map(([v, l]) => {
      const on = single ? (F[k] || "") === v : (F[k] || []).includes(v);
      return `<button type="button" class="fchip${on ? " on" : ""}" data-v="${esc(v)}" aria-pressed="${on}">${esc(l)}</button>`;
    }).join("");
    box.querySelectorAll(".fchip").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.v;
      if (single) F[k] = v;
      else { const arr = new Set(F[k] || []); arr.has(v) ? arr.delete(v) : arr.add(v); F[k] = [...arr]; }
      update();
    }));
  });
  $("#sort").value = SORT;
}

function portfolioInfo() {
  const hs = (state.holdings || []).filter((h) => h.value > 0);
  const owned = new Set(hs.map((h) => h.s));
  const a = hs.length ? analyze(hs) : null;
  const sectorsOwned = new Set(hs.map((h) => meta(h).sector));
  const L = (k) => (state.rules[k] === undefined || state.rules[k] === "" ? null : Number(state.rules[k]) / 100);
  const overSectors = new Set(), overAssets = new Set();
  if (a) {
    const ls = L("maxSector"), la = L("maxAsset");
    if (ls !== null) a.bySector.filter((x) => x.p > ls).forEach((x) => overSectors.add(x.k));
    if (la !== null) a.byAsset.filter((x) => x.p > la).forEach((x) => overAssets.add(x.s));
  }
  return { owned, sectorsOwned, overSectors, overAssets, has: hs.length > 0 };
}

function passes(a, pi) {
  const p = P.items[a.s] || {};
  const an = p.an || {};
  if (F.q) { const q = F.q.toLowerCase(); if (!a.n.toLowerCase().includes(q) && !a.s.toLowerCase().includes(q)) return false; }
  if (F.type && F.type.length && !F.type.includes(a.type)) return false;
  if (F.region && F.region.length && !F.region.includes(REGION_OF(a.country))) return false;
  if (F.sector && F.sector.length && !F.sector.includes(a.sector)) return false;
  if (F.dd && !(p.fromHigh !== undefined && p.fromHigh <= -Number(F.dd))) return false;
  if (F.vol === "hi" ? !(p.vol > 40) : F.vol && !(p.vol !== undefined && p.vol <= Number(F.vol))) return false;
  if (F.an === "buy" && !(an.mean && an.mean <= 2.2)) return false;
  if (F.an === "hold" && !(an.mean && an.mean > 2.2 && an.mean <= 3.2)) return false;
  if (F.an === "n10" && !(an.n >= 10)) return false;
  if (F.up === "neg" ? !(an.up !== undefined && an.up < 0) : F.up && !(an.up !== undefined && an.up >= Number(F.up))) return false;
  if (F.pf === "watch" && !isWatched(a.s)) return false;
  if (F.pf === "notOwned" && pi.owned.has(a.s)) return false;
  if (F.pf === "owned" && !pi.owned.has(a.s)) return false;
  if (F.pf === "newSector" && (pi.sectorsOwned.has(a.sector) || pi.owned.has(a.s))) return false;
  if (F.pf === "fit" && (pi.overSectors.has(a.sector) || pi.overAssets.has(a.s))) return false;
  if (isPremium()) {
    if (F.pe && !(p.pe > 0 && p.pe <= Number(F.pe))) return false;
    const dy = p.dy === undefined ? null : p.dy; // Yahoo grąžina procentais
    if (F.dy === "any" && !(dy > 0)) return false;
    if (F.dy === "3" && !(dy >= 3)) return false;
    const m = p.mcap ? p.mcap / 1e9 : null;
    if (F.mcap === "big" && !(m > 100)) return false;
    if (F.mcap === "mid" && !(m >= 10 && m <= 100)) return false;
    if (F.mcap === "small" && !(m !== null && m < 10)) return false;
  }
  return true;
}

function sorter(x, y) {
  const px = P.items[x.s] || {}, py = P.items[y.s] || {};
  const nz = (v, d) => (v === undefined || v === null ? d : v);
  switch (SORT) {
    case "up": return nz((py.an || {}).up, -1e9) - nz((px.an || {}).up, -1e9);
    case "an": return nz((px.an || {}).mean, 9) - nz((py.an || {}).mean, 9);
    case "m1": return nz(px.m1, 1e9) - nz(py.m1, 1e9);
    case "m1d": return nz(py.m1, -1e9) - nz(px.m1, -1e9);
    case "vol": return nz(px.vol, 1e9) - nz(py.vol, 1e9);
    case "mcap": return nz(py.mcap, -1) - nz(px.mcap, -1);
    case "name": return x.n.localeCompare(y.n, "lt");
    default: return nz(px.fromHigh, 1e9) - nz(py.fromHigh, 1e9);
  }
}

function anHTML(an) {
  if (!an || !an.n) return `<span class="muted small">Analitikų vertinimų nėra</span>`;
  const c = an.c || null;
  const bar = c ? (() => { const t = c.reduce((a, b) => a + b, 0) || 1; const col = ["#16825d", "#45c08f", "#8c9aab", "#f07a70", "#c8463d"]; return `<span class="an-bar">${c.map((v, i) => (v ? `<span style="flex:${v};background:${col[i]}"></span>` : "")).join("")}</span><small>${c[0] + c[1]} pirkti · ${c[2]} laikyti · ${c[3] + c[4]} parduoti</small>`; })() : `<small>${an.n} analitikų</small>`;
  return `<span class="an"><b>${AN_LABEL[an.key] || "–"}</b>${bar}</span>`;
}

function update() {
  writeURL();
  renderFilters();
  const pi = portfolioInfo();
  const list = ALL.filter((a) => passes(a, pi)).sort(sorter);
  const anyPrices = Object.keys(P.items).length > 0;
  $("#res-count").innerHTML = `<b>${list.length}</b> ${list.length === 1 ? "aktyvas atitinka" : "aktyvai atitinka"} tavo filtrus${!anyPrices ? " · kainų duomenys dar ruošiami" : ""}`;
  $("#res").innerHTML = list.slice(0, 120).map((a) => {
    const p = P.items[a.s] || {}, an = p.an || {};
    const mine = pi.owned.has(a.s);
    return `<div class="res-row">
      <a class="res-main" href="aktyvas.html?s=${encodeURIComponent(a.s)}">${logoHTML(a.s, a.n, "#1d3a63", 40)}<span class="res-name"><b>${esc(a.n)}</b><small>${esc([a.s.split(":")[1], shortSector(a.sector), a.country].join(" · "))}${mine ? ' · <span class="mine">Turi portfelyje</span>' : ""}</small></span></a>
      <span class="res-spark">${p.spark ? sparkSVG(p.spark, 90, 30) : ""}</span>
      <span class="res-num"><small>Per mėn.</small><b class="${(p.m1 ?? 0) >= 0 ? "up" : "down"}">${fmtPct(p.m1)}</b></span>
      <span class="res-num"><small>Nuo aukščiausios</small><b class="${(p.fromHigh ?? 0) < -0.5 ? "down" : ""}">${fmtPct(p.fromHigh)}</b></span>
      <span class="res-an">${anHTML(an)}${an.up !== undefined ? `<small>Tikslinė kaina: <b class="${an.up >= 0 ? "up" : "down"}">${fmtPct(an.up, 0)}</b></small>` : ""}</span>
      <span class="res-act">${starHTML(a.s, a.n)}<a class="btn small" href="strategija.html?check=${encodeURIComponent(a.s)}#check-form">Patikrinti</a></span>
    </div>`;
  }).join("") || `<div class="card"><p style="margin:0"><b>Nieko nerasta.</b> Pabandyk sušvelninti kai kuriuos filtrus.</p></div>`;
  renderSaved();
}

/* ---------- Premium: išsaugoti filtrai ---------- */
function savedList() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; } }
function renderSaved() {
  const row = $("#save-row");
  if (!isPremium()) return;
  const list = savedList();
  row.innerHTML = `<div class="saved">${list.map((s, i) => `<span class="saved-item"><button type="button" class="fchip" data-load="${i}">${esc(s.name)}</button><button type="button" class="icon-btn" data-del="${i}" aria-label="Ištrinti ${esc(s.name)}">×</button></span>`).join("")}<button type="button" class="btn small" id="save-btn">Išsaugoti šį filtrą</button></div>`;
  row.querySelectorAll("[data-load]").forEach((b) => b.addEventListener("click", () => { const s = list[+b.dataset.load]; F = JSON.parse(JSON.stringify(s.f)); SORT = s.sort || "dd"; update(); }));
  row.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { list.splice(+b.dataset.del, 1); localStorage.setItem(SAVED_KEY, JSON.stringify(list)); renderSaved(); }));
  $("#save-btn").addEventListener("click", () => {
    const name = prompt("Filtro pavadinimas:", "Mano filtras");
    if (!name) return;
    list.push({ name: name.slice(0, 40), f: F, sort: SORT });
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch {}
    renderSaved();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page !== "screener") return;
  try { ASSETS = (await getJSON("data/assets.json")).groups.flatMap((g) => g.items); } catch (e) { console.error(e); }
  ALL = ASSETS.filter((a) => !a.s.startsWith("X:"));
  P = await loadPrices();
  load();
  readURL();
  $("#presets").innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-i="${i}">${esc(p.name)}</button>`).join("");
  $("#presets").querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => { const p = PRESETS[+b.dataset.i]; F = JSON.parse(JSON.stringify(p.f)); SORT = p.sort; update(); }));
  $("#sort").addEventListener("change", () => { SORT = $("#sort").value; update(); });
  $("#scr-q").value = F.q || "";
  $("#scr-q").addEventListener("input", () => { F.q = $("#scr-q").value.trim(); update(); });
  $("#reset").addEventListener("click", () => { F = {}; SORT = "dd"; $("#scr-q").value = ""; update(); });
  $("#help-slot").innerHTML = helpHTML();
  document.addEventListener("watchchange", () => { if (F.pf === "watch") update(); });
  // Telefone filtrai suskleidžiami po mygtuku
  const grid = document.querySelector(".scr-grid");
  const fbtn = document.createElement("button");
  fbtn.type = "button"; fbtn.className = "btn filter-toggle"; fbtn.setAttribute("aria-expanded", "false");
  const label = () => { const n = document.querySelectorAll("#filters .fchip.on:not([data-v=''])").length; fbtn.innerHTML = `${icon("screener", 18)} Filtrai${n ? ` <span class="fcount">${n}</span>` : ""}`; };
  label();
  fbtn.addEventListener("click", () => { const o = grid.classList.toggle("f-open"); fbtn.setAttribute("aria-expanded", String(o)); });
  document.querySelector(".scr-search").prepend(fbtn);
  const done = document.createElement("button");
  done.type = "button"; done.className = "btn primary filter-done"; done.textContent = "Rodyti rezultatus";
  done.addEventListener("click", () => { grid.classList.remove("f-open"); fbtn.setAttribute("aria-expanded", "false"); fbtn.scrollIntoView({ block: "start" }); });
  $("#filters").append(done);
  $("#filters").addEventListener("click", () => setTimeout(label, 0));
  update();
});
