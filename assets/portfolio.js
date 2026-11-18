// InvestAI – „Mano portfelis“: įkelk nuotrauką → patikrink → analizė.
// Viskas vyksta naršyklėje; duomenys saugomi localStorage. Naudoja app.js pagalbininkus
// ($, esc, getJSON, tv, assetUrl, SYMBOL_RE, fmtShort, stripHTML, PALETTE) ir pf-parse.js (window.pfParse).
"use strict";

const PF_KEY = "investai.portfolio.v1";
const CASH = "CASH:EUR";
const RULES = [
  { id: "maxAsset", label: "Viena pozicija – ne daugiau kaip", kind: "max", group: "byAsset" },
  { id: "maxSector", label: "Vienas sektorius – ne daugiau kaip", kind: "max", group: "bySector" },
  { id: "maxCountry", label: "Viena šalis – ne daugiau kaip", kind: "max", group: "byCountry" },
  { id: "maxCrypto", label: "Kriptovaliutos – ne daugiau kaip", kind: "maxType", type: "Kriptovaliuta" },
  { id: "minFunds", label: "ETF fondai – ne mažiau kaip", kind: "minType", type: "ETF" },
  { id: "minCash", label: "Grynieji pinigai – ne mažiau kaip", kind: "minType", type: "Grynieji" },
];
const DEMO = {
  currency: "EUR",
  holdings: [
    { s: "NASDAQ:NVDA", value: 2500, pnl: 620, pnlPct: 32.98 }, { s: "NASDAQ:AAPL", value: 1500, pnl: 85, pnlPct: 6.01 },
    { s: "NASDAQ:MSFT", value: 1000, pnl: -42, pnlPct: -4.03 }, { s: "XETR:VWCE", value: 2000, pnl: 214, pnlPct: 11.98 },
    { s: "OMXVSE:IGN1L", value: 1200, pnl: -36, pnlPct: -2.91 }, { s: "OMXTSE:LHV1T", value: 600, pnl: 48, pnlPct: 8.7 },
    { s: "BITSTAMP:BTCUSD", value: 700, pnl: -128, pnlPct: -15.46 }, { s: CASH, value: 500 },
  ],
  rules: {},
};

let ASSETS = [];
let state = { holdings: [], rules: {}, currency: "EUR", divs: [] };
let draft = [];          // peržiūros eilutės
let isDemo = false;
let dim = "sectors";
let cmpDim = "sectors";
let scnId = "y2022";
let animateNext = false;

/* ---------- Saugojimas ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(PF_KEY) || "null");
    if (d && Array.isArray(d.holdings)) state = { holdings: d.holdings, rules: d.rules || {}, currency: d.currency || "EUR", divs: Array.isArray(d.divs) ? d.divs : [], tx: Array.isArray(d.tx) ? d.tx : [], txBroker: d.txBroker || "" };
  } catch (e) { console.warn("Naršyklės saugykla nepasiekiama", e); }
}
function save() {
  if (isDemo) return;
  try { localStorage.setItem(PF_KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
}

/* ---------- Pagalbininkai ---------- */
const curSym = () => (state.currency === "USD" ? "$" : "€");
const money = (v, cur = state.currency) => new Intl.NumberFormat("lt-LT", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
const pct = (p) => `${(p * 100).toLocaleString("lt-LT", { maximumFractionDigits: p < 0.1 ? 1 : 0 })}\u00a0%`;
const ticker = (s) => (s === CASH ? "" : s.split(":")[1] || s);
const findAsset = (s) => ASSETS.find((a) => a.s === s);
// „X:“ – aktyvai be TradingView simbolio (pvz., atpažinti iš nuotraukos, bet nežinomi)
const isTv = (s) => s && s !== CASH && !s.startsWith("X:") && SYMBOL_RE.test(s);
const customId = (name) => "X:" + name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
function meta(h) {
  if (h.s === CASH) return { n: "Grynieji pinigai", sector: "Grynieji pinigai", country: "Be šalies", type: "Grynieji" };
  const a = findAsset(h.s) || {};
  return { n: h.n || a.n || ticker(h.s), sector: h.sector || a.sector || "Kita", country: h.country || a.country || "Kita", type: h.type || a.type || "Kita" };
}
function show(view) {
  ["start", "review", "result"].forEach((v) => ($(`#v-${v}`).hidden = v !== view));
  window.scrollTo({ top: 0 });
}

/* ---------- Analizė ---------- */
function analyze(holdings) {
  const rows = holdings.filter((h) => h.value > 0).map((h) => ({ ...h, ...meta(h) }));
  const total = rows.reduce((t, r) => t + r.value, 0);
  const group = (key) => {
    const m = new Map();
    rows.forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + r.value));
    return [...m].map(([k, v]) => ({ k, v, p: total ? v / total : 0 })).sort((a, b) => b.v - a.v);
  };
  const byAsset = rows.map((r) => ({ k: r.n, s: r.s, v: r.value, p: total ? r.value / total : 0 })).sort((a, b) => b.v - a.v);
  const byType = group("type");
  const typeShare = (t) => (byType.find((x) => x.k === t) || { p: 0 }).p;
  const ex = PFI.exposures(rows);
  return { rows, total, byAsset, bySector: group("sector"), byCountry: group("country"), byType, typeShare, sectors: ex.sectors, regions: ex.regions, ex, pnl: PFI.pnlSummary(rows) };
}
function checkRules(a, rules) {
  const out = [];
  for (const r of RULES) {
    if (rules[r.id] === undefined || rules[r.id] === "" || !isFinite(Number(rules[r.id]))) continue;
    const lim = Number(rules[r.id]), L = lim / 100;
    if (r.kind === "max") {
      const list = a[r.group].filter((x) => x.s !== CASH && x.k !== "Grynieji pinigai" && x.k !== "Be šalies");
      const over = list.filter((x) => x.p > L + 1e-9);
      out.push({ r, lim, ok: !over.length, detail: over.length ? over.map((x) => `${x.k} ${pct(x.p)}`).join(", ") : list[0] ? `didžiausia – ${list[0].k} ${pct(list[0].p)}` : "" });
    } else {
      const share = a.typeShare(r.type);
      out.push({ r, lim, ok: r.kind === "maxType" ? share <= L + 1e-9 : share >= L - 1e-9, detail: `dabar ${pct(share)}` });
    }
  }
  return out;
}
// Neutralūs faktai paprasta kalba – be vertinimų „per daug“ ar „per mažai“
const signed = (v, cur) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${money(Math.abs(v), cur)}`;
const signedPct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("lt-LT", { maximumFractionDigits: 1 })}\u00a0%`;
function facts(a) {
  const out = [];
  const P = a.pnl;
  if (P.known) {
    out.push(`Nuo pirkimo portfelis ${P.pnl >= 0 ? "uždirbo" : "prarado"} <b>${signed(P.pnl)}</b>${P.pct !== null ? ` (${signedPct(P.pct)})` : ""}.`);
    if (P.best[0]) out.push(`Labiausiai paaugo <b>${esc(P.best[0].n)}</b> (${signedPct(P.best[0].pp)}), ${P.worst[0] ? `labiausiai krito <b>${esc(P.worst[0].n)}</b> (${signedPct(P.worst[0].pp)}).` : "nuostolingų pozicijų nėra."}`);
  }
  const pos = a.byAsset.filter((x) => x.s !== CASH);
  if (pos[0]) out.push(`Didžiausia pozicija – <b>${esc(pos[0].k)}</b>, ${pct(pos[0].p)} portfelio. Jei ji nukristų perpus, prarastum <b>${money(pos[0].v / 2)}</b>.`);
  const sec = a.sectors.filter((x) => !/Grynieji|Kriptovaliutos|Obligacijos|Auksas|Nežinomas/.test(x.k));
  if (sec[0]) out.push(`Didžiausia sektoriaus dalis (įskaitant fondus) – <b>${esc(sec[0].k)}</b>: ${pct(sec[0].p)}.`);
  const cmp = PFI.compare(a.ex).sectors.filter((x) => x.market > 0 || x.mine > 0.05);
  const over = cmp.slice().sort((x, y) => y.diff - x.diff)[0];
  const missing = cmp.filter((x) => x.mine < 0.005 && x.market >= 0.08).map((x) => x.k.toLowerCase());
  if (a.ex.equity > 0 && over && over.diff > 0.1) out.push(`Palyginti su pasaulio rinka, labiausiai išsiskiria <b>${esc(over.k.toLowerCase())}</b>: ${pct(over.mine)} tavo akcijų, rinkoje ~${pct(over.market)}.${missing.length ? ` Portfelyje nėra šių sektorių akcijų: ${missing.slice(0, 3).join(", ")}.` : ""}`);
  const withEx = a.rows.filter((r) => EXPLAIN[r.s]);
  if (withEx.length) out.push(`Turime paaiškinimą, kodėl keitėsi kaina: <b>${withEx.slice(0, 3).map((r) => esc(r.n)).join(", ")}</b>${withEx.length > 3 ? ` ir dar ${withEx.length - 3}` : ""}. Jį rasi pozicijų kortelėse žemiau.`);
  const crypto = a.typeShare("Kriptovaliuta");
  if (crypto) out.push(`Kriptovaliutos sudaro ${pct(crypto)} portfelio.`);
  return out.slice(0, 7);
}

/* ---------- Analizės vaizdas ---------- */
function renderResult() {
  syncPrices();
  const a = analyze(state.holdings);
  if (a.total <= 0) { show("start"); return; }
  show("result");
  $("#demo-note").hidden = !isDemo;
  renderHero(a);
  renderPfChart(a).catch((e) => console.error(e));
  renderDim(a);
  renderHealth(a);
  renderTreemap(a);
  $("#r-facts").innerHTML = facts(a).map((f) => `<li>${f}</li>`).join("");
  renderMovers(a);
  renderCompare(a);
  renderScenarios(a);
  renderCards(a);
  renderDivs(a);
  renderWeek(a);
  renderBackup();
  renderReal(a);
  renderTax();
  renderNext(a);
  if (typeof PFAI !== "undefined") { PFAI.renderReview(a); PFAI.renderAlerts(a); }
  decorateHeads();
  renderTable(a);
  renderRules(a);
  renderToday(a);
  animateNext = false;
}
function countUp(el, to, fmt) {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animateNext || reduce || document.hidden) { el.textContent = fmt(to); return; }
  el.textContent = fmt(0);
  setTimeout(() => (el.textContent = fmt(to)), 1100); // jei animacija sustabdoma (fone), vis tiek parodome galutinę reikšmę
  const t0 = performance.now(), dur = 900;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function renderHero(a) {
  countUp($("#r-total"), a.total, (v) => money(v));
  const P = a.pnl, el = $("#r-pnl");
  if (P.known) {
    el.className = `pf-hero-pnl ${P.pnl >= 0 ? "up" : "down"}`;
    countUp(el, P.pnl, (v) => `${signed(v)}${P.pct !== null ? ` (${signedPct(P.pct * (P.pnl ? v / P.pnl : 1))})` : ""} nuo pirkimo`);
    $("#r-pnl-sub").textContent = `Pelne ${P.up} ${P.up === 1 ? "pozicija" : "pozicijos"}, nuostolyje ${P.down}${P.known < P.total ? ` · rezultatas žinomas ${P.known} iš ${P.total} pozicijų` : ""}${autoStamp()}`;
  } else {
    el.className = "pf-hero-pnl";
    el.textContent = "Rezultatas nežinomas";
    $("#r-pnl-sub").textContent = "Nuotraukoje neradome pelno ar nuostolio. Jį gali įrašyti skiltyje „Redaguoti pozicijas“.";
  }
  const pos = a.byAsset.filter((x) => x.s !== CASH);
  const worst = PFI.scenario(a.rows, PFI.SCENARIOS[1].shock).loss;
  $("#r-stats").innerHTML = [
    ["Pozicijų", String(a.rows.length)],
    ["Didžiausia", pos[0] ? `${pct(pos[0].p)}` : "–", pos[0] ? pos[0].k : ""],
    ["Akcijų dalis", pct(a.ex.equity / a.total)],
    ["Nuosmukis kaip 2022 m.", money(worst), `${signedPct((worst / a.total) * 100)}`],
  ].map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}${s ? `<small>${esc(s)}</small>` : ""}</dd></div>`).join("");
}
function renderDim(a) {
  a = a || analyze(state.holdings);
  document.querySelectorAll(".seg button[data-dim]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dim === dim)));
  $("#r-strip").innerHTML = donutHTML(a[dim], a.total) + `<div class="drill" id="r-drill" hidden></div>`;
  $("#r-strip-note").hidden = !(dim === "sectors" || dim === "regions");
}
// Spurgos diagrama + legenda sąrašu (paspaudus – kas sudaro dalį)
function donutHTML(list, total) {
  let items = list.slice(0, 7);
  const rest = list.slice(7).reduce((t, x) => t + x.p, 0);
  if (rest > 0.0005) items.push({ k: "Kiti", p: rest, other: true });
  items = items.map((x, i) => ({ ...x, c: x.other ? "#8fa3c0" : PALETTE[i % PALETTE.length] }));
  const R = 70, C = 2 * Math.PI * R, gap = items.length > 1 ? 2.5 : 0;
  let off = 0;
  const arcs = items.map((x) => {
    const len = Math.max(0, x.p * C - gap);
    const el = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${x.c}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" data-k="${esc(x.k)}" class="dn-arc"><title>${esc(x.k)} ${pct(x.p)}</title></circle>`;
    off += x.p * C;
    return el;
  }).join("");
  const top = items[0] || { k: "", p: 0 };
  return `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 180 180" role="img" aria-label="Paskirstymas">${arcs}</svg><div class="dn-center"><b>${pct(top.p)}</b><span>${esc(top.k)}</span></div></div>
    <ul class="grp dn-legend">${items.map((x) => `<li class="row" data-k="${esc(x.k)}"><div class="row-main"><i class="dn-dot" style="background:${x.c}"></i>${keyIcon(x.k) ? `<span class="dn-ico" aria-hidden="true">${keyIcon(x.k)}</span>` : ""}<span class="row-txt"><b>${esc(x.k)}</b></span><span class="row-val">${pct(x.p)}<span class="muted">${money(x.p * total)}</span></span></div></li>`).join("")}</ul></div>`;
}
// Paspaudus sektorių / regioną – kurios pozicijos jį sudaro (fondai išskaidomi apytiksliai)
function drillDown(k) {
  const a = analyze(state.holdings), box = $("#r-drill");
  const contrib = a.rows.map((r) => {
    let v = 0;
    if (dim === "sectors" || dim === "regions") { const e = PFI.exposures([r]); v = ((e[dim] || []).find((x) => x.k === k) || { v: 0 }).v; }
    else if (dim === "byType") v = r.type === k ? r.value : 0;
    else v = r.n === k ? r.value : 0;
    return { r, v };
  }).filter((x) => x.v > 0.005).sort((x, y) => y.v - x.v);
  const tot = contrib.reduce((t, x) => t + x.v, 0);
  document.querySelectorAll("#r-strip [data-k]").forEach((el) => el.classList.toggle("sel", el.dataset.k === k));
  box.hidden = false;
  box.innerHTML = `<div class="drill-head"><b>${esc(k)}</b><span class="muted">${money(tot)} · ${pct(tot / a.total)} portfelio</span><button type="button" class="icon-btn drill-x" aria-label="Uždaryti">✕</button></div>
    <ul>${contrib.map(({ r, v }) => `<li>${logoHTML(r.s, r.n, "#1d3a63", 28)}<span>${isTv(r.s) ? `<a href="${assetUrl(r.s)}">${esc(r.n)}</a>` : esc(r.n)}${(dim === "sectors" || dim === "regions") && v < r.value - 0.01 ? ` <small class="muted">(${pct(v / r.value)} fondo)</small>` : ""}</span><b>${money(v)}</b><span class="muted">${pct(v / tot)}</span></li>`).join("")}</ul>`;
}
/* ---------- Diversifikacijos balas (0–100) ----------
   Matuoja tik tai, kiek portfelis priklauso nuo kelių pozicijų ir kiek svyruoja – ne tai, ar investicijos geros. */
const lin = (v, good, bad) => Math.max(0, Math.min(100, ((bad - v) / (bad - good)) * 100));
function healthScore(a) {
  const total = a.total || 1;
  const single = a.rows.filter((r) => r.type === "Akcija" || r.type === "Kita").sort((x, y) => y.value - x.value)[0];
  const maxSingle = single ? single.value / total : 0;
  const sec = a.sectors.filter((x) => !/Grynieji|Obligacijos|Auksas|Nežinomas/.test(x.k))[0] || { k: "–", p: 0 };
  const reg = a.regions.filter((x) => !/Be šalies|Nežinoma/.test(x.k))[0] || { k: "–", p: 0 };
  const crypto = a.typeShare("Kriptovaliuta");
  let vw = 0, vk = 0;
  a.rows.forEach((r) => {
    const p = (typeof PRICES_PF !== "undefined" && PRICES_PF.items[r.s]) || {};
    const v = p.vol || (r.type === "Grynieji" ? 0 : r.type === "Obligacijos" ? 6 : r.type === "ETF" ? 16 : null);
    if (v !== null && v !== undefined) { vw += v * r.value; vk += r.value; }
  });
  const vol = vk ? vw / vk : null;
  const parts = [
    { id: "single", label: "Didžiausia vienos įmonės dalis", val: maxSingle, show: single ? `${single.n} – ${pct(maxSingle)}` : "Atskirų akcijų nėra", score: lin(maxSingle, 0.1, 0.6), w: 3, term: "koncentracija",
      why: "Kuo didesnė vienos įmonės dalis, tuo labiau visas portfelis priklauso nuo jos likimo." },
    { id: "sector", label: "Didžiausias sektorius", val: sec.p, show: `${sec.k} – ${pct(sec.p)}`, score: lin(sec.p, 0.3, 0.85), w: 2, term: "sektorius",
      why: "To paties sektoriaus įmonės dažnai krenta kartu. Fondai išskaidyti apytiksliai." },
    { id: "region", label: "Didžiausias regionas", val: reg.p, show: `${reg.k} – ${pct(reg.p)}`, score: lin(reg.p, 0.65, 1), w: 1, term: "diversifikacija",
      why: "Pasaulio akcijų indekse JAV sudaro apie 60–65 %, todėl tik didesnė dalis mažina balą." },
    { id: "vol", label: "Vidutiniai svyravimai", val: vol, show: vol ? `~${Math.round(vol)} % per metus` : "Nežinoma", score: vol === null ? 50 : lin(vol, 16, 60), w: 2, term: "vol",
      why: "Pozicijų metinių svyravimų vidurkis pagal jų dalį. Plataus indekso – apie 15–20 %." },
    { id: "crypto", label: "Kriptovaliutų dalis", val: crypto, show: pct(crypto), score: lin(crypto, 0.05, 0.4), w: 1, term: "kripto",
      why: "Kriptovaliutos per kelis mėnesius yra kritusios 50–80 %." },
  ];
  const score = Math.round(parts.reduce((t, x) => t + x.score * x.w, 0) / parts.reduce((t, x) => t + x.w, 0));
  const level = score >= 75 ? ["Plačiai paskirstytas", "ok"] : score >= 50 ? ["Vidutiniškai paskirstytas", "mid"] : score >= 30 ? ["Koncentruotas", "warn"] : ["Labai koncentruotas", "bad"];
  return { score, level, parts };
}
function renderHealth(a) {
  const h = healthScore(a);
  const R = 52, C = 2 * Math.PI * R, off = C * (1 - h.score / 100);
  const weakest = h.parts.slice().sort((x, y) => x.score * x.w - y.score * y.w)[0];
  $("#r-health").innerHTML = `
    <div class="health-top">
      <div class="ring ring-${h.level[1]}" role="img" aria-label="Diversifikacijos balas ${h.score} iš 100">
        <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" class="ring-bg"/><circle cx="60" cy="60" r="${R}" class="ring-fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
        <b>${h.score}</b><span>iš 100</span>
      </div>
      <div>
        <h2 id="health-h">${termHTML("rizikos-balas", "Diversifikacijos balas")}</h2>
        <p class="health-level lvl-${h.level[1]}">${h.level[0]}</p>
        <p class="muted small" style="margin:4px 0 0">Daugiausia balą mažina: <b>${esc(weakest.label.toLowerCase())}</b> (${esc(weakest.show)}). Balas rodo, kiek portfelis priklauso nuo kelių pozicijų, o ne ar investicijos geros.</p>
      </div>
    </div>
    <ul class="health-parts">${h.parts.map((x) => `<li><div class="hp-top"><span>${termHTML(x.term, x.label)}</span><b>${esc(x.show)}</b></div><div class="hp-bar"><i class="lvl-${x.score >= 75 ? "ok" : x.score >= 50 ? "mid" : x.score >= 30 ? "warn" : "bad"}" style="width:${Math.max(4, x.score)}%"></i></div><small>${esc(x.why)}</small></li>`).join("")}</ul>`;
}
let tmMode = "pnl";
const TM_SCALE = { pnl: 30, d1: 4, w1: 8, m1: 15 };
function renderTreemap(a) {
  a = a || analyze(state.holdings);
  const P = a.pnl;
  if (tmMode === "pnl" && !P.known) tmMode = "d1";
  const known = new Map(PFI.pnlSummary(a.rows).best.concat(PFI.pnlSummary(a.rows).worst).map((r) => [r.s, r.pp]));
  const items = a.rows.filter((r) => r.s !== CASH).map((r) => {
    const pr = PRICES_PF.items[r.s] || {};
    const pp = typeof r.pnlPct === "number" ? r.pnlPct : typeof r.pnl === "number" && r.value - r.pnl > 0 ? (r.pnl / (r.value - r.pnl)) * 100 : known.get(r.s);
    const c = tmMode === "pnl" ? pp : pr[tmMode];
    return { ico: isTv(r.s) && (typeof LOGOS === "object" && LOGOS[r.s]) ? logoHTML(r.s, r.n, "#1d3a63", 40) : "", label: isTv(r.s) ? r.s.split(":")[1].replace(/USDT?$/, "") : r.n, sub: `${pct(r.value / a.total)} · ${c === undefined || c === null ? "–" : fmtPct(c)}`, v: r.value, c, href: isTv(r.s) ? assetUrl(r.s) : null, title: `${r.n}: ${money(r.value)}, ${c === undefined || c === null ? "pokytis nežinomas" : fmtPct(c)}` };
  });
  $("#r-tm").innerHTML = items.length ? treemapHTML(items, { scale: TM_SCALE[tmMode], ratio: window.innerWidth < 680 ? 1 : 0.42, rich: true }) + tmLegend(TM_SCALE[tmMode], " %") : "";
  fitTreemaps($("#r-tm"));
  document.querySelectorAll("#tm-mode [data-tm]").forEach((b) => { b.setAttribute("aria-pressed", String(b.dataset.tm === tmMode)); if (b.dataset.tm === "pnl") b.disabled = !P.known; });
}

/* ---------- Dalinimosi kortelė (tik procentai, be sumų) ---------- */
async function shareCard() {
  const a = analyze(state.holdings);
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  try { await document.fonts.load("700 40px Onest"); } catch {}
  const F = (w, s) => `${w} ${s}px Onest, system-ui, sans-serif`;
  g.fillStyle = "#10233f"; g.fillRect(0, 0, W, H);
  const grd = g.createRadialGradient(W, 0, 50, W, 0, 900); grd.addColorStop(0, "rgba(227,155,27,.28)"); grd.addColorStop(1, "rgba(227,155,27,0)"); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // logotipas
  const bars = [[0, 24, 10, "#2c8c99"], [17, 16, 18, "#ffffff"], [34, 4, 30, "#e39b1b"]];
  bars.forEach(([x, y, h, col]) => { g.fillStyle = col; g.beginPath(); g.roundRect(80 + x, 80 + y, 12, h, 3); g.fill(); });
  g.fillStyle = "#fff"; g.font = F(700, 40); g.fillText("Invest", 138, 116); const iw = g.measureText("Invest").width; g.fillStyle = "#e39b1b"; g.fillText("AI", 138 + iw, 116);
  g.fillStyle = "#b9c7da"; g.font = F(500, 34); g.fillText("Mano portfelis", 80, 230);
  const P = a.pnl;
  g.font = F(800, 120);
  if (P.known && P.pct !== null) { g.fillStyle = P.pct >= 0 ? "#45c08f" : "#f07a70"; g.fillText(`${P.pct >= 0 ? "+" : "−"}${Math.abs(P.pct).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %`, 80, 360); g.fillStyle = "#b9c7da"; g.font = F(500, 30); g.fillText("nuo pirkimo", 80, 410); }
  else { g.fillStyle = "#fff"; g.fillText(`${a.rows.length} poz.`, 80, 360); }
  // sektorių juosta
  const list = a.sectors.slice(0, 6), rest = a.sectors.slice(6).reduce((t, x) => t + x.p, 0);
  if (rest > 0.005) list.push({ k: "Kiti", p: rest });
  let x = 80; const y = 480, bw = W - 160;
  g.fillStyle = "#fff"; g.font = F(600, 32); g.fillText("Pagal sektorius", 80, y - 24);
  list.forEach((s, i) => { const w = bw * s.p; g.fillStyle = PALETTE[i % PALETTE.length]; g.beginPath(); g.roundRect(x, y, Math.max(2, w - 4), 70, 10); g.fill(); x += w; });
  g.font = F(500, 28);
  list.forEach((s, i) => { const col = i % 2, row = Math.floor(i / 2), lx = 80 + col * 470, ly = y + 130 + row * 50; g.fillStyle = PALETTE[i % PALETTE.length]; g.beginPath(); g.roundRect(lx, ly - 22, 24, 24, 6); g.fill(); g.fillStyle = "#e8eef6"; g.fillText(`${s.k} ${Math.round(s.p * 100)} %`, lx + 38, ly); });
  // didžiausios pozicijos
  const top = a.byAsset.filter((r) => r.s !== CASH).slice(0, 5);
  let ty = y + 140 + Math.ceil(list.length / 2) * 50 + 40;
  g.fillStyle = "#fff"; g.font = F(600, 32); g.fillText("Didžiausios pozicijos", 80, ty); ty += 56;
  top.forEach((r) => { g.font = F(500, 30); g.fillStyle = "#e8eef6"; g.fillText(r.k.length > 30 ? r.k.slice(0, 29) + "…" : r.k, 80, ty); g.font = F(700, 30); g.textAlign = "right"; g.fillText(`${Math.round(r.p * 100)} %`, W - 80, ty); g.textAlign = "left"; ty += 50; });
  g.fillStyle = "#93a3b8"; g.font = F(400, 24); g.fillText("Sukurta su InvestAI · tai ne investavimo rekomendacija", 80, H - 70);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], "investai-portfelis.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Mano portfelis – InvestAI" }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function renderMovers(a) {
  const P = a.pnl;
  const card = $("#r-movers-card");
  if (!P.known) {
    card.querySelector("h2").textContent = "Pagal sektorius";
    $("#r-movers").innerHTML = `<div class="bars">${a.sectors.map((x, i) => `<div class="bar"><span class="bar-label"><i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${esc(x.k)}</span></span><span class="bar-track"><span style="width:${Math.max(1, x.p * 100).toFixed(1)}%;background:${PALETTE[i % PALETTE.length]}"></span></span><span class="bar-val">${pct(x.p)}</span></div>`).join("")}</div>`;
    return;
  }
  card.querySelector("h2").textContent = "Daugiausiai uždirbo ir prarado";
  const row = (r) => `<li><span class="mv-name"><button type="button" class="linkish mv-open" data-s="${esc(r.s)}">${esc(r.n)}</button>${EXPLAIN[r.s] ? ` <span class="why-dot">Kodėl?</span>` : ""}</span><span class="mv-amt">${signed(r.pnl)}</span><span class="pill ${r.pp >= 0 ? "up" : "down"}">${signedPct(r.pp)}</span></li>`;
  $("#r-movers").innerHTML = `${P.best.length ? `<h3 class="mv-h">Augo</h3><ul class="movers">${P.best.map(row).join("")}</ul>` : ""}${P.worst.length ? `<h3 class="mv-h">Krito</h3><ul class="movers">${P.worst.map(row).join("")}</ul>` : ""}<p class="muted small" style="margin:12px 0 0">Paspausk pavadinimą – pamatysi grafiką, naujienas ir, jei turime, paaiškinimą, kodėl kaina pasikeitė.</p>`;
  $("#r-movers").querySelectorAll(".mv-open").forEach((b) => b.addEventListener("click", () => openCard(b.dataset.s)));
}
function renderCompare(a) {
  const card = $("#r-compare-card");
  if (a.ex.equity <= 0) { card.hidden = true; return; }
  card.hidden = false;
  document.querySelectorAll(".seg button[data-cmp]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cmp === cmpDim)));
  const list = PFI.compare(a.ex)[cmpDim];
  const max = Math.max(...list.map((x) => Math.max(x.mine, x.market)), 0.01);
  $("#r-compare").innerHTML = list.map((x) => {
    const ratio = x.market > 0.005 ? x.mine / x.market : null;
    const tag = x.mine < 0.005 ? `<span class="cmp-tag">neturi</span>` : ratio !== null && ratio >= 1.8 ? `<span class="cmp-tag hi">×${ratio.toLocaleString("lt-LT", { maximumFractionDigits: 1 })} daugiau</span>` : ratio !== null && ratio <= 0.5 ? `<span class="cmp-tag">mažiau</span>` : x.market < 0.005 ? `<span class="cmp-tag hi">rinkoje beveik nėra</span>` : "";
    return `<div class="cmp-row"><div class="cmp-label">${esc(x.k)} ${tag}</div>
      <div class="cmp-bars"><span class="me" style="width:${(x.mine / max) * 100}%"></span><span class="mk" style="width:${(x.market / max) * 100}%"></span></div>
      <div class="cmp-val"><b>${pct(x.mine)}</b><span>${pct(x.market)}</span></div></div>`;
  }).join("") + (cmpDim === "sectors" && a.sectors.some((x) => x.k === "Gynyba ir aviacija") ? `<p class="muted small" style="margin:10px 0 0">Gynybos ir aviacijos įmonės čia įskaičiuotos į pramonę – taip jas klasifikuoja indeksai.</p>` : "");
}
function renderScenarios(a) {
  $("#r-scn-tabs").innerHTML = PFI.SCENARIOS.map((s) => `<button type="button" data-scn="${s.id}" aria-pressed="${s.id === scnId}">${esc(s.name)}</button>`).join("");
  $("#r-scn-tabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { scnId = b.dataset.scn; renderScenarios(analyze(state.holdings)); }));
  const s = PFI.SCENARIOS.find((x) => x.id === scnId) || PFI.SCENARIOS[0];
  const r = PFI.scenario(a.rows, s.shock);
  const label = { stocks: "Akcijos ir akcijų fondai", crypto: "Kriptovaliutos", gold: "Auksas", bonds: "Obligacijos" };
  const parts = Object.entries(r.by).filter(([k, v]) => k !== "cash" && v);
  $("#r-scn").innerHTML = `<div class="scn">
    <div class="scn-big"><b>${signed(r.loss)}</b><span>${signedPct((r.loss / a.total) * 100)} portfelio · liktų ${money(a.total + r.loss)}</span></div>
    <ul class="scn-parts">${parts.map(([k, v]) => `<li><span>${label[k]} (${s.shock[k]}\u00a0%)</span><b>${signed(v)}</b></li>`).join("")}${a.typeShare("Grynieji") ? `<li><span>Grynieji pinigai</span><b>0 €</b></li>` : ""}</ul>
  </div><p class="muted small" style="margin:12px 0 0">${esc(s.note)} Atskiros akcijos ir siauri sektorių fondai per nuosmukius dažnai krenta daugiau nei visa rinka.</p>`;
}
let EXPLAIN = {};
let PRICES_PF = { items: {} };
let FUND = {};
function renderCards(a) {
  const total = a.total;
  const list = state.holdings.filter((h) => h.value > 0).slice().sort((x, y) => y.value - x.value);
  $("#r-cards").innerHTML = list.map((h) => {
    const m = meta(h);
    const sIdx = Math.abs([...m.sector].reduce((t, c) => t + c.charCodeAt(0), 0)) % PALETTE.length;
    const initials = m.n.replace(/[^A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
    const pp = typeof h.pnlPct === "number" ? h.pnlPct : typeof h.pnl === "number" && h.value - h.pnl > 0 ? (h.pnl / (h.value - h.pnl)) * 100 : null;
    const ex = EXPLAIN[h.s];
    const tvOk = isTv(h.s);
    const pr = PRICES_PF.items[h.s];
    return `<details class="pos" data-s="${esc(h.s)}">
      <summary>
        ${logoHTML(h.s, m.n, PALETTE[sIdx], 44)}
        <span class="pos-main"><b>${esc(m.n)}</b><small>${esc([tvOk ? ticker(h.s) : "", m.sector === "Kita" ? "Sektorius nežinomas" : m.sector].filter(Boolean).join(" · "))}</small>${ex ? `<span class="why-dot">Kodėl ${ex.direction === "up" ? "kilo" : ex.direction === "down" ? "krito" : "svyruoja"}?</span>` : ""}</span>
        <span class="pos-spark">${pr ? sparkSVG(pr.spark, 84, 28) : ""}</span>
        <span class="pos-num"><b>${money(h.value)}</b><small>${pct(h.value / total)}${pp !== null ? ` · <span class="${pp >= 0 ? "up" : "down"}">${signedPct(pp)}</span>` : ""}</small>${pr && pr.d1 !== null ? `<small>Šiandien <span class="${pr.d1 >= 0 ? "up" : "down"}">${fmtPct(pr.d1)}</span></small>` : ""}</span>
      </summary>
      <div class="pos-body">
        ${h.qty ? `<p class="pos-qty">${(+Number(h.qty).toFixed(6)).toLocaleString("lt-LT")} vnt.${h.avg ? ` · vidutinė kaina ${fmtPrice(h.avg, h.pcur)}` : ""}${h.auto ? " · vertė atnaujinama automatiškai" : ""}</p>` : ""}
        ${pr ? `<dl class="pos-stats"><div><dt>Per mėnesį</dt><dd class="${(pr.m1 ?? 0) >= 0 ? "up" : "down"}">${fmtPct(pr.m1)}</dd></div><div><dt>Per metus</dt><dd class="${(pr.y1 ?? 0) >= 0 ? "up" : "down"}">${fmtPct(pr.y1)}</dd></div><div><dt>Nuo metų aukščiausios</dt><dd class="${(pr.fromHigh ?? 0) < -0.5 ? "down" : ""}">${fmtPct(pr.fromHigh)}</dd></div><div><dt>Svyravimas per metus</dt><dd>${pr.vol ? `~${Math.round(pr.vol)} %` : "–"}</dd></div></dl>` : ""}
        ${ex ? explainHTML(ex) : `<p class="muted small" style="margin:0">${tvOk ? "Paaiškinimo apie šį aktyvą dar nėra. Kas su juo vyko, matysi grafike ir naujienose žemiau." : "Šio aktyvo neturime sąraše, todėl grafiko ir naujienų parodyti negalime."}</p>`}
        ${tvOk ? `<div class="pos-widgets"><div class="pos-chart"></div><div class="pos-news"></div></div>
        <p style="margin:12px 0 0"><a href="${assetUrl(h.s)}">Visa informacija apie ${esc(m.n)}</a></p>` : ""}
      </div>
    </details>`;
  }).join("");
  $("#r-cards").querySelectorAll("details.pos").forEach((d) => d.addEventListener("toggle", () => {
    if (!d.open || d.dataset.loaded || !isTv(d.dataset.s)) return;
    d.dataset.loaded = "1";
    const sym = d.dataset.s;
    const pr = PRICES_PF.items[sym];
    if (pr) mountPriceChart(d.querySelector(".pos-chart"), sym, pr, { cur: CUR_SIGN[pr.cur] || pr.cur });
    else d.querySelector(".pos-chart").remove();
    tv(d.querySelector(".pos-news"), "timeline", { feedMode: "symbol", symbol: sym, width: "100%", height: 300, displayMode: "compact" });
  }));
}
/* Portfelio vertė laike: dabartinės pozicijos × istorinės kainos (apytiksliai) */
const PF_RANGES = [["1 mėn.", 30], ["3 mėn.", 91], ["6 mėn.", 182], ["1 m.", 365]];
let pfChart = null, pfRange = 3;
async function renderPfChart(a) {
  const el = $("#r-chart");
  if (!el) return;
  const rows = a.rows.filter((r) => isTv(r.s) && PRICES_PF.items[r.s]);
  const fixed = a.total - rows.reduce((t, r) => t + r.value, 0);
  if (!rows.length) { el.closest(".pf-chart-wrap").hidden = true; return; }
  const [LW, hs] = await Promise.all([loadLWC(), Promise.all(rows.map((r) => loadHist(r.s, PRICES_PF.items[r.s])))]);
  const series = rows.map((r, i) => { const d = hs[i].d; const last = d.length ? d[d.length - 1].value : 0; return { r, d, last }; }).filter((x) => x.d.length && x.last);
  const dates = [...new Set(series.flatMap((x) => x.d.map((p) => p.time)))].sort();
  const idx = series.map(() => 0);
  const pts = dates.map((t) => {
    let v = fixed;
    series.forEach((x, i) => { while (idx[i] + 1 < x.d.length && x.d[idx[i] + 1].time <= t) idx[i]++; const p = x.d[idx[i]]; v += x.r.value * ((p.time <= t ? p.value : x.d[0].value) / x.last); });
    return { time: t, value: Math.round(v * 100) / 100 };
  });
  el.innerHTML = `<div class="pf-chart-box"></div><div class="seg seg-sm pf-ranges">${PF_RANGES.map(([l], i) => `<button type="button" data-r="${i}" aria-pressed="${i === pfRange}">${l}</button>`).join("")}</div>`;
  const chart = LW.createChart($(".pf-chart-box", el), { ...chartTheme(), autoSize: true, rightPriceScale: { visible: false }, leftPriceScale: { visible: false }, timeScale: { visible: false, fixLeftEdge: true, fixRightEdge: true }, grid: { vertLines: { visible: false }, horzLines: { visible: false } }, handleScale: false, handleScroll: false });
  const ser = chart.addSeries(LW.AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4 });
  const draw = () => {
    const from = addDays(pts[pts.length - 1].time, -PF_RANGES[pfRange][1]);
    const data = pts.filter((p) => p.time >= from);
    const up = data[data.length - 1].value >= data[0].value, col = cssVar(up ? "--up" : "--down");
    ser.applyOptions({ lineColor: col, topColor: col + "40", bottomColor: col + "00" });
    ser.setData(data);
    chart.timeScale().fitContent();
    const ch = data[data.length - 1].value - data[0].value;
    $("#r-chart-chg").innerHTML = `<span class="${up ? "up" : "down"}">${ch >= 0 ? "+" : "−"}${money(Math.abs(ch))} · ${fmtPct((data[data.length - 1].value / data[0].value - 1) * 100)}</span> per ${{ 0: "mėnesį", 1: "3 mėnesius", 2: "pusmetį", 3: "metus" }[pfRange]}`;
    el.querySelectorAll("[data-r]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.r === pfRange)));
  };
  el.querySelector(".pf-ranges").addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) { pfRange = +b.dataset.r; draw(); } });
  draw();
}

let ptab = "overview";
function showPTab(id) {
  ptab = id;
  document.querySelectorAll(".ptabs [data-ptab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.ptab === id)));
  document.querySelectorAll(".ptab[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== id));
}
function openCard(s) {
  const d = [...document.querySelectorAll("#r-cards details.pos")].find((x) => x.dataset.s === s);
  if (!d) return;
  showPTab("positions");
  d.open = true;
  d.scrollIntoView({ behavior: "smooth", block: "start" });
}
function renderTable(a) {
  $("#r-table").innerHTML = `<div class="pf-table-wrap"><table class="pf-table">
    <thead><tr><th>Aktyvas</th><th>Sektorius</th><th class="num">Vertė, ${curSym()}</th><th class="num">Rezultatas, ${curSym()}</th><th></th></tr></thead>
    <tbody>${state.holdings.map((h, i) => {
      const m = meta(h);
      const name = isTv(h.s) ? `<a href="${assetUrl(h.s)}">${esc(m.n)}</a>` : esc(m.n);
      return `<tr><td>${name}</td><td>${esc(m.sector)}</td>
        <td class="num"><input class="pf-edit" data-i="${i}" type="number" min="0" step="any" value="${Math.round(h.value * 100) / 100}" aria-label="${esc(m.n)} vertė"></td>
        <td class="num"><input class="pf-edit pf-pnl" data-i="${i}" type="number" step="any" value="${typeof h.pnl === "number" ? Math.round(h.pnl * 100) / 100 : ""}" placeholder="–" aria-label="${esc(m.n)} rezultatas"></td>
        <td><button class="icon-btn" data-del="${i}" aria-label="Pašalinti ${esc(m.n)}">×</button></td></tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td>Iš viso</td><td></td><td class="num">${money(a.total)}</td><td class="num">${a.pnl.known ? signed(a.pnl.pnl) : "–"}</td><td></td></tr></tfoot></table></div>
    <p class="muted small">Rezultatas – kiek pozicija uždirbo (+) ar prarado (−) nuo pirkimo.</p>`;
  $("#r-table").querySelectorAll(".pf-edit:not(.pf-pnl)").forEach((inp) => inp.addEventListener("change", () => {
    const h = state.holdings[+inp.dataset.i];
    h.value = Math.max(0, Number(inp.value) || 0);
    delete h.auto; // ranka pakeista vertė nebeatnaujinama automatiškai
    commit();
  }));
  $("#r-table").querySelectorAll(".pf-pnl").forEach((inp) => inp.addEventListener("change", () => {
    const h = state.holdings[+inp.dataset.i];
    if (inp.value.trim() === "") { delete h.pnl; delete h.pnlPct; }
    else { h.pnl = Number(inp.value); h.pnlPct = h.value - h.pnl > 0 ? Math.round((h.pnl / (h.value - h.pnl)) * 10000) / 100 : null; }
    delete h.avg;
    commit();
  }));
  $("#r-table").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    state.holdings.splice(+b.dataset.del, 1);
    commit();
  }));
}
function renderRules(a) {
  const box = $("#rule-inputs");
  if (!box.dataset.ready) {
    box.innerHTML = RULES.map((r) => `<label class="rule"><span>${r.label}</span><span><input type="number" min="0" max="100" step="any" data-rule="${r.id}" value="${state.rules[r.id] ?? ""}" placeholder="–"> %</span></label>`).join("");
    box.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
      const v = inp.value.trim();
      if (v === "") delete state.rules[inp.dataset.rule]; else state.rules[inp.dataset.rule] = Number(v);
      save();
      renderChecks(analyze(state.holdings));
    }));
    box.dataset.ready = "1";
  }
  renderChecks(a);
}
function renderChecks(a) {
  const c = checkRules(a, state.rules);
  const bad = c.filter((x) => !x.ok).length;
  $("#rules-sum").textContent = c.length ? (bad ? `${bad} iš ${c.length} taisyklių neatitinka` : `Visos ${c.length} taisyklės atitinka`) : "Nustatyk ribas, kurių pats nori laikytis";
  $("#r-checks").innerHTML = c.length
    ? c.map((x) => `<li class="${x.ok ? "ok" : "warn"}"><b>${x.ok ? "Atitinka" : "Neatitinka"}:</b> ${esc(x.r.label.toLowerCase())} ${x.lim} %${x.detail ? ` <span class="muted">(${esc(x.detail)})</span>` : ""}</li>`).join("")
    : "";
}
let quotesKey = "", mentionsKey = "";
function renderToday(a) {
  const d = $("#d-today");
  const draw = () => {
    if (!d.open) return;
    const syms = a.rows.filter((r) => isTv(r.s)).map((r) => ({ name: r.s, displayName: r.n }));
    const key = syms.map((s) => s.name).join(",");
    if (key !== quotesKey) {
      quotesKey = key;
      if (syms.length) tv($("#r-quotes"), "market-quotes", { width: "100%", height: Math.min(130 + syms.length * 46, 640), showSymbolLogo: true, symbolsGroups: [{ name: "Mano aktyvai", symbols: syms }] });
    }
    renderMentions(a);
  };
  d.ontoggle = draw;
  draw();
}
async function renderMentions(a) {
  const mine = a.rows.filter((r) => r.s !== CASH);
  const key = mine.map((r) => r.s).join(",");
  if (key === mentionsKey) return;
  mentionsKey = key;
  const el = $("#r-mentions");
  try {
    const idx = await getJSON("data/index.json");
    const digests = await Promise.all(idx.digests.slice(0, 30).map((x) => getJSON(`data/digests/${x.date}.json`).catch(() => null)));
    const hits = [];
    for (const d of digests.filter(Boolean)) for (const sec of d.sections || []) for (const it of sec.items || []) {
      const tags = (it.tags || []).map((t) => t.toUpperCase());
      const hay = `${it.headline} ${it.text}`.toLowerCase();
      const m = mine.find((r) => tags.includes(ticker(r.s).toUpperCase()) || (r.n.length > 3 && hay.includes(r.n.toLowerCase().split(" (")[0])));
      if (m) hits.push({ d, it, m });
    }
    el.innerHTML = hits.length
      ? `<h3>Paminėta apžvalgose</h3><ul class="mentions">${hits.map(({ d, it, m }) => `<li><time>${fmtShort(d.date)}</time><span class="badge tag">${esc(ticker(m.s))}</span><a href="apzvalga.html?d=${d.date}">${esc(it.headline)}</a></li>`).join("")}</ul>`
      : `<p class="muted">Paskutinėse apžvalgose tavo aktyvai neminėti. Kiekvieno aktyvo naujienas rasi jo puslapyje.</p>`;
  } catch { el.innerHTML = ""; }
}
function snapshot() {
  if (isDemo) return;
  try {
    const a = analyze(state.holdings);
    if (!a.total) return;
    const d = new Date().toISOString().slice(0, 10);
    const list = JSON.parse(localStorage.getItem("investai.history.v1") || "[]").filter((x) => x.d !== d);
    list.push({ d, v: Math.round(a.total * 100) / 100, pnl: a.pnl.known ? Math.round(a.pnl.pnl * 100) / 100 : null });
    list.sort((x, y) => (x.d < y.d ? -1 : 1));
    localStorage.setItem("investai.history.v1", JSON.stringify(list.slice(-400)));
  } catch {}
}
function commit() { save(); snapshot(); renderResult(); }
/* ---------- Atsarginė kopija ---------- */
const BK_KEY = "investai.backup.v1";
const BACKUP_KEYS = ["investai.history.v1", "investai.pf.snap.v1", "investai.watch.v1", "investai.alerts.v1", "investai.profile.v1", "investai.pf.review.v1", "investai.co.v1"];
function bkInfo() { try { return JSON.parse(localStorage.getItem(BK_KEY) || "{}"); } catch { return {}; } }
function toastPf(msg) {
  const t = document.createElement("div"); t.className = "pf-toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 3200);
}
async function backupDownload() {
  const extra = {};
  for (const k of BACKUP_KEYS) { try { const v = localStorage.getItem(k); if (v) extra[k] = v; } catch {} }
  const data = { app: "InvestAI", version: 2, exported: new Date().toISOString(), portfolio: state, extra };
  const name = `investai-kopija-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: "application/json" });
  let done = false;
  // Telefone (ypač iPhone programėlėje) patogiau per bendrinimo meniu – galima išsaugoti „Failuose“ ar el. laiške
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "InvestAI atsarginė kopija" }); done = true; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  if (!done) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  try { localStorage.setItem(BK_KEY, JSON.stringify({ at: new Date().toISOString() })); } catch {}
  renderBackup();
  toastPf("Atsarginė kopija paruošta.");
}
function renderBackup() {
  const box = $("#r-backup"), last = $("#bk-last");
  const info = bkInfo();
  if (last) last.textContent = info.at ? `Paskutinė kopija: ${new Date(info.at).toLocaleDateString("lt-LT")}.` : "Kopijos dar nedarei.";
  if (!box) return;
  const days = (iso) => (iso ? (Date.now() - new Date(iso)) / 864e5 : Infinity);
  const first = (state.tx && state.tx.length) || state.holdings.length >= 3;
  const show = !isDemo && state.holdings.length && first && days(info.at) > 30 && days(info.snooze) > 7;
  box.hidden = !show;
  if (!show) return;
  box.innerHTML = `<div class="bk-row"><span class="bk-ico">${icon("upload", 20)}</span><div><b>${info.at ? "Laikas atnaujinti atsarginę kopiją" : "Pasidaryk atsarginę kopiją"}</b>
    <p class="muted small">Portfelis saugomas tik šioje naršyklėje. Išvalius naršyklę ar pakeitus telefoną, jis dingtų – kopija užtrunka 2 sekundes.</p>
    <div class="bk-btns"><button type="button" class="btn primary small" id="bk-go">Atsisiųsti kopiją</button><button type="button" class="btn small" id="bk-later">Vėliau</button></div></div></div>`;
  $("#bk-go").addEventListener("click", backupDownload);
  $("#bk-later").addEventListener("click", () => { try { localStorage.setItem(BK_KEY, JSON.stringify({ ...bkInfo(), snooze: new Date().toISOString() })); } catch {} box.hidden = true; });
}


/* ---------- Paieškos laukas (aktyvo pasirinkimas) ---------- */
function picker(input, onPick) {
  const list = input.parentElement.querySelector(".suggest") || (() => {
    const ul = document.createElement("ul"); ul.className = "suggest"; ul.hidden = true; input.parentElement.appendChild(ul); return ul;
  })();
  const open = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { list.hidden = true; return; }
    const hits = ASSETS.filter((a) => a.n.toLowerCase().includes(q) || a.s.toLowerCase().includes(q)).slice(0, 7);
    const raw = input.value.trim().toUpperCase();
    if (SYMBOL_RE.test(raw) && !hits.some((h) => h.s === raw)) hits.push({ s: raw, n: "Kitas aktyvas" });
    if (/^gryn|^cash|^pinig/.test(q)) hits.unshift({ s: CASH, n: "Grynieji pinigai" });
    list.innerHTML = hits.length
      ? hits.map((h) => `<li><a href="#" data-s="${esc(h.s)}" data-n="${esc(h.n)}"><b>${esc(h.n)}</b><span>${esc(h.s === CASH ? "" : h.s)}</span></a></li>`).join("")
      : `<li class="muted">Nerasta. Įvesk simbolį, pvz., NYSE:KO</li>`;
    list.hidden = false;
  };
  input.addEventListener("input", () => { onPick(null); open(); });
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-s]");
    if (!a) return;
    e.preventDefault();
    const s = a.dataset.s;
    input.value = s === CASH ? "Grynieji pinigai" : a.dataset.n === "Kitas aktyvas" ? s : a.dataset.n;
    list.hidden = true;
    onPick(s);
  });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 120));
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") list.hidden = true; });
}
function resolveTyped(text) {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const raw = text.trim().toUpperCase();
  if (SYMBOL_RE.test(raw)) return raw;
  const hit = ASSETS.find((a) => a.n.toLowerCase() === q) || ASSETS.find((a) => ticker(a.s).toLowerCase() === q) || ASSETS.find((a) => a.n.toLowerCase().startsWith(q) && q.length >= 4);
  return hit ? hit.s : null;
}

/* ---------- Nuotraukos atpažinimas ---------- */
let ocrWorker = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Nepavyko įkelti atpažinimo modulio"));
    document.head.appendChild(s);
  });
}
async function getWorker(progress) {
  if (ocrWorker) return ocrWorker;
  const base = new URL("assets/ocr/", location.href).href;
  progress(0.05, "Įkeliamas teksto atpažinimas (tik pirmą kartą, ~8 MB)…");
  await loadScript(base + "tesseract.min.js");
  ocrWorker = await Tesseract.createWorker(["lit", "eng"], 1, {
    workerPath: base + "worker.min.js",
    corePath: base,
    langPath: base + "lang",
    gzip: true,
    logger: (m) => {
      if (m.status === "recognizing text") progress(0.35 + m.progress * 0.6, "Skaitomas tekstas nuotraukoje…");
      else if (/loading|initializ/.test(m.status)) progress(0.05 + (m.progress || 0) * 0.3, "Ruošiamas atpažinimas…");
    },
  });
  return ocrWorker;
}
function imageToCanvas(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width < 1100 ? 2 : img.width > 3000 ? 0.6 : 1;
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // Pilka spalva; tamsius ekranus (šviesus tekstas ant tamsaus fono) apverčiame
      const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) { const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = g; sum += g; }
      if (sum / (px.length / 4) < 115) for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
      ctx.putImageData(d, 0, 0);
      URL.revokeObjectURL(img.src);
      res(c);
    };
    img.onerror = () => rej(new Error("Nepavyko atidaryti nuotraukos"));
    img.src = URL.createObjectURL(file);
  });
}
async function recognizeFiles(files, progressEl) {
  const bar = progressEl.querySelector(".progress-bar span"), txt = progressEl.querySelector("p");
  progressEl.hidden = false;
  const images = [...files].filter((f) => f.type.startsWith("image/"));
  if (!images.length) throw new Error("Pasirink nuotrauką (PNG ar JPG).");
  const results = [];
  for (let i = 0; i < images.length; i++) {
    const label = images.length > 1 ? ` (${i + 1} iš ${images.length})` : "";
    const progress = (p, t) => { bar.style.width = `${Math.round(((i + p) / images.length) * 100)}%`; txt.textContent = t + label; };
    const w = await getWorker(progress);
    const canvas = await imageToCanvas(images[i]);
    progress(0.35, "Skaitomas tekstas nuotraukoje…");
    const { data } = await w.recognize(canvas, {}, { blocks: true, text: true });
    results.push(pfParse.parse(pfParse.linesFromBlocks(data.blocks), ASSETS));
  }
  bar.style.width = "100%"; txt.textContent = "Baigta";
  setTimeout(() => (progressEl.hidden = true), 400);
  return results;
}
function mergeIntoDraft(results) {
  let usd = 0, all = 0;
  for (const r of results) {
    const ai = !!r.ai;
    for (const row of r.rows) {
      all++; if (row.cur === "USD") usd++;
      const ex = draft.find((d) => d.s === row.s);
      // Ta pati pozicija keliose nuotraukose su ta pačia suma – tikėtina, kad nuotraukos persidengia
      if (ex) { if (Math.abs(ex.value - row.value) > Math.max(1, ex.value * 0.01)) ex.value += row.value; }
      else draft.push({ s: row.s, n: row.n, value: Math.round(row.value * 100) / 100, src: row.src, unknown: false, fixed: row.fixed, pnl: row.pnl, pnlPct: row.pnlPct, qty: row.qty, csv: ai });
    }
    for (const u of r.unknown) {
      all++; if (u.cur === "USD") usd++;
      if (draft.some((d) => d.src === u.text)) continue;
      const name = u.name || u.text;
      draft.push({ s: name ? customId(name) : null, n: name, value: Math.round(u.value * 100) / 100, src: u.text, unknown: true, custom: true, pnl: u.pnl, pnlPct: u.pnlPct, qty: u.qty, csv: ai });
    }
  }
  return { usd, all };
}

/* ---------- Peržiūra ---------- */
function renderReview(info) {
  show("review");
  const note = $("#review-note");
  const cur = info && info.csv ? "EUR" : info && info.usd > info.all / 2 ? "USD" : state.holdings.length ? state.currency : "EUR";
  $("#v-review").dataset.cur = cur;
  if (!draft.length) {
    note.hidden = false;
    note.textContent = info ? "Nuotraukoje neradome pozicijų. Pabandyk aiškesnę nuotrauką arba suvesk pozicijas ranka." : "Suvesk savo pozicijas: aktyvą ir jo vertę.";
    draft.push({ s: null, n: "", value: "", src: "", unknown: false });
  } else if (info && info.ai) {
    note.hidden = false;
    note.innerHTML = `Nuotrauką perskaitė AI – radome ${draft.length} ${ltN(draft.length, "poziciją", "pozicijas", "pozicijų")}. Peržiūrėk, ar viskas sutampa su tavo programėle, ir pataisyk, jei reikia.`;
  } else if (info && info.csv) {
    const c = info.csv;
    note.hidden = false;
    note.innerHTML = `${c.broker ? `Atpažinome <b>${esc(c.broker)}</b> failą. ` : ""}Radome ${c.n} ${ltN(c.n, "poziciją", "pozicijas", "pozicijų")}${c.divs ? ` ir ${c.divs} ${ltN(c.divs, "dividendų išmoką", "dividendų išmokas", "dividendų išmokų")}` : ""}. Vertės eurais apskaičiuotos pagal naujausias kainas${c.live ? " ir toliau atsinaujins automatiškai" : ""}.${c.unknown ? ` ${c.unknown} ${ltN(c.unknown, "aktyvo", "aktyvų", "aktyvų")} mūsų sąraše nėra – jų vertė pagal failo duomenis.` : ""} Grynųjų pinigų likutį pridėk ranka.`;
  } else if (cur === "USD") {
    note.hidden = false;
    note.textContent = "Sumos nuotraukoje – doleriais. Analizė bus rodoma doleriais: procentinės dalys nuo to nesikeičia.";
  } else note.hidden = true;
  const list = $("#review-list");
  list.innerHTML = draft.map((d, i) => `
    <li class="${d.custom || !d.s ? "unknown" : ""}" data-i="${i}">
      <div class="field"><input type="search" aria-label="Aktyvas" placeholder="Kas tai? Pvz., Apple ar NYSE:KO" value="${esc(d.s ? (d.s === CASH ? "Grynieji pinigai" : d.n || meta(d).n) : d.n || "")}"></div>
      <div class="val" data-cur="${cur === "USD" ? "$" : "€"}"><input type="number" min="0" step="any" inputmode="decimal" aria-label="Vertė" value="${d.value}"></div>
      <button class="icon-btn" type="button" aria-label="Pašalinti eilutę">×</button>
      ${typeof d.pnlPct === "number" ? `<p class="src">Rezultatas: <b class="${d.pnlPct >= 0 ? "up" : "down"}">${signedPct(d.pnlPct)}</b>${typeof d.pnl === "number" ? ` (${signed(d.pnl, cur)})` : ""}${d.qty ? ` · ${String(d.qty).replace(".", ",")} vnt.` : ""}</p>` : ""}
      ${d.csv ? `<p class="src">${esc(d.src)}${d.custom ? " · šio aktyvo mūsų sąraše nėra – bus įtrauktas kaip „Kita“" : ""}</p>` : d.custom ? `<p class="src">Šio aktyvo mūsų sąraše nėra – bus įtrauktas kaip „Kita“. Jei randi jį paieškoje, pasirink.</p>` : d.fixed ? `<p class="src">Suma pataisyta (nuotraukoje neperskaitytas kablelis) – patikrink.</p>` : d.src ? `<p class="src">Nuotraukoje: „${esc(d.src)}“</p>` : ""}
    </li>`).join("");
  list.querySelectorAll("li").forEach((li) => {
    const i = +li.dataset.i;
    const [nameIn, valIn] = li.querySelectorAll("input");
    picker(nameIn, (s) => {
      if (s) { if (s !== draft[i].s) { draft[i].auto = false; delete draft[i].avg; } draft[i].s = s; draft[i].custom = false; draft[i].n = findAsset(s) ? findAsset(s).n : s === CASH ? "Grynieji pinigai" : ticker(s); li.classList.remove("unknown"); }
      else { draft[i].s = null; draft[i].custom = false; draft[i].n = nameIn.value.trim(); }
    });
    valIn.addEventListener("input", () => { draft[i].value = valIn.value; draft[i].edited = true; });
    li.querySelector(".icon-btn").addEventListener("click", () => { draft.splice(i, 1); renderReview(); });
  });
}
function finishReview() {
  const items = [];
  const rows = $("#review-list").querySelectorAll("li");
  let missing = 0;
  rows.forEach((li) => {
    const d = draft[+li.dataset.i];
    const nameIn = li.querySelector("input");
    const typed = nameIn.value.trim();
    if (!d.s && typed) {
      d.s = resolveTyped(typed);
      if (!d.s) { d.s = customId(typed); d.n = typed; d.custom = true; }
    }
    const v = Number(d.value);
    if (!(v > 0)) return;
    if (!d.s) { missing++; li.classList.add("unknown"); return; }
    const extra = {};
    if (typeof d.pnl === "number") extra.pnl = d.pnl;
    if (typeof d.pnlPct === "number") extra.pnlPct = d.pnlPct;
    if (d.qty) extra.qty = d.qty;
    if (d.avg && !d.edited) { extra.avg = d.avg; extra.pcur = d.pcur; }
    if (d.auto && !d.edited) extra.auto = true;
    items.push({ s: d.s, value: v, ...extra, ...(findAsset(d.s) || d.s === CASH ? {} : { n: d.n || typed || ticker(d.s) }) });
  });
  if (missing) {
    const note = $("#review-note");
    note.hidden = false;
    note.textContent = `${missing} eilutėse neįrašytas aktyvo pavadinimas. Įrašyk jį arba pašalink eilutę.`;
    note.scrollIntoView({ block: "center" });
    return;
  }
  if (!items.length) return;
  const merged = new Map();
  items.forEach((it) => {
    const ex = merged.get(it.s);
    merged.set(it.s, ex ? { ...ex, value: ex.value + it.value, pnl: (ex.pnl || 0) + (it.pnl || 0) || undefined, pnlPct: undefined, qty: undefined, avg: undefined, auto: undefined } : it);
  });
  isDemo = false;
  state.holdings = [...merged.values()];
  state.currency = $("#v-review").dataset.cur || "EUR";
  if (pendingDivs) { state.divs = pendingDivs; pendingDivs = null; }
  if (pendingTx) { state.tx = pendingTx; state.txBroker = pendingBroker; pendingTx = null; }
  draft = [];
  $("#rule-inputs").dataset.ready = "";
  quotesKey = mentionsKey = "";
  animateNext = true;
  commit();
}

/* ---------- Brokerio CSV ---------- */
// Lietuviškos daugiskaitos formos: 1 (21, 31…), 2–9 (22–29…), 10–20 ir kt.
const ltN = (n, one, few, many) => { const t = n % 10, h = n % 100; return t === 1 && h !== 11 ? one : t >= 2 && t <= 9 && (h < 12 || h > 19) ? few : many; };
let pendingDivs = null, pendingTx = null, pendingBroker = "";
const isCSV = (f) => f && (/\.(csv|txt)$/i.test(f.name || "") || /csv|comma-separated/.test(f.type || ""));
const fxEur = (c) => (c ? TO_EUR[c === "GBX" ? "GBp" : c] : TO_EUR.EUR) || null;
const r2 = (v) => Math.round(v * 100) / 100;
const normName = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(inc|corp|corporation|plc|ltd|ab|as|ag|sa|nv|se|co|class [abc]|the)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1257").decode(buf); } // Baltijos bankų failai
}
function csvSymbol(p) {
  const t = String(p.ticker || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t) {
    const key = (a) => ticker(a.s).toUpperCase().replace(/[^A-Z0-9]/g, "");
    let c = ASSETS.filter((a) => key(a) === t);
    if (!c.length) c = ASSETS.filter((a) => a.type === "Kriptovaliuta" && (key(a) === t + "USD" || key(a) === t + "USDT"));
    if (c.length) {
      const score = (a) => { const pr = PRICES_PF.items[a.s]; return (pr ? 2 : 0) + (pr && p.pcur && pr.cur === p.pcur ? 3 : 0) + (typeof DUP_SKIP !== "undefined" && DUP_SKIP.has(a.s) ? -1 : 0); };
      return c.sort((x, y) => score(y) - score(x))[0].s;
    }
  }
  const n = normName(p.name);
  if (n.length >= 3) {
    const hit = ASSETS.find((a) => normName(a.n) === n) || (n.length >= 5 && ASSETS.find((a) => { const m = normName(a.n); return m.length >= 4 && (m.startsWith(n) || n.startsWith(m + " ")); }));
    if (hit) return hit.s;
  }
  return null;
}
// Pozicijos vertė eurais ir rezultatas pagal naujausią kainą (jei turime) arba failo duomenis
function valueOf(qty, avg, pcur, s) {
  const pr = s && PRICES_PF.items[s];
  if (!pr || !pr.price || !qty || !fxEur(pr.cur)) return null;
  const value = qty * pr.price * fxEur(pr.cur);
  let pnlPct = null;
  if (avg > 0) {
    const inCur = !pcur || pcur === pr.cur ? pr.price : fxEur(pcur) ? (pr.price * fxEur(pr.cur)) / fxEur(pcur) : null;
    if (inCur) pnlPct = (inCur / avg - 1) * 100;
    if (!(pnlPct > -99.9 && pnlPct < 10000)) pnlPct = null; // tikėtina valiutų painiava
  }
  return { value, pnlPct };
}
function csvRow(p, broker) {
  const s = csvSymbol(p);
  const name = p.name || p.ticker || p.isin || "";
  let v = valueOf(p.qty, p.avg, p.pcur, s), how = "live";
  if (!v && p.value > 0) { v = { value: p.value * (fxEur(p.valueCur || p.pcur) || 1), pnlPct: null }; how = "file"; }
  if (!v && p.qty > 0 && p.lastPrice > 0) { v = { value: p.qty * p.lastPrice * (fxEur(p.pcur) || 1), pnlPct: null }; how = "last"; }
  if (!v) return null;
  if (v.pnlPct === null && typeof p.pnl === "number" && v.value) { const pe = p.pnl * (fxEur(p.valueCur || p.pcur) || 1); if (v.value - pe > 0) v.pnlPct = (pe / (v.value - pe)) * 100; }
  const qtyTxt = p.qty ? `${(+p.qty.toFixed(6)).toLocaleString("lt-LT")} vnt.` : "";
  const src = [broker || "CSV", qtyTxt, p.avg ? `vid. kaina ${fmtPrice(p.avg, p.pcur)}` : "", how === "last" ? "vertė pagal paskutinio sandorio kainą" : how === "file" ? "vertė iš failo" : ""].filter(Boolean).join(" · ");
  const row = { s: s || customId(name), n: s ? (findAsset(s) || {}).n || name : name, value: r2(v.value), src, csv: true, unknown: !s, custom: !s, qty: p.qty || undefined, avg: p.avg || undefined, pcur: p.pcur || undefined, auto: how === "live" };
  if (v.pnlPct !== null) { row.pnlPct = r2(v.pnlPct); row.pnl = r2(v.value - v.value / (1 + v.pnlPct / 100)); }
  return row;
}
async function handleCSV(file) {
  const prog = !$("#v-review").hidden ? $("#progress2") : $("#progress");
  try {
    const r = pfCSV.parse(await readText(file));
    const rows = r.positions.map((p) => csvRow(p, r.broker)).filter((x) => x && x.value > 0);
    if (!rows.length) throw new Error("Faile neradome atidarytų pozicijų");
    pendingDivs = r.divs.filter((d) => d.amt > 0 && d.date).map((d) => {
      const s = csvSymbol(d);
      return { d: d.date, s: s || undefined, n: s ? (findAsset(s) || {}).n : d.name || d.ticker || "", eur: r2(d.amt * (fxEur(d.cur) || 1)) };
    }).sort((x, y) => (x.d < y.d ? -1 : 1));
    pendingTx = Array.isArray(r.txs) && r.txs.length ? r.txs : null;
    pendingBroker = r.broker || "";
    isDemo = false;
    draft = rows;
    renderReview({ usd: 0, all: rows.length, csv: { broker: r.broker, n: rows.length, divs: pendingDivs.length, live: rows.some((x) => x.auto), unknown: rows.filter((x) => x.custom).length } });
  } catch (e) {
    console.error(e);
    show(!$("#v-review").hidden ? "review" : "start");
    prog.hidden = false;
    prog.querySelector(".progress-bar span").style.width = "0";
    prog.querySelector("p").textContent = `${e.message || "Nepavyko perskaityti failo"}. Tinka Trading 212, Revolut, Lightyear ir Interactive Brokers CSV arba lentelė su stulpeliais „Pavadinimas“ (ar „Ticker“) ir „Kiekis“ ar „Vertė“.`;
  }
}
// CSV pozicijų vertės kasdien perskaičiuojamos pagal naujausias kainas
function syncPrices() {
  if (isDemo || state.currency !== "EUR") return;
  let changed = false;
  for (const h of state.holdings) {
    if (!h.auto || !h.qty) continue;
    const v = valueOf(h.qty, h.avg, h.pcur, h.s);
    if (!v) continue;
    if (Math.abs(v.value - h.value) >= 0.01) { h.value = r2(v.value); changed = true; }
    if (v.pnlPct !== null) { h.pnlPct = r2(v.pnlPct); h.pnl = r2(v.value - v.value / (1 + v.pnlPct / 100)); }
  }
  if (changed) save();
}
function autoStamp() {
  const h = state.holdings.find((x) => x.auto && PRICES_PF.items[x.s]);
  return h && !isDemo ? ` · vertė pagal kainas: ${priceStamp(PRICES_PF.items[h.s]).toLowerCase()}` : "";
}

/* ---------- Kas toliau? Faktai apie pozicijas ir ekspertų nuomonės (ne rekomendacijos) ---------- */
const AN_TXT = { strong_buy: "stipriai pirkti", buy: "pirkti", hold: "laikyti", underperform: "prasčiau už rinką", sell: "parduoti" };
const pct0 = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("lt-LT", { maximumFractionDigits: 0 })} %`;
function holdingChecks(r) {
  const p = PRICES_PF.items[r.s] || {}, f = FUND[r.s] || {};
  const out = []; // { lvl: "red" | "amber" | "green", t }
  const ni = (f.ni || []).map((x) => x[1]), rev = (f.rev || []).map((x) => x[1]), sh = (f.sh || []).map((x) => x[1]);
  const type = (findAsset(r.s) || {}).type;
  if (type === "Akcija") {
    if (ni.length >= 2) {
      const losses = ni.filter((v) => v < 0).length;
      if (losses === ni.length) {
        const rg = rev.length >= 2 && rev[0] > 0 ? (Math.pow(rev[rev.length - 1] / rev[0], 1 / (rev.length - 1)) - 1) * 100 : null;
        out.push({ lvl: "red", t: `Nuostolinga visus ${ni.length} pastaruosius metus${rg !== null ? ` (pajamos ${rg >= 0 ? "augo" : "mažėjo"} vidutiniškai ${pct0(rg)} per metus)` : ""}.` });
      } else if (ni[ni.length - 1] < 0) out.push({ lvl: "amber", t: `Paskutiniais metais dirbo nuostolingai (${losses} iš ${ni.length} metų – nuostolis).` });
      else if (losses === 0 && typeof p.pm === "number") out.push({ lvl: "green", t: `Pelninga visus ${ni.length} metus, pelno marža ${pct0(p.pm * 100).replace("+", "")}.` });
    } else if (typeof p.pm === "number" && p.pm < 0) out.push({ lvl: "amber", t: `Šiuo metu nuostolinga (pelno marža ${pct0(p.pm * 100)}).` });
    if (sh.length >= 2 && sh[0] > 0) {
      const dil = (sh[sh.length - 1] / sh[0] - 1) * 100;
      if (dil >= 20) out.push({ lvl: "amber", t: `Akcijų skaičius per ${sh.length - 1} m. išaugo ${pct0(dil)} – įmonė leido naujas akcijas, todėl kiekvieno akcininko dalis mažėjo.` });
    }
    if (typeof p.de === "number" && p.de > 200) out.push({ lvl: "amber", t: `Didelė skola: skolos ir nuosavo kapitalo santykis ${(p.de / 100).toLocaleString("lt-LT", { maximumFractionDigits: 1 })}.` });
    if (typeof p.fcf === "number" && p.fcf < 0 && !(ni.length && ni.every((v) => v < 0))) out.push({ lvl: "amber", t: "Laisvieji pinigų srautai neigiami – veiklai pinigų išleidžia daugiau, nei uždirba." });
  }
  if (typeof p.vol === "number" && p.vol >= 60) out.push({ lvl: "amber", t: `Labai svyruoja: metinis kintamumas ~${Math.round(p.vol)} % (S&P 500 – apie 15–20 %).` });
  if (typeof p.fromHigh === "number" && p.fromHigh <= -50) out.push({ lvl: "amber", t: `Kaina ${pct0(p.fromHigh)} nuo 52 savaičių aukščiausio taško.` });
  return out;
}
function analystLine(r) {
  const an = (PRICES_PF.items[r.s] || {}).an;
  if (!an || !an.n) return "";
  return `Analitikai (${an.n}, Yahoo Finance): sutarimas „${AN_TXT[an.key] || "–"}“${typeof an.up === "number" ? `, vidutinė tikslinė kaina ${pct0(an.up)} nuo dabartinės` : ""}. Tai jų nuomonė, ne faktas.`;
}
function renderNext(a) {
  const el = $("#r-next");
  if (!el) return;
  const rows = a.rows.filter((r) => r.s !== CASH);
  const list = rows.map((r) => ({ r, w: r.value / a.total, c: holdingChecks(r) }));
  const sev = (x) => x.c.filter((c) => c.lvl === "red").length * 3 + x.c.filter((c) => c.lvl === "amber").length;
  const watch = list.filter((x) => sev(x) > 0).sort((x, y) => sev(y) * (0.5 + y.w) - sev(x) * (0.5 + x.w));
  const strong = list.filter((x) => sev(x) === 0 && x.c.some((c) => c.lvl === "green")).sort((x, y) => y.w - x.w);
  const unknown = list.filter((x) => !x.c.length);
  const P = a.pnl, single = rows.filter((r) => /Akcija|Kriptovaliuta|Kita/.test(r.type || "Kita")).sort((x, y) => y.value - x.value)[0];
  const bondShare = a.typeShare("Obligacijos") + a.typeShare("Obligacijų fondas");
  const sec = a.sectors.filter((x) => !/Grynieji|Obligacijos|Auksas|Nežinomas/.test(x.k))[0];
  const port = [];
  if (single && single.value / a.total > 0.25) port.push(`Viena pozicija – <b>${esc(single.n)}</b> – sudaro ${pct(single.value / a.total)} portfelio. Jei ji smarkiai kristų, tai pajustum visame portfelyje.`);
  if (sec && sec.p > 0.4) port.push(`<b>${esc(sec.k)}</b> sudaro ${pct(sec.p)} – portfelis labai priklauso nuo vieno sektoriaus.`);
  if (bondShare < 0.01 && a.typeShare("Akcija") + a.typeShare("ETF") > 0.9) port.push("Beveik visas portfelis – akcijos. Nuosmukio metais svyravimai gali būti dideli; daliai žmonių tai tinka, daliai – ne.");
  const item = (x) => `<li class="nx-item">
      <div class="nx-top">${logoHTML(x.r.s, x.r.n, "#1d3a63", 36)}<div class="nx-name"><b>${esc(x.r.n)}</b><small>${pct(x.w)} portfelio${typeof x.r.pnlPct === "number" ? ` · ${signedPct(x.r.pnlPct)} nuo pirkimo` : ""}</small></div>${isTv(x.r.s) ? `<a class="nx-go" href="${assetUrl(x.r.s)}" aria-label="Atidaryti ${esc(x.r.n)}">${icon("chevron", 18)}</a>` : ""}</div>
      <ul class="nx-flags">${x.c.map((c) => `<li class="nx-${c.lvl}">${esc(c.t)}</li>`).join("")}</ul>
      ${analystLine(x.r) ? `<p class="nx-an">${esc(analystLine(x.r))}</p>` : ""}
    </li>`;
  el.innerHTML = `
    <div class="nx-hero"><span class="nx-ico">${icon("target", 24)}</span><div><h2>Kas toliau?</h2><p>Faktai apie tavo pozicijas ir ekspertų nuomonės vienoje vietoje. Ką daryti – sprendi tu: InvestAI neteikia asmeninių rekomendacijų.</p></div></div>
    ${port.length ? `<section class="nx-sec"><h3>Visas portfelis</h3><ul class="nx-port">${port.map((t) => `<li>${t}</li>`).join("")}</ul></section>` : ""}
    <section class="nx-sec"><h3>Verta pasitikrinti${watch.length ? ` <span class="nx-count">${watch.length}</span>` : ""}</h3>
      ${watch.length ? `<ul class="nx-list">${watch.map(item).join("")}</ul>` : `<p class="muted">Tarp tavo pozicijų neradome nuostolingų, labai prasiskolinusių ar itin smarkiai svyruojančių įmonių.</p>`}</section>
    ${strong.length ? `<section class="nx-sec"><h3>Stiprios pusės</h3><ul class="nx-list">${strong.slice(0, 6).map(item).join("")}</ul></section>` : ""}
    <section class="nx-sec nx-links"><h3>Kur ieškoti toliau</h3>
      <a class="nx-link" href="strategija.html">${icon("strategy", 20)}<span><b>Turi pinigų investuoti?</b><small>Pasirink strategiją – pamatysi, kurias portfelio dalis ji siūlo didinti</small></span>${icon("chevron", 18)}</a>
      <a class="nx-link" href="atranka.html">${icon("screener", 20)}<span><b>Atranka</b><small>Pelningos įmonės, plačios rinkos fondai, sektoriai, kurių dar neturi</small></span>${icon("chevron", 18)}</a>
      <a class="nx-link" href="${"#"}" data-ai-ask="Kurios mano portfelio įmonės dirba nuostolingai ir ką tai reiškia investuotojui?">${icon("ai", 20)}<span><b>Paklausk AI</b><small>„Kurios mano įmonės nuostolingos ir ką tai reiškia?“</small></span>${icon("chevron", 18)}</a>
    </section>
    ${unknown.length ? `<p class="muted small">Be pastabų: ${unknown.slice(0, 8).map((x) => esc(x.r.n)).join(", ")}. Fondams ir kriptovaliutoms įmonių rodikliai netaikomi.</p>` : ""}
    <p class="disclaimer">Duomenys – Yahoo Finance (metinės ataskaitos atnaujinamos kas savaitę). Nuostolinga įmonė nebūtinai bloga investicija, o pelninga – nebūtinai gera: tai tik faktai, į kuriuos verta atsižvelgti.</p>`;
  el.querySelectorAll("[data-ai-ask]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); if (window.openAI) window.openAI(b.dataset.aiAsk); else location.href = "strategija.html"; }));
}

/* ---------- Skilčių antraščių ikonos ---------- */
const HEAD_ICONS = [[/žemėlapis/i, "grid"], [/^Svarbiausia/i, "digest"], [/uždirbo/i, "markets"], [/Diversifikacijos/i, "target"], [/Tavo savaitė/i, "calendar"], [/Tavo pozicijos/i, "portfolio"], [/Palyginimas/i, "screener"], [/nuosmukį/i, "strategy"], [/taisyklės/i, "about"], [/Kas būtų/i, "tools"], [/investuoti\?/i, "upload"], [/aktyvai šiandien/i, "news"], [/^Duomenys/i, "archive"], [/Redaguoti/i, "tools"]];
const FACT_ICONS = [[/uždirbo|prarado|rezultat/i, "markets"], [/paaugo|krito/i, "strategy"], [/Didžiausia pozicija/i, "portfolio"], [/sektoriaus|sektori/i, "grid"], [/pasaulio rink/i, "screener"], [/paaiškinim/i, "news"], [/Kripto/i, "asset"], [/obligacij|grynų|grynieji/i, "premium"], [/valiut|dolerio|USD/i, "tools"]];
function decorateHeads() {
  document.querySelectorAll("#r-facts > li").forEach((li) => {
    if (li.querySelector(".f-ico")) return;
    const hit = FACT_ICONS.find(([re]) => re.test(li.textContent));
    li.innerHTML = `<span class="f-ico">${icon(hit ? hit[1] : "digest", 18)}</span><span class="f-txt">${li.innerHTML}</span>`;
  });
  document.querySelectorAll("#v-result h2").forEach((h) => {
    if (h.querySelector(".h-ico") || h.closest(".rai-head, .al-head, .div-hero")) return;
    const hit = HEAD_ICONS.find(([re]) => re.test(h.textContent.trim()));
    if (hit) h.insertAdjacentHTML("afterbegin", `<span class="h-ico">${icon(hit[1], 18)}</span>`);
  });
}

/* ---------- Mokesčių ataskaita VMI (iš brokerio CSV sandorių, FIFO) ---------- */
const TAX_VDU12 = 27745.8;
function txEur(amount, cur, fx) {
  if (!amount) return { v: 0, approx: false };
  if (!cur || cur === "EUR") return { v: amount, approx: false };
  if (fx && fx > 0.3 && fx < 3 && cur === "USD") return { v: amount / fx, approx: false };
  return { v: amount * (TO_EUR[cur === "GBX" ? "GBp" : cur] || 1), approx: true };
}
function taxReport(txs) {
  const lots = new Map(), pendSplit = new Map(), years = {};
  const Y = (d) => (years[d.slice(0, 4)] ||= { sales: [], divs: [], approx: false });
  for (const t of txs.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))) {
    const key = (t.i || t.t || t.n).toUpperCase(), name = t.n || t.t || t.i;
    if (!lots.has(key)) lots.set(key, []);
    const L = lots.get(key);
    const held = L.reduce((s, l) => s + l.q, 0);
    if (t.k === "buy" && t.q > 0) { const e = txEur(t.a, t.c, t.fx); L.push({ q: t.q, cost: e.v, d: t.d, approx: e.approx }); }
    else if (t.k === "sell" && t.q > 0) {
      const e = txEur(t.a, t.c, t.fx);
      let left = t.q, cost = 0, approx = e.approx, oldest = null, missing = 0;
      while (left > 1e-9 && L.length) {
        const l = L[0], take = Math.min(l.q, left), part = l.cost * (take / l.q);
        cost += part; oldest = oldest || l.d; approx = approx || l.approx;
        l.cost -= part; l.q -= take; left -= take;
        if (l.q <= 1e-9) L.shift();
      }
      if (left > 1e-6) missing = left;
      const y = Y(t.d);
      y.sales.push({ d: t.d, n: name, q: t.q, proceeds: e.v, cost, gain: e.v - cost, approx, missing, long: oldest && (new Date(t.d) - new Date(oldest)) / 864e5 >= 5 * 365 });
      if (approx) y.approx = true;
    } else if (t.k === "split-") pendSplit.set(key, t.q || held);
    else if (t.k === "split+" && held > 0) {
      const old = pendSplit.get(key);
      const factor = old ? t.q / old : (held + t.q) / held;
      if (factor > 0 && isFinite(factor)) L.forEach((l) => (l.q *= factor));
      pendSplit.delete(key);
    } else if (t.k === "split+" && pendSplit.has(key)) {
      // T212: „close“ jau išėmė senas akcijas – grąžiname tuos pačius lotus su nauju kiekiu
      pendSplit.delete(key);
    } else if (t.k === "div" && t.a > 0) {
      const net = txEur(t.a, t.c, t.fx), w = t.w ? txEur(t.w, t.wc || t.pc || "USD", t.fx) : { v: 0, approx: false };
      const y = Y(t.d);
      y.divs.push({ d: t.d, n: name, net: net.v, wht: w.v, gross: net.v + w.v });
      if (net.approx || w.approx) y.approx = true;
    }
  }
  return years;
}
function renderTax() {
  const el = $("#r-tax");
  if (!el) return;
  const prem = (() => { try { return !!localStorage.getItem("investai.premium.v1"); } catch { return false; } })();
  const txs = state.tx || [];
  const head = `<div class="wk-head"><div><h2><span class="h-ico">${icon("report", 18)}</span>Mokesčių ataskaita (VMI)</h2><p class="muted small">Realizuotas pelnas pagal FIFO ir gauti dividendai eurais – deklaracijai GPM311</p></div>${prem ? "" : `<span class="pmx-badge" style="font-size:12px">${icon("gem", 12)}Premium</span>`}</div>`;
  if (!txs.length) {
    el.innerHTML = head + `<p class="muted" style="margin:6px 0 12px">Ataskaitai reikia sandorių istorijos. Importuok brokerio CSV su <b>visais</b> sandoriais nuo pirmojo pirkimo (Trading 212, Revolut ar Lightyear).</p><label class="btn" for="csv2">Importuoti CSV</label>`;
    return;
  }
  const years = taxReport(txs);
  const ys = Object.keys(years).filter((y) => years[y].sales.length || years[y].divs.length).sort().reverse();
  if (!ys.length) { el.innerHTML = head + `<p class="muted">Importuotame faile nėra pardavimų ar dividendų.</p>`; return; }
  const cur = new Date().getFullYear();
  let sel = String(ys.includes(String(cur - 1)) ? cur - 1 : ys[0]);
  const e2 = (v) => `${v.toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const draw = () => {
    const y = years[sel];
    const gains = y.sales.reduce((s, x) => s + Math.max(0, x.gain), 0), losses = y.sales.reduce((s, x) => s + Math.min(0, x.gain), 0);
    const net = gains + losses, taxable = Math.max(0, net - 500), in15 = Math.min(taxable, TAX_VDU12);
    const tax = in15 * 0.15;
    const dG = y.divs.reduce((s, x) => s + x.gross, 0), dW = y.divs.reduce((s, x) => s + x.wht, 0);
    const dTax = Math.max(0, dG * 0.15 - Math.min(dW, dG * 0.15));
    const missing = y.sales.some((x) => x.missing > 0);
    const body = `
      <div class="seg tax-years" role="group" aria-label="Metai">${ys.map((x) => `<button type="button" data-y="${x}" aria-pressed="${x === sel}">${x} m.</button>`).join("")}</div>
      <div class="tax-grid">
        <div class="tax-box"><h3>Akcijų ir fondų pardavimas</h3>
          <dl><div><dt>Pardavimų</dt><dd>${y.sales.length}</dd></div><div><dt>Pelnas</dt><dd class="up">${e2(gains)}</dd></div><div><dt>Nuostoliai</dt><dd class="down">${e2(losses)}</dd></div><div><dt>Grynasis rezultatas</dt><dd><b>${e2(net)}</b></dd></div><div><dt>Neapmokestinama dalis</dt><dd>− 500,00 €</dd></div><div class="tax-sum"><dt>Apmokestinama suma</dt><dd><b>${e2(taxable)}</b></dd></div><div class="tax-sum"><dt>Apytikslis GPM (15 %)</dt><dd><b>${e2(tax)}</b></dd></div></dl>
          ${taxable > TAX_VDU12 ? `<p class="muted small">Suma viršija 12 VDU (${e2(TAX_VDU12)}) – didesnei daliai taikomi 20/25/32 % tarifai. Apskaičiuok <a href="irankiai.html#mokesciai">mokesčių skaičiuoklėje</a>.</p>` : ""}
        </div>
        <div class="tax-box"><h3>Dividendai</h3>
          <dl><div><dt>Išmokų</dt><dd>${y.divs.length}</dd></div><div><dt>Bruto (prieš mokesčius)</dt><dd>${e2(dG)}</dd></div><div><dt>Išskaičiuota užsienyje</dt><dd>${e2(dW)}</dd></div><div class="tax-sum"><dt>Primokėti Lietuvoje (apytiksliai)</dt><dd><b>${e2(dTax)}</b></dd></div></dl>
          <p class="muted small">Lietuvoje dividendams – 15 %; užsienyje sumokėtas mokestis įskaitomas (ne daugiau nei 15 %).</p>
        </div>
      </div>
      ${prem ? `<details class="tax-list"><summary>Visi ${y.sales.length} pardavimai ir ${y.divs.length} dividendų išmokos</summary>
        <table><thead><tr><th>Data</th><th>Aktyvas</th><th>Pajamos</th><th>Savikaina</th><th>Rezultatas</th></tr></thead><tbody>${y.sales.map((x) => `<tr><td>${x.d}</td><td>${esc(x.n)}${x.long ? " <small>(≥5 m.)</small>" : ""}${x.missing ? " <small class=\"down\">(trūksta pirkimų)</small>" : ""}</td><td>${e2(x.proceeds)}</td><td>${e2(x.cost)}</td><td class="${x.gain >= 0 ? "up" : "down"}">${e2(x.gain)}</td></tr>`).join("")}</tbody></table>
        ${y.divs.length ? `<table><thead><tr><th>Data</th><th>Dividendai</th><th>Bruto</th><th>Užsienio mok.</th><th>Gauta</th></tr></thead><tbody>${y.divs.map((x) => `<tr><td>${x.d}</td><td>${esc(x.n)}</td><td>${e2(x.gross)}</td><td>${e2(x.wht)}</td><td>${e2(x.net)}</td></tr>`).join("")}</tbody></table>` : ""}
        <button type="button" class="btn" id="tax-csv">Atsisiųsti CSV</button></details>`
        : `<div class="tax-lock"><p><b>Premium:</b> kiekvieno pardavimo ir dividendo detalės bei CSV failas buhalterei ar deklaracijai.</p><a class="btn" href="premium.html">${icon("gem", 16)} Atrakinti</a></div>`}
      ${missing ? `<p class="tax-warn">Kai kuriems pardavimams faile trūksta ankstesnių pirkimų – importuok istoriją nuo pat sąskaitos atidarymo, kitaip savikaina bus per maža.</p>` : ""}
      ${y.approx ? `<p class="tax-warn">Kai kurios sumos ne eurais perskaičiuotos pagal dabartinį kursą, todėl yra apytikslės. VMI reikalauja kurso sandorio dieną.</p>` : ""}
      <p class="disclaimer">Skaičiuojama pagal ${esc(state.txBroker || "brokerio")} CSV, FIFO metodu, įskaitant brokerio mokesčius, jei jie įtraukti į sumas. Akcijoms, laikytoms ≥ 5 m., gali galioti kitos taisyklės. Tai pagalbinis skaičiavimas, ne mokesčių konsultacija – galutinai pasitikrink VMI svetainėje arba su buhalteriu. Deklaracija – GPM311, iki gegužės 1 d.</p>`;
    el.innerHTML = head + body;
    el.querySelectorAll(".tax-years button").forEach((b) => b.addEventListener("click", () => { sel = b.dataset.y; draw(); }));
    const dl = $("#tax-csv");
    if (dl) dl.addEventListener("click", () => {
      const rows = [["Tipas", "Data", "Aktyvas", "Pajamos EUR", "Savikaina EUR", "Rezultatas EUR", "Užsienio mokestis EUR"]]
        .concat(y.sales.map((x) => ["Pardavimas", x.d, x.n, x.proceeds.toFixed(2), x.cost.toFixed(2), x.gain.toFixed(2), ""]))
        .concat(y.divs.map((x) => ["Dividendai", x.d, x.n, x.gross.toFixed(2), "", "", x.wht.toFixed(2)]));
      const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `investai-mokesciai-${sel}.csv`; a.click();
    });
  };
  draw();
}

/* ---------- Tikri rezultatai: kasdienis portfelio įrašas ir palyginimas su VWCE ---------- */
const SNAP_KEY = "investai.pf.snap.v1", BENCH = "XETR:VWCE";
function loadSnaps() { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || "[]"); } catch { return []; } }
function recordSnap(a) {
  if (isDemo || !a.total) return loadSnaps();
  const P = PRICES_PF.items || {};
  const day = Object.values(P).map((x) => x.date).filter(Boolean).sort().pop() || new Date().toISOString().slice(0, 10);
  const px = {}, w = {};
  a.rows.forEach((r) => { w[r.s] = Math.round((r.value / a.total) * 1e5) / 1e5; if (P[r.s] && P[r.s].price) px[r.s] = P[r.s].price; });
  const b = P[BENCH] ? P[BENCH].price : null;
  let snaps = loadSnaps();
  if (snaps.length && snaps[snaps.length - 1].d === day) snaps.pop(); // tos pačios dienos įrašą perskaičiuojame
  const prev = snaps[snaps.length - 1];
  let idx = 100;
  if (prev) {
    let ret = 0;
    for (const [sym, wt] of Object.entries(prev.w || {})) if (prev.px[sym] && px[sym]) ret += wt * (px[sym] / prev.px[sym] - 1);
    idx = prev.idx * (1 + ret);
  }
  snaps.push({ d: day, v: Math.round(a.total * 100) / 100, idx: Math.round(idx * 1e4) / 1e4, b, px, w });
  snaps = snaps.slice(-400);
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch {}
  return snaps;
}
function renderReal(a) {
  const el = $("#r-real");
  if (!el) return;
  if (isDemo) { el.hidden = true; return; }
  const snaps = recordSnap(a);
  el.hidden = false;
  const first = snaps[0];
  const head = `<div class="wk-head"><div><h2>Tikri rezultatai</h2><p class="muted small">Tavo portfelio pokytis dėl kainų (be įnašų ir išėmimų), palyginti su pasaulio akcijomis (VWCE)</p></div></div>`;
  if (snaps.length < 2) {
    el.innerHTML = head + `<div class="real-empty"><span class="real-dot"></span><p>Pradėjome sekti <b>${fmtShort(first.d)}</b>. Kiekvieną dieną, kai atidarysi šį puslapį, išsaugosime tavo portfelio vertę – grafikas atsiras jau po kitos prekybos dienos.</p></div>`;
    return;
  }
  const base = snaps[0], last = snaps[snaps.length - 1];
  const me = snaps.map((x) => (x.idx / base.idx - 1) * 100);
  const bs = base.b ? snaps.map((x) => (x.b && base.b ? (x.b / base.b - 1) * 100 : null)) : null;
  const okB = bs && bs.every((v) => v !== null);
  const meT = me[me.length - 1], bT = okB ? bs[bs.length - 1] : null;
  const days = Math.round((new Date(last.d) - new Date(base.d)) / 864e5);
  const series = [{ values: me, color: cssVar("--amber") || "#4d8dff", name: "Tavo portfelis", width: 2.6 }];
  if (okB) series.push({ values: bs, color: "#a77bff", name: "Pasaulio akcijos (VWCE)", dash: true });
  const lab = [fmtShort(base.d), fmtShort(snaps[Math.floor(snaps.length / 2)].d), fmtShort(last.d)];
  el.innerHTML = head + `<div class="real-stats"><div><small>Tavo portfelis</small><b class="${meT >= 0 ? "up" : "down"}">${fmtPct(meT)}</b></div>${okB ? `<div><small>VWCE</small><b class="${bT >= 0 ? "up" : "down"}">${fmtPct(bT)}</b></div><div><small>Skirtumas</small><b class="${meT - bT >= 0 ? "up" : "down"}">${meT - bT >= 0 ? "+" : "−"}${Math.abs(meT - bT).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} p. p.</b></div>` : ""}</div>
    ${multiLineSVG(series, { h: 200, labels: lab, fmt: (v) => `${v.toFixed(1)} %` })}
    <p class="muted small" style="margin:8px 0 0">Sekama nuo ${fmtShort(base.d)} (${days} d., ${snaps.length} įrašai). Vertė įrašoma, kai atidarai portfelio puslapį – kuo dažniau užsuksi, tuo tikslesnis grafikas. Duomenys saugomi tik šioje naršyklėje.</p>`;
}

/* ---------- Tavo savaitė: judėjimai ir artimiausi įvykiai ---------- */
function renderWeek(a) {
  const el = $("#r-week");
  if (!el) return;
  const P = PRICES_PF.items || {};
  const rows = a.rows.filter((r) => r.s !== CASH && P[r.s]);
  if (!rows.length) { el.hidden = true; return; }
  el.hidden = false;
  const today = new Date().toISOString().slice(0, 10), lim = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  // Savaitės poveikis eurais: pozicijos vertė × savaitės pokytis
  const mv = rows.filter((r) => typeof P[r.s].w1 === "number").map((r) => { const w = P[r.s].w1; return { r, w, eur: r.value - r.value / (1 + w / 100) }; });
  const weekEur = mv.reduce((t, x) => t + x.eur, 0), weekBase = mv.reduce((t, x) => t + (x.r.value - x.eur), 0);
  const top = mv.slice().sort((x, y) => Math.abs(y.eur) - Math.abs(x.eur)).slice(0, 4);
  const ev = [];
  rows.forEach((r) => {
    const p = P[r.s];
    if (p.ed && p.ed >= today && p.ed <= lim) ev.push({ d: p.ed, r, t: "Ataskaita", k: "ed" });
    if (p.xd && p.xd >= today && p.xd <= lim) ev.push({ d: p.xd, r, t: "Dividendų nukirpimas", k: "xd" });
  });
  ev.sort((x, y) => (x.d < y.d ? -1 : 1));
  const pc = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("lt-LT", { maximumFractionDigits: 1 })}\u00a0%`;
  el.innerHTML = `<div class="wk-head"><div><h2>Tavo savaitė</h2><p class="muted small">Kaip per 5 prekybos dienas pasikeitė tavo pozicijos</p></div>
      ${weekBase > 0 ? `<div class="wk-sum ${weekEur >= 0 ? "up" : "down"}"><b>${weekEur >= 0 ? "+" : "−"}${money(Math.abs(weekEur))}</b><span>${pc((weekEur / weekBase) * 100)}</span></div>` : ""}</div>
    <ul class="grp wk-list">${top.map((x) => rowHTML({ href: isTv(x.r.s) ? assetUrl(x.r.s) : "", ava: logoHTML(x.r.s, x.r.n, "#1d3a63", 40), title: esc(x.r.n), sub: `${pc(x.w)} per savaitę`, val: `<span class="${x.eur >= 0 ? "up" : "down"}">${x.eur >= 0 ? "+" : "−"}${money(Math.abs(x.eur))}</span>` })).join("")}</ul>
    ${ev.length ? `<h3 class="wk-h3">Artimiausi įvykiai</h3><ul class="grp">${ev.slice(0, 5).map((e) => { const [, m, d] = e.d.split("-").map(Number); return `<li class="row"><div class="row-main"><span class="row-date${daysUntil(e.d) <= 3 ? " soon" : ""}"><b>${d}</b>${MONTHS[m - 1].slice(0, 3)}.</span><span class="row-txt"><b>${esc(e.r.n)}</b><small>${e.t} · ${whenLabel(e.d)}</small></span></div></li>`; }).join("")}</ul>` : ""}`;
}

/* ---------- Dividendai ---------- */
const moneyD = (v) => { const d = Math.abs(v) < 100 ? 2 : 0; return new Intl.NumberFormat("lt-LT", { style: "currency", currency: state.currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(v); };
const MON_SHORT = ["Sau", "Vas", "Kov", "Bal", "Geg", "Bir", "Lie", "Rgp", "Rgs", "Spa", "Lap", "Gru"];
const MON_LONG = ["Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis", "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis"];
const freqTxt = (n) => (n >= 11 ? "Kas mėnesį" : n >= 4 ? "Kas ketvirtį" : n >= 2 ? "Du kartus per metus" : n === 1 ? "Kartą per metus" : "");
const pct1 = (v) => `${v.toLocaleString("lt-LT", { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 })} %`;
function divInfo(r) {
  const p = PRICES_PF.items[r.s];
  if (!p || !p.price) return null;
  const y = p.dr > 0 ? (p.dr / p.price) * 100 : p.dy12 > 0 ? p.dy12 : null;
  if (!(y > 0 && y < 25)) return null;
  const annual = (r.value * y) / 100;
  const dv = p.dv || [];
  const sum = dv.reduce((t, x) => t + x[1], 0);
  const months = Array(12).fill(0);
  if (sum) dv.forEach(([d, amt]) => (months[+d.slice(5, 7) - 1] += (annual * amt) / sum));
  const today = new Date().toISOString().slice(0, 10);
  const next = p.xd && p.xd >= today ? p.xd : null;
  const last = dv[dv.length - 1];
  return { y, annual, months, known: sum > 0, freq: freqTxt(dv.length), next, nextAmt: next && last ? (r.value * last[1]) / p.price : null };
}
let DIV_MONTHS = [];
function divTip(m) {
  const el = $("#div-tip");
  if (!el || !DIV_MONTHS.length) return;
  document.querySelectorAll(".div-bar").forEach((b) => b.classList.toggle("sel", +b.dataset.m === m));
  el.innerHTML = `${MON_LONG[m]}: <b>${DIV_MONTHS[m] ? `~${moneyD(DIV_MONTHS[m])}` : "išmokų nebuvo"}</b>`;
}
function renderDivs(a) {
  const el = $("#r-div");
  if (!el) return;
  const rows = a.rows.filter((r) => r.s !== CASH);
  const list = rows.map((r) => ({ r, d: divInfo(r) })).filter((x) => x.d).sort((x, y) => y.d.annual - x.d.annual);
  const payers = new Set(list.map((x) => x.r.s));
  const none = rows.filter((r) => !payers.has(r.s));
  const recv = (state.divs || []).filter((x) => x.eur > 0);
  const total = list.reduce((t, x) => t + x.d.annual, 0);
  DIV_MONTHS = Array(12).fill(0);
  list.forEach((x) => x.d.months.forEach((v, i) => (DIV_MONTHS[i] += v)));
  const unplaced = list.filter((x) => !x.d.known).reduce((t, x) => t + x.d.annual, 0);
  const max = Math.max(...DIV_MONTHS, 0.01);
  const nowM = new Date().getMonth();
  const upcoming = list.filter((x) => x.d.next).sort((x, y) => (x.d.next < y.d.next ? -1 : 1)).slice(0, 6);
  const ava = (r) => logoHTML(r.s, r.n, "#1d3a63", 40);
  let html = "";
  if (list.length) {
    const bestM = DIV_MONTHS.indexOf(Math.max(...DIV_MONTHS));
    html += `<div class="div-hero">
      <p class="div-label">Dividendai per metus</p>
      <p class="div-num">~${moneyD(total)}</p>
      <p class="div-sub">Pajamingumas ${pct1((total / a.total) * 100)} · po 15 % GPM ~${moneyD(total * 0.85)}</p>
    </div>
    ${DIV_MONTHS.some((v) => v > 0) ? `<div class="div-bars" aria-label="Dividendai pagal mėnesius">${DIV_MONTHS.map((v, i) => `<button type="button" class="div-bar${i === nowM ? " now" : ""}${i === bestM ? " sel" : ""}" data-m="${i}" aria-label="${MON_LONG[i]}: ${v ? `apie ${moneyD(v)}` : "išmokų nebuvo"}"><span class="div-col"><span style="height:${Math.max(v ? 4 : 0, (v / max) * 100)}%"></span></span><small>${MON_SHORT[i]}</small></button>`).join("")}</div>
    <p class="div-tip" id="div-tip">${MON_LONG[bestM]}: <b>~${moneyD(DIV_MONTHS[bestM])}</b></p>` : ""}
    <p class="muted small">Skaičiuojame pagal praėjusių 12 mėn. išmokas ir dabartinę pozicijų vertę; mėnuo – dividendų nukirpimo (ex) data, pinigai paprastai ateina po 1–4 savaičių.${unplaced > 0 ? ` ${moneyD(unplaced)} per metus neturime išmokų datų.` : ""}</p>`;
    if (upcoming.length) html += `<div class="grp-wrap"><div class="grp-head"><h2>Artimiausi nukirpimai</h2></div><ul class="grp">${upcoming.map((x) => {
      const [, m, d] = x.d.next.split("-").map(Number);
      return `<li class="row"><div class="row-main"><span class="row-date${daysUntil(x.d.next) <= 7 ? " soon" : ""}"><b>${d}</b>${MONTHS[m - 1].slice(0, 3)}.</span><span class="row-txt"><b>${esc(x.r.n)}</b><small>${whenLabel(x.d.next)} · reikia turėti iki šios dienos</small></span><span class="row-val">${x.d.nextAmt ? `~${moneyD(x.d.nextAmt)}` : ""}</span></div></li>`;
    }).join("")}</ul></div>`;
    html += `<div class="grp-wrap"><div class="grp-head"><h2>Moka dividendus</h2><span class="grp-note">${list.length} iš ${rows.length}</span></div><ul class="grp">${list.map((x) => rowHTML({ href: isTv(x.r.s) ? assetUrl(x.r.s) : "", ava: ava(x.r), title: esc(x.r.n), sub: [x.d.freq, pct1(x.d.y)].filter(Boolean).join(" · "), val: `~${moneyD(x.d.annual)}<span class="muted">per metus</span>` })).join("")}</ul></div>`;
  } else {
    html += `<div class="div-hero"><p class="div-label">Dividendai</p><p class="div-sub">Tavo portfelyje neradome pozicijų, kurios per paskutinius 12 mėn. mokėjo dividendus.</p></div>`;
  }
  if (none.length) html += `<p class="muted small">Nemoka dividendų: ${none.slice(0, 8).map((r) => esc(r.n)).join(", ")}${none.length > 8 ? ` ir dar ${none.length - 8}` : ""}. Kaupiamieji fondai (ACC) dividendus reinvestuoja patys, todėl tavo sąskaitos jie nepasiekia.</p>`;
  if (recv.length) {
    const yAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const last12 = recv.filter((x) => x.d >= yAgo).reduce((t, x) => t + x.eur, 0);
    const byYear = new Map();
    recv.forEach((x) => byYear.set(x.d.slice(0, 4), (byYear.get(x.d.slice(0, 4)) || 0) + x.eur));
    const recent = recv.slice(-5).reverse();
    html += `<div class="grp-wrap"><div class="grp-head"><h2>Jau gauta</h2><span class="grp-note">pagal importuotą failą</span></div><ul class="grp">
      <li class="row"><div class="row-main"><span class="row-txt"><b>Per paskutinius 12 mėn.</b></span><span class="row-val">${moneyD(last12)}</span></div></li>
      ${[...byYear].sort((x, y) => (x[0] < y[0] ? 1 : -1)).map(([yr, v]) => `<li class="row"><div class="row-main"><span class="row-txt"><b>${yr} m.</b></span><span class="row-val">${moneyD(v)}</span></div></li>`).join("")}
      ${recent.map((x) => `<li class="row"><div class="row-main"><span class="row-txt"><b>${esc(x.n || "Dividendai")}</b><small>${fmtShort(x.d)}</small></span><span class="row-val up">+${moneyD(x.eur)}</span></div></li>`).join("")}
    </ul></div>`;
  }
  html += `<p class="disclaimer">Įmonės ir fondai dividendus gali keisti ar nutraukti, todėl tai ne prognozė. Lietuvoje dividendams taikomas 15 % GPM; užsienyje išskaičiuotas mokestis gali būti įskaitytas. Daugiau – <a href="irankiai.html#mokesciai">mokesčių skaičiuoklėje</a>.</p>`;
  el.innerHTML = html;
}

/* ---------- Failai, vilkimas, įklijavimas ---------- */
async function handleFiles(files, fromView) {
  if (!files || !files.length) return;
  files = [...files]; // FileList išvaloma, kai įvesties laukas nustatomas iš naujo
  const csv = [...files].find(isCSV);
  if (csv) return handleCSV(csv);
  const progressEl = fromView === "review" ? $("#progress2") : $("#progress");
  if (fromView === "result") { show("start"); }
  if (fromView !== "review") draft = [];
  try {
    const pe = fromView === "review" ? progressEl : $("#progress");
    let results = null, fellBack = "";
    if (typeof PFAI !== "undefined" && [...files].some((f) => f.type.startsWith("image/")) && (await PFAI.hasAI()) && (await PFAI.chooseMode()) === "ai") {
      try { results = await PFAI.recognize(files, pe); }
      catch (e) { console.warn(e); fellBack = e.message || "AI nepavyko"; }
    }
    if (!results) results = await recognizeFiles(files, pe);
    const info = mergeIntoDraft(results);
    if (fellBack) info.fellBack = fellBack;
    if (results[0] && results[0].ai) info.ai = true;
    renderReview(info);
    if (fellBack) { const n = $("#review-note"); n.hidden = false; n.innerHTML = `AI atpažinti nepavyko (${esc(fellBack)}), todėl nuotrauką perskaitėme naršyklėje – atidžiai patikrink sumas. ${n.innerHTML}`; }
  } catch (e) {
    console.error(e);
    progressEl.hidden = false;
    progressEl.querySelector("p").textContent = `${(e.message || "Atpažinti nepavyko").replace(/[.]+$/, "")}. Pabandyk dar kartą arba suvesk pozicijas ranka.`;
  }
}
function setupInputs() {
  $("#file").addEventListener("change", (e) => { handleFiles(e.target.files, "start"); e.target.value = ""; });
  $("#file2").addEventListener("change", (e) => { handleFiles(e.target.files, "review"); e.target.value = ""; });
  $("#file3").addEventListener("change", (e) => { handleFiles(e.target.files, "result"); e.target.value = ""; });
  ["#csv", "#csv2"].forEach((id) => $(id) && $(id).addEventListener("change", (e) => { if (e.target.files[0]) handleCSV(e.target.files[0]); e.target.value = ""; }));
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files, "start"));
  document.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const view = !$("#v-review").hidden ? "review" : !$("#v-result").hidden ? "result" : "start";
    handleFiles(files, view);
  });
  $("#manual").addEventListener("click", () => { draft = []; renderReview(); });
  const ocrBtn = $("#ocr-reset");
  try { if (ocrBtn && localStorage.getItem("investai.pf.ocr")) ocrBtn.hidden = false; } catch {}
  if (ocrBtn) ocrBtn.addEventListener("click", () => { try { localStorage.removeItem("investai.pf.ocr"); } catch {} ocrBtn.hidden = true; ocrBtn.insertAdjacentHTML("afterend", '<span class="muted small"> Kitą kartą paklausime iš naujo.</span>'); });
  $("#review-add").addEventListener("click", () => { draft.push({ s: null, n: "", value: "", src: "", unknown: false }); renderReview(); const ins = $("#review-list").querySelectorAll("li:last-child input"); ins[0] && ins[0].focus(); });
  $("#review-done").addEventListener("click", finishReview);
  $("#review-cancel").addEventListener("click", () => { draft = []; pendingDivs = null; state.holdings.length ? renderResult() : show("start"); });
  document.querySelectorAll(".seg button[data-dim]").forEach((b) => b.addEventListener("click", () => { dim = b.dataset.dim; renderDim(); }));
  document.querySelectorAll("#tm-mode [data-tm]").forEach((b) => b.addEventListener("click", () => { tmMode = b.dataset.tm; renderTreemap(); }));
  document.querySelectorAll(".ptabs [data-ptab]").forEach((b) => b.addEventListener("click", () => { showPTab(b.dataset.ptab); if (b.dataset.ptab === "overview") fitTreemaps($("#r-tm")); }));
  $("#r-strip").addEventListener("click", (e) => {
    if (e.target.closest(".drill-x")) { $("#r-drill").hidden = true; document.querySelectorAll("#r-strip .sel").forEach((x) => x.classList.remove("sel")); return; }
    const el = e.target.closest("[data-k]"); if (el && el.dataset.k !== "Kiti" && !e.target.closest(".drill")) drillDown(el.dataset.k);
  });

  $("#r-div").addEventListener("click", (e) => { const b = e.target.closest(".div-bar"); if (b) divTip(+b.dataset.m); });
  $("#share-btn").addEventListener("click", () => shareCard().catch((e) => { console.error(e); alert("Nepavyko sukurti paveikslėlio."); }));
  document.querySelectorAll(".seg button[data-cmp]").forEach((b) => b.addEventListener("click", () => { cmpDim = b.dataset.cmp; renderCompare(analyze(state.holdings)); }));

  // Pridėti poziciją analizės vaizde
  let addPicked = null;
  picker($("#add-q"), (s) => (addPicked = s));
  $("#add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const s = addPicked || resolveTyped($("#add-q").value);
    const v = Number($("#add-val").value);
    if (!s) return flag($("#add-q"), "Pasirink aktyvą iš sąrašo");
    if (!(v > 0)) return flag($("#add-val"), "Įvesk sumą");
    const ex = state.holdings.find((h) => h.s === s);
    if (ex) ex.value += v; else state.holdings.push({ s, value: v, ...(findAsset(s) || s === CASH ? {} : { n: ticker(s) }) });
    $("#add-q").value = ""; $("#add-val").value = ""; addPicked = null;
    commit();
    showPTab("positions");
    $("#d-positions").open = true;
  });

  // Kas būtų, jei
  let wiPicked = null;
  picker($("#wi-q"), (s) => (wiPicked = s));
  $("#wi-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const s = wiPicked || resolveTyped($("#wi-q").value);
    const delta = Number($("#wi-val").value);
    if (!s) return flag($("#wi-q"), "Pasirink aktyvą");
    if (!delta) return flag($("#wi-val"), "Įvesk sumą, pvz., 500 arba -300");
    const after = state.holdings.map((h) => ({ ...h }));
    const ex = after.find((h) => h.s === s);
    if (ex) ex.value = Math.max(0, ex.value + delta); else if (delta > 0) after.push({ s, value: delta });
    const A = analyze(state.holdings), B = analyze(after);
    const m = meta(ex || { s });
    const share = (an, key, k) => ((key === "byAsset" ? an.byAsset.find((x) => x.s === s) : an[key].find((x) => x.k === k)) || { p: 0 }).p;
    const rows = [[m.n, "byAsset"], [`Sektorius: ${m.sector}`, "bySector", m.sector], [`Šalis: ${m.country}`, "byCountry", m.country]];
    const cA = checkRules(A, state.rules), cB = checkRules(B, state.rules);
    const changed = cB.filter((c, i) => cA[i] && c.ok !== cA[i].ok);
    $("#wi-out").innerHTML = `<div class="card" style="box-shadow:none;background:var(--mist)">
      <p style="margin:0"><b>${delta > 0 ? "Pridėjus" : "Sumažinus"} ${money(Math.abs(delta))}</b> – portfelis būtų ${money(B.total)}.</p>
      <table class="pf-table"><thead><tr><th></th><th class="num">Dabar</th><th class="num">Po pokyčio</th></tr></thead>
      <tbody>${rows.map(([label, key, k]) => { const x = share(A, key, k), y = share(B, key, k); return `<tr><td>${esc(label)}</td><td class="num">${pct(x)}</td><td class="num"><b>${pct(y)}</b></td></tr>`; }).join("")}</tbody></table>
      ${cB.length ? (changed.length ? `<ul class="checks" style="margin-top:12px">${changed.map((c) => `<li class="${c.ok ? "ok" : "warn"}"><b>${c.ok ? "Pradėtų atitikti" : "Nebeatitiktų"}:</b> ${esc(c.r.label.toLowerCase())} ${c.lim} %</li>`).join("")}</ul>` : `<p class="muted small" style="margin:12px 0 0">Tavo taisyklių atitiktis nepasikeistų.</p>`) : `<p class="muted small" style="margin:12px 0 0">Nustatyk taisykles skiltyje „Mano taisyklės“, kad matytum, kaip pokytis jas paveiktų.</p>`}
    </div>`;
  });

  // Duomenys
  $("#export").addEventListener("click", () => backupDownload());
  $("#import").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (isCSV(f)) { handleCSV(f); e.target.value = ""; return; }
    try {
      const d = JSON.parse(await f.text());
      const pf = d.version >= 2 && d.portfolio ? d.portfolio : d;
      if (!Array.isArray(pf.holdings)) throw new Error();
      if (state.holdings.length && !isDemo && !confirm(`Atkurti kopiją${d.exported ? ` (${new Date(d.exported).toLocaleDateString("lt-LT")})` : ""}? Dabartinis portfelis šioje naršyklėje bus pakeistas.`)) { e.target.value = ""; return; }
      isDemo = false;
      state = {
        holdings: pf.holdings.filter((h) => h && typeof h.s === "string" && (h.s === CASH || SYMBOL_RE.test(h.s) || /^X:[A-Z0-9-]{1,40}$/.test(h.s))).map((h) => ({ ...h, value: Math.max(0, Number(h.value) || 0) })),
        rules: pf.rules && typeof pf.rules === "object" ? pf.rules : {},
        currency: pf.currency === "USD" ? "USD" : "EUR",
        divs: Array.isArray(pf.divs) ? pf.divs.filter((x) => x && typeof x.d === "string" && Number.isFinite(x.eur)) : [],
        tx: Array.isArray(pf.tx) ? pf.tx.filter((x) => x && typeof x.d === "string") : [],
        txBroker: typeof pf.txBroker === "string" ? pf.txBroker : "",
      };
      // Kiti nustatymai (istorija, stebimi, įspėjimai, profilis)
      if (d.extra && typeof d.extra === "object") for (const [k, v] of Object.entries(d.extra)) if (BACKUP_KEYS.includes(k) && typeof v === "string") { try { localStorage.setItem(k, v); } catch {} }
      try { localStorage.setItem(BK_KEY, JSON.stringify({ at: new Date().toISOString() })); } catch {}
      $("#rule-inputs").dataset.ready = "";
      commit();
      toastPf("Kopija atkurta.");
    } catch { alert("Šis failas netinka. Atkurti galima tik iš InvestAI atsarginės kopijos (.json) arba brokerio CSV."); }
    e.target.value = "";
  });
  $("#clear").addEventListener("click", () => {
    if (!confirm("Ištrinti portfelį ir taisykles iš šios naršyklės? To atšaukti negalėsi.")) return;
    state = { holdings: [], rules: {}, currency: "EUR", divs: [] };
    $("#rule-inputs").dataset.ready = "";
    save();
    show("start");
  });
}
function flag(input, msg) {
  input.setCustomValidity(msg); input.reportValidity();
  setTimeout(() => input.setCustomValidity(""), 2500);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page !== "portfolio") return;
  try { ASSETS = (await getJSON("data/assets.json")).groups.flatMap((g) => g.items); } catch (e) { console.error(e); }
  [EXPLAIN, PRICES_PF, FUND] = await Promise.all([loadExplain(), loadPrices(), getJSON("data/fund.json").then((d) => d.items || {}).catch(() => ({}))]);
  const slot = $("#pf-help"); if (slot) slot.innerHTML = helpHTML();
  setupInputs();
  if (new URLSearchParams(location.search).has("pavyzdys")) {
    isDemo = true;
    animateNext = true;
    state = JSON.parse(JSON.stringify(DEMO));
    renderResult();
    return;
  }
  load();
  if (state.holdings.length) renderResult(); else show("start");
});
