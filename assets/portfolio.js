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
let state = { holdings: [], rules: {}, currency: "EUR" };
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
    if (d && Array.isArray(d.holdings)) state = { holdings: d.holdings, rules: d.rules || {}, currency: d.currency || "EUR" };
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
  const a = analyze(state.holdings);
  if (a.total <= 0) { show("start"); return; }
  show("result");
  $("#demo-note").hidden = !isDemo;
  renderHero(a);
  renderDim(a);
  renderHealth(a);
  renderTreemap(a);
  $("#r-facts").innerHTML = facts(a).map((f) => `<li>${f}</li>`).join("");
  renderMovers(a);
  renderCompare(a);
  renderScenarios(a);
  renderCards(a);
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
    $("#r-pnl-sub").textContent = `Pelne ${P.up} ${P.up === 1 ? "pozicija" : "pozicijos"}, nuostolyje ${P.down}${P.known < P.total ? ` · rezultatas žinomas ${P.known} iš ${P.total} pozicijų` : ""}`;
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
  $("#r-strip").innerHTML = stripHTML(a[dim]) + `<div class="drill" id="r-drill" hidden></div>`;
  $("#r-strip-note").hidden = !(dim === "sectors" || dim === "regions");
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
    return { label: isTv(r.s) ? r.s.split(":")[1].replace(/USDT?$/, "") : r.n, sub: `${pct(r.value / a.total)} · ${c === undefined || c === null ? "–" : fmtPct(c)}`, v: r.value, c, href: isTv(r.s) ? assetUrl(r.s) : null, title: `${r.n}: ${money(r.value)}, ${c === undefined || c === null ? "pokytis nežinomas" : fmtPct(c)}` };
  });
  $("#r-tm").innerHTML = items.length ? treemapHTML(items, { scale: TM_SCALE[tmMode], ratio: window.innerWidth < 680 ? 1 : 0.42 }) + tmLegend(TM_SCALE[tmMode], " %") : "";
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
    tv(d.querySelector(".pos-chart"), "symbol-overview", {
      symbols: [[sym.split(":")[1], `${sym}|1M`]], chartOnly: false, width: "100%", height: 300, autosize: false,
      showVolume: false, hideDateRanges: false, scalePosition: "right", scaleMode: "Normal", lineWidth: 2, chartType: "area",
      dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W"],
    });
    tv(d.querySelector(".pos-news"), "timeline", { feedMode: "symbol", symbol: sym, width: "100%", height: 300, displayMode: "compact" });
  }));
}
function openCard(s) {
  const d = [...document.querySelectorAll("#r-cards details.pos")].find((x) => x.dataset.s === s);
  if (!d) return;
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
    state.holdings[+inp.dataset.i].value = Math.max(0, Number(inp.value) || 0);
    commit();
  }));
  $("#r-table").querySelectorAll(".pf-pnl").forEach((inp) => inp.addEventListener("change", () => {
    const h = state.holdings[+inp.dataset.i];
    if (inp.value.trim() === "") { delete h.pnl; delete h.pnlPct; }
    else { h.pnl = Number(inp.value); h.pnlPct = h.value - h.pnl > 0 ? Math.round((h.pnl / (h.value - h.pnl)) * 10000) / 100 : null; }
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
    for (const row of r.rows) {
      all++; if (row.cur === "USD") usd++;
      const ex = draft.find((d) => d.s === row.s);
      // Ta pati pozicija keliose nuotraukose su ta pačia suma – tikėtina, kad nuotraukos persidengia
      if (ex) { if (Math.abs(ex.value - row.value) > Math.max(1, ex.value * 0.01)) ex.value += row.value; }
      else draft.push({ s: row.s, n: row.n, value: Math.round(row.value * 100) / 100, src: row.src, unknown: false, fixed: row.fixed, pnl: row.pnl, pnlPct: row.pnlPct, qty: row.qty });
    }
    for (const u of r.unknown) {
      all++; if (u.cur === "USD") usd++;
      if (draft.some((d) => d.src === u.text)) continue;
      const name = u.name || u.text;
      draft.push({ s: name ? customId(name) : null, n: name, value: Math.round(u.value * 100) / 100, src: u.text, unknown: true, custom: true, pnl: u.pnl, pnlPct: u.pnlPct, qty: u.qty });
    }
  }
  return { usd, all };
}

/* ---------- Peržiūra ---------- */
function renderReview(info) {
  show("review");
  const note = $("#review-note");
  const cur = info && info.usd > info.all / 2 ? "USD" : state.holdings.length ? state.currency : "EUR";
  $("#v-review").dataset.cur = cur;
  if (!draft.length) {
    note.hidden = false;
    note.textContent = info ? "Nuotraukoje neradome pozicijų. Pabandyk aiškesnę nuotrauką arba suvesk pozicijas ranka." : "Suvesk savo pozicijas: aktyvą ir jo vertę.";
    draft.push({ s: null, n: "", value: "", src: "", unknown: false });
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
      ${d.custom ? `<p class="src">Šio aktyvo mūsų sąraše nėra – bus įtrauktas kaip „Kita“. Jei randi jį paieškoje, pasirink.</p>` : d.fixed ? `<p class="src">Suma pataisyta (nuotraukoje neperskaitytas kablelis) – patikrink.</p>` : d.src ? `<p class="src">Nuotraukoje: „${esc(d.src)}“</p>` : ""}
    </li>`).join("");
  list.querySelectorAll("li").forEach((li) => {
    const i = +li.dataset.i;
    const [nameIn, valIn] = li.querySelectorAll("input");
    picker(nameIn, (s) => {
      if (s) { draft[i].s = s; draft[i].custom = false; draft[i].n = findAsset(s) ? findAsset(s).n : s === CASH ? "Grynieji pinigai" : ticker(s); li.classList.remove("unknown"); }
      else { draft[i].s = null; draft[i].custom = false; draft[i].n = nameIn.value.trim(); }
    });
    valIn.addEventListener("input", () => (draft[i].value = valIn.value));
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
    merged.set(it.s, ex ? { ...ex, value: ex.value + it.value, pnl: (ex.pnl || 0) + (it.pnl || 0) || undefined, pnlPct: undefined } : it);
  });
  isDemo = false;
  state.holdings = [...merged.values()];
  state.currency = $("#v-review").dataset.cur || "EUR";
  draft = [];
  $("#rule-inputs").dataset.ready = "";
  quotesKey = mentionsKey = "";
  animateNext = true;
  commit();
}

/* ---------- Failai, vilkimas, įklijavimas ---------- */
async function handleFiles(files, fromView) {
  if (!files || !files.length) return;
  const progressEl = fromView === "review" ? $("#progress2") : $("#progress");
  if (fromView === "result") { show("start"); }
  if (fromView !== "review") draft = [];
  try {
    const info = mergeIntoDraft(await recognizeFiles(files, fromView === "review" ? progressEl : $("#progress")));
    renderReview(info);
  } catch (e) {
    console.error(e);
    progressEl.hidden = false;
    progressEl.querySelector("p").textContent = `${e.message || "Atpažinti nepavyko"}. Pabandyk dar kartą arba suvesk pozicijas ranka.`;
  }
}
function setupInputs() {
  $("#file").addEventListener("change", (e) => { handleFiles(e.target.files, "start"); e.target.value = ""; });
  $("#file2").addEventListener("change", (e) => { handleFiles(e.target.files, "review"); e.target.value = ""; });
  $("#file3").addEventListener("change", (e) => { handleFiles(e.target.files, "result"); e.target.value = ""; });
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
  $("#review-add").addEventListener("click", () => { draft.push({ s: null, n: "", value: "", src: "", unknown: false }); renderReview(); const ins = $("#review-list").querySelectorAll("li:last-child input"); ins[0] && ins[0].focus(); });
  $("#review-done").addEventListener("click", finishReview);
  $("#review-cancel").addEventListener("click", () => { draft = []; state.holdings.length ? renderResult() : show("start"); });
  document.querySelectorAll(".seg button[data-dim]").forEach((b) => b.addEventListener("click", () => { dim = b.dataset.dim; renderDim(); }));
  document.querySelectorAll("#tm-mode [data-tm]").forEach((b) => b.addEventListener("click", () => { tmMode = b.dataset.tm; renderTreemap(); }));
  $("#r-strip").addEventListener("click", (e) => {
    if (e.target.closest(".drill-x")) { $("#r-drill").hidden = true; document.querySelectorAll("#r-strip .sel").forEach((x) => x.classList.remove("sel")); return; }
    const el = e.target.closest("[data-k]"); if (el && !e.target.closest(".drill")) drillDown(el.dataset.k);
  });

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
  $("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "InvestAI", version: 1, exported: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "investai-portfelis.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#import").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.holdings)) throw new Error();
      isDemo = false;
      state = {
        holdings: d.holdings.filter((h) => h && typeof h.s === "string" && (h.s === CASH || SYMBOL_RE.test(h.s) || /^X:[A-Z0-9-]{1,40}$/.test(h.s))).map((h) => ({ ...h, value: Math.max(0, Number(h.value) || 0) })),
        rules: d.rules && typeof d.rules === "object" ? d.rules : {},
        currency: d.currency === "USD" ? "USD" : "EUR",
      };
      $("#rule-inputs").dataset.ready = "";
      commit();
    } catch { alert("Šis failas netinka. Importuoti galima tik InvestAI eksportuotą failą."); }
    e.target.value = "";
  });
  $("#clear").addEventListener("click", () => {
    if (!confirm("Ištrinti portfelį ir taisykles iš šios naršyklės? To atšaukti negalėsi.")) return;
    state = { holdings: [], rules: {}, currency: "EUR" };
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
  [EXPLAIN, PRICES_PF] = await Promise.all([loadExplain(), loadPrices()]);
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
