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
  return AN_LABEL[an.key] ? `<span class="an an-${an.key}"><b>${AN_LABEL[an.key]}</b>${bar}</span>` : "";
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
      <span class="res-act">${starHTML(a.s, a.n)}<a class="btn small" href="portfelis.html?check=${encodeURIComponent(a.s)}#strategija">Patikrinti</a></span>
    </div>`;
  }).join("") || `<div class="card"><p style="margin:0"><b>Nieko nerasta.</b> Pabandyk sušvelninti kai kuriuos filtrus.</p></div>`;
  renderSaved();
}

/* ---------- AI paieška paprastais žodžiais ---------- */
const ASK_EX = ["Pelningos įmonės be skolų, mokančios dividendus", "Pigios pagal P/E, bet pelningos", "Atitinka Warreno Buffetto taisykles", "Nukritusios ≥ 30 %, bet pelningos", "Dirbtinio intelekto lustų gamintojai", "Baltijos įmonės su dividendais"];
const fmtNum = (v, d = 1) => Number(v).toLocaleString("lt-LT", { maximumFractionDigits: d }).replace("-", "−");
const PCT_FRAC = new Set(["pm", "om", "rg", "eg", "roe"]); // duomenyse – trupmenomis
const FIELD_LT = { pe: "P/E", pm: "Pelno marža", om: "Veiklos marža", rg: "Pajamų augimas", eg: "Pelno augimas", de: "Skola / kapitalas", roe: "ROE", dy: "Dividendai", beta: "Beta", vol: "Svyravimas", fromHigh: "Nuo aukščiausios", m1: "Per mėn.", y1: "Per metus", ytd: "Nuo metų pr.", mcap: "Rinkos vertė", up: "Iki analitikų tikslo", an: "Analitikų vidurkis", lossYears: "Nuostolingi metai", coreProfit: "Pagrindinė veikla pelninga", cashOverDebt: "Pinigų daugiau nei skolų" };
const LEGEND_NAME = { graham: "Benjamin Graham", buffett: "Warren Buffett", lynch: "Peter Lynch", fisher: "Philip Fisher", greenblatt: "Joel Greenblatt", neff: "John Neff", templeton: "John Templeton" };
let SCR_FUND = null;
async function fundAll() { if (!SCR_FUND) { try { SCR_FUND = (await getJSON("data/fund.json")).items || {}; } catch { SCR_FUND = {}; } } return SCR_FUND; }
function fieldVal(f, a, p, fund) {
  if (f === "mcap") return p.mcap ? p.mcap / 1e9 : null;
  if (f === "up") return (p.an || {}).up ?? null;
  if (f === "an") return (p.an || {}).mean ?? null;
  if (f === "lossYears") { const ni = ((fund[a.s] || {}).ni || []); return ni.length ? ni.filter((x) => x[1] < 0).length : null; }
  if (f === "coreProfit") return typeof PLAIN !== "undefined" ? (PLAIN.coreProfit(p) === null ? null : PLAIN.coreProfit(p) ? 1 : 0) : null;
  if (f === "cashOverDebt") return /Finans/.test(a.sector || "") ? null : p.cash != null && p.debt != null ? (p.cash >= p.debt ? 1 : 0) : null;
  const v = p[f];
  if (v == null || !isFinite(v)) return null;
  return PCT_FRAC.has(f) ? v * 100 : v;
}
function fmtField(f, v) {
  if (v == null) return "–";
  if (f === "coreProfit" || f === "cashOverDebt") return v ? "taip" : "ne";
  if (f === "mcap") return `${fmtNum(v, v >= 100 ? 0 : 1)} mlrd. $`;
  if (f === "pe" || f === "beta" || f === "an") return fmtNum(v, 1);
  if (f === "lossYears") return String(v);
  return `${fmtNum(v, Math.abs(v) >= 10 ? 0 : 1)} %`;
}
const OPS = { ">=": (a, b) => a >= b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, "<": (a, b) => a < b, "=": (a, b) => a === b };
const OP_LT = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=" };
async function askAI(q) {
  const out = $("#ask-out");
  const url = await aiUrl();
  if (!url) { out.innerHTML = `<p class="muted">AI paieška šiuo metu nepasiekiama – naudok filtrus žemiau.</p>`; return; }
  out.innerHTML = `<div class="card ask-res"><p class="muted" style="margin:0"><span class="ask-spin"></span> Suprantu klausimą ir ieškau mūsų duomenyse…</p></div>`;
  let d;
  try {
    const prem = (() => { try { return localStorage.getItem("investai.premium.ai") || ""; } catch { return ""; } })();
    const r = await fetch(url + "/screen", { method: "POST", headers: { "Content-Type": "application/json", ...(prem ? { "X-Premium": prem } : {}) }, body: JSON.stringify({ q }) });
    d = await r.json();
    if (!r.ok) throw new Error(d.error || "Nepavyko");
  } catch (e) { out.innerHTML = `<div class="card ask-res"><p style="margin:0">${esc(e.message || "Nepavyko.")}</p></div>`; return; }
  const fund = await fundAll();
  const conds = (d.conds || []).filter((c) => FIELD_LT[c.f]);
  const picks = new Set(d.picks || []);
  // Rodome skaitinius laukus (pirmas – rūšiavimo), kad kiekvieną atsakymą būtų galima patikrinti
  const BOOL = new Set(["coreProfit", "cashOverDebt"]);
  const used = [...new Set([...(d.sort && d.sort.f ? [d.sort.f] : []), ...conds.map((c) => c.f)])].filter((f) => !BOOL.has(f)).slice(0, 3);
  let list = ALL.filter((a) => {
    const p = P.items[a.s]; if (!p) return false;
    if (picks.size && !picks.has(a.s)) return false;
    if (d.type && d.type.length && !d.type.includes(a.type)) return false;
    if (d.region && d.region.length && !d.region.includes(REGION_OF(a.country))) return false;
    if (d.sector && d.sector.length && !d.sector.includes(a.sector)) return false;
    for (const c of conds) { const v = fieldVal(c.f, a, p, fund); if (v == null || !OPS[c.op](v, c.v)) return false; }
    if (d.legend && typeof PLAIN !== "undefined") { const R = PLAIN.rules(p, fund[a.s] || {}, P, a).find((x) => x.who.toLowerCase().includes(d.legend)); if (!R || !R.ok) return false; }
    return true;
  });
  if (d.sort && d.sort.f) { const k = d.sort.f, m = d.sort.dir === "asc" ? 1 : -1; list.sort((x, y) => { const vx = fieldVal(k, x, P.items[x.s], fund), vy = fieldVal(k, y, P.items[y.s], fund); return vx == null ? 1 : vy == null ? -1 : (vx - vy) * m; }); }
  else list.sort((x, y) => (P.items[y.s].mcap || 0) - (P.items[x.s].mcap || 0));
  const chips = [
    ...(picks.size ? [`Tema: ${picks.size} įmonės, atrinktos AI`] : []),
    ...(d.type || []).map((t) => t), ...(d.region || []), ...(d.sector || []).map(shortSector),
    ...conds.map((c) => (c.f === "coreProfit" || c.f === "cashOverDebt") ? FIELD_LT[c.f] + (c.v ? "" : " – ne") : `${FIELD_LT[c.f]} ${OP_LT[c.op]} ${fmtField(c.f, c.v)}`),
    ...(d.legend ? [`Atitinka ${LEGEND_NAME[d.legend]} taisykles`] : []),
  ];
  const leg = d.legend ? [d.legend] : [];
  out.innerHTML = `<div class="card ask-res">
    <p class="ask-title"><b>${esc(d.title || q)}</b> · rasta ${list.length}</p>
    <div class="ask-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
    ${d.note ? `<p class="muted small" style="margin:8px 0 0">${esc(d.note)}</p>` : ""}
    ${list.length ? `<ul class="ask-list">${list.slice(0, 30).map((a) => { const p = P.items[a.s]; return `<li><a href="aktyvas.html?s=${encodeURIComponent(a.s)}">${logoHTML(a.s, a.n, "#1d3a63", 36)}<span class="ask-n"><b>${esc(a.n)}</b><small>${esc(a.s.split(":")[1])} · ${esc(shortSector(a.sector) || a.type)}</small></span>
      <span class="ask-v">${used.map((f) => `<span><small>${esc(FIELD_LT[f])}</small><b>${fmtField(f, fieldVal(f, a, p, fund))}</b></span>`).join("")}${leg.length ? `<span><small>Taisyklės</small><b>✓</b></span>` : ""}</span></a></li>`; }).join("")}</ul>${list.length > 30 ? `<p class="muted small">Rodoma 30 iš ${list.length}.</p>` : ""}`
      : `<p style="margin:12px 0 0"><b>Nieko nerasta.</b> Pabandyk paprastesnį klausimą arba sušvelnink sąlygas.</p>`}
    <p class="muted small" style="margin:10px 0 0">AI tik paverčia klausimą filtrais – visus skaičius gali patikrinti paspaudęs įmonę. Tai ne rekomendacija pirkti.${typeof d.left === "number" ? ` Šiandien liko AI užklausų: ${d.left}.` : ""}</p>
  </div>`;
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
  $("#ask-ex").innerHTML = ASK_EX.map((x) => `<button type="button" class="ask-chip">${esc(x)}</button>`).join("");
  $("#ask-ex").addEventListener("click", (e) => { const b = e.target.closest(".ask-chip"); if (!b) return; $("#ask-q").value = b.textContent; askAI(b.textContent); });
  $("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#ask-q").value.trim(); if (q.length >= 3) { askAI(q); const u = new URL(location.href); u.searchParams.set("ask", q); history.replaceState(null, "", u); } });
  const ask0 = new URLSearchParams(location.search).get("ask");
  if (ask0) { $("#ask-q").value = ask0; askAI(ask0); }
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
