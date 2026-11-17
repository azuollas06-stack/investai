// InvestAI – statinė svetainė. Turinys: data/*.json, kainos ir grafikai: TradingView valdikliai.
"use strict";

/* ---------- Bendri ---------- */
const STATUS = {
  primary: { label: "Pirminis šaltinis", cls: "primary" },
  media: { label: "Žiniasklaida", cls: "media" },
  unverified: { label: "Reikia patikrinti", cls: "unverified" },
};
const MONTHS = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const WEEKDAYS = ["sekmadienis", "pirmadienis", "antradienis", "trečiadienis", "ketvirtadienis", "penktadienis", "šeštadienis"];
const NAV = [
  ["markets", "rinkos.html", "Rinkos"],
  ["digest", "apzvalga.html", "Dienos apžvalga"],
  ["asset", "aktyvas.html", "Aktyvai"],
  ["strategy", "strategija.html", "Strategija"],
  ["portfolio", "portfelis.html", "Mano portfelis", "nav-cta"],
];
// Portfelio juostos spalvos (tamsiam tekstui – šviesios spalvos)
const PALETTE = ["#1d3a63", "#e39b1b", "#2c8c99", "#b5523b", "#7c5cbf", "#6e8b3d", "#d4677f", "#4c7dbf", "#a07a2c", "#8c9aab"];
const LIGHT_COLORS = new Set(["#e39b1b", "#8c9aab", "#a07a2c"]);
function stripHTML(list, max = 7) {
  const top = list.slice(0, max);
  const rest = list.slice(max).reduce((t, x) => t + x.p, 0);
  const items = top.map((x, i) => ({ ...x, c: PALETTE[i % PALETTE.length] }));
  if (rest > 0.0005) items.push({ k: "Kiti", p: rest, c: "#8c9aab" });
  const pctS = (p) => `${Math.round(p * 100)}\u00a0%`;
  return `<div class="strip" role="img" aria-label="${esc(items.map((x) => `${x.k} ${pctS(x.p)}`).join(", "))}">${items
    .map((x) => `<span style="flex:${x.p};background:${x.c}" class="${LIGHT_COLORS.has(x.c) ? "ink-dark" : ""}">${x.p >= 0.09 ? pctS(x.p) : ""}</span>`)
    .join("")}</div><ul class="strip-legend">${items.map((x) => `<li><i style="background:${x.c}"></i>${esc(x.k)} <b>${pctS(x.p)}</b></li>`).join("")}</ul>`;
}
const DARK = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
const THEME = DARK ? "dark" : "light";
const TV_LOCALE = "en";
const SYMBOL_RE = /^[A-Z0-9_]{1,20}:[A-Z0-9._!\-]{1,24}$/;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const siteBase = () => location.href.replace(/[^/]*([?#].*)?$/, "");
const assetUrl = (sym) => `aktyvas.html?s=${encodeURIComponent(sym)}`;

function fmtDate(iso, withWeekday = false) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const base = `${y} m. ${MONTHS[m - 1]} ${d} d.`;
  return withWeekday ? `${base}, ${WEEKDAYS[dt.getUTCDay()]}` : base;
}
function fmtShort(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)}. ${d} d.`;
}
async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/* ---------- Antraštė ir poraštė ---------- */
function renderChrome(page) {
  const header = document.createElement("header");
  header.className = "masthead";
  header.innerHTML = `
    <div class="wrap wide">
      <a class="logo" href="./" aria-label="InvestAI pradžia">
        <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#10233f"/><rect x="12" y="38" width="10" height="14" rx="3" fill="#2c8c99"/><rect x="27" y="28" width="10" height="24" rx="3" fill="#ffffff"/><rect x="42" y="14" width="10" height="38" rx="3" fill="#e39b1b"/></svg>
        <span>Invest<b>AI</b></span>
      </a>
      <button class="menu-btn" aria-expanded="false" aria-controls="main-nav">Meniu</button>
      <nav id="main-nav">${NAV.map(([id, href, label, cls]) => `<a href="${href}"${cls ? ` class="${cls}"` : ""}${id === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
    </div>`;
  document.body.prepend(header);
  const btn = $(".menu-btn", header);
  btn.addEventListener("click", () => {
    const open = header.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });

  const footer = document.createElement("footer");
  footer.innerHTML = `
    <div class="wrap wide">
      <div class="foot-grid">
        <a class="logo" href="./"><span>Invest<b>AI</b></span></a>
        <nav class="foot-links" aria-label="Kiti puslapiai"><a href="portfelis.html">Mano portfelis</a><a href="strategija.html">Strategija</a><a href="rinkos.html">Rinkos</a><a href="apzvalga.html">Dienos apžvalga</a><a href="archyvas.html">Archyvas</a><a href="apie.html">Apie InvestAI</a></nav>
      </div>
      <div class="legend">
        <span class="badge primary">Pirminis šaltinis</span><span>įmonės ar biržos pranešimas</span>
        <span class="badge media">Žiniasklaida</span><span>naujienų agentūra ar analitikas</span>
        <span class="badge unverified">Reikia patikrinti</span><span>šaltiniai neaiškūs ar nesutaria</span>
      </div>
      <p>InvestAI teikia informaciją, o ne investavimo rekomendacijas. Apžvalgas rengia dirbtinis intelektas pagal nurodytus šaltinius, todėl galimos klaidos. Kainos ir grafikai: <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a>, gali vėluoti.</p>
    </div>`;
  document.body.append(footer);

  // Apatinė navigacija telefone (programėlės pojūtis)
  const ICONS = {
    portfolio: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    markets: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    digest: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
    asset: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    strategy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  };
  const tabs = [["portfolio", "portfelis.html", "Portfelis"], ["strategy", "strategija.html", "Strategija"], ["markets", "rinkos.html", "Rinkos"], ["digest", "apzvalga.html", "Apžvalga"], ["asset", "aktyvas.html", "Paieška"]];
  const bar = document.createElement("nav");
  bar.className = "tabbar";
  bar.setAttribute("aria-label", "Pagrindinė navigacija");
  bar.innerHTML = tabs.map(([id, href, label]) => `<a href="${href}"${id === page ? ' aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg><span>${label}</span></a>`).join("");
  document.body.append(bar);
  setupInstall(page);
}

/* ---------- Kainų duomenys, logotipai, mini grafikai ---------- */
let _prices = null;
async function loadPrices() {
  if (_prices) return _prices;
  try { const d = await getJSON("data/prices.json"); _prices = { updated: d.updated, items: d.items || {} }; }
  catch { _prices = { updated: null, items: {} }; }
  return _prices;
}
// TradingView simbolis → Yahoo/FMP simbolis (tas pats kaip tools/fetch_prices.py)
const YSUF = { XETR: ".DE", MIL: ".MI", OMXSTO: ".ST", OSL: ".OL", OMXCOP: ".CO", OMXHEX: ".HE", LSE: ".L", SIX: ".SW", TSE: ".T", KRX: ".KS", OMXVSE: ".VS", OMXTSE: ".TL", OMXRSE: ".RG" };
const YEURONEXT = { ASML: "ASML.AS", AIR: "AIR.PA", SAF: "SAF.PA", HO: "HO.PA", MC: "MC.PA", OR: "OR.PA", TTE: "TTE.PA", SAN: "SAN.PA", RMS: "RMS.PA", BNP: "BNP.PA", AD: "AD.AS", INGA: "INGA.AS", ADYEN: "ADYEN.AS", PRX: "PRX.AS" };
function yahooSymbol(s) {
  if (!s || s.startsWith("X:") || s.startsWith("CASH")) return null;
  const [ex, t] = s.split(":");
  if (["NASDAQ", "NYSE", "AMEX"].includes(ex)) return t.replace(".", "-");
  if (ex === "EURONEXT") return YEURONEXT[t] || null;
  if (ex === "BITSTAMP" || ex === "BINANCE") return t.replace(/USDT?$/, "") + "-USD";
  if (YSUF[ex]) return (ex === "LSE" ? t.replace(/\.$/, "") : t.replace("_", "-")) + YSUF[ex];
  return null;
}
function initialsOf(name) {
  return (name || "?").replace(/[^A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
// Tikri logotipai iš viešo CDN; nepavykus – inicialai
function logoHTML(s, name, color = "#1d3a63", size = 40) {
  const y = yahooSymbol(s);
  const ini = esc(initialsOf(name));
  let src = null;
  if (y && /-USD$/.test(y)) src = `https://s3-symbol-logo.tradingview.com/crypto/XTVC${y.replace("-USD", "")}.svg`;
  else if (y) src = `https://financialmodelingprep.com/image-stock/${encodeURIComponent(y)}.png`;
  return `<span class="logo-ava" style="--ava:${color};width:${size}px;height:${size}px"><b>${ini}</b>${src ? `<img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('has-img')" onerror="this.remove()">` : ""}</span>`;
}
function sparkSVG(values, w = 96, h = 30) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values), r = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / r) * (h - 4)).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return `<svg class="spark ${up ? "s-up" : "s-down"}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
const fmtPct = (v, digits = 1) => (v === null || v === undefined ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("lt-LT", { maximumFractionDigits: digits })} %`);

/* ---------- Asmeninė pagalba ---------- */
function helpHTML() {
  return `<aside class="help">
    <div class="help-text">
      <h3>Nori, kad padėtų žmogus?</h3>
      <p>InvestAI parodo faktus, bet negali pasakyti, kas tinka būtent tau. Asmeninės strategijos ir portfelio klausimais gali kreiptis į nepriklausomą investicijų konsultantą <b>Marių Lencevičių</b> („Ekonomisto užrašai“). Pirmasis pokalbis – nemokamas.</p>
    </div>
    <a class="btn primary" href="https://www.ekonomistouzrasai.lt/" target="_blank" rel="noopener">Užsiregistruoti konsultacijai</a>
  </aside>`;
}

/* ---------- „Kodėl kilo / krito?“ paaiškinimai ---------- */
let _explain = null;
async function loadExplain() {
  if (_explain) return _explain;
  try { _explain = (await getJSON("data/explain.json")).items || {}; } catch { _explain = {}; }
  return _explain;
}
function explainHTML(e, opts = {}) {
  if (!e) return "";
  const st = STATUS[e.status] || STATUS.media;
  const dir = e.direction === "up" ? "up" : e.direction === "down" ? "down" : "mixed";
  const age = Math.round((Date.now() - new Date(e.date + "T12:00:00").getTime()) / 864e5);
  return `<div class="explain ex-${dir}">
    <div class="explain-head"><span class="explain-q">Kodėl ${dir === "up" ? "kilo" : dir === "down" ? "krito" : "svyruoja"}?</span><span class="explain-move">${esc(e.move || "")}</span></div>
    <h4>${esc(e.headline)}</h4>
    <ul>${(e.points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    ${e.context ? `<p class="explain-ctx">${esc(e.context)}</p>` : ""}
    <p class="explain-meta"><span class="badge ${st.cls}">${st.label}</span> Atnaujinta ${fmtShort(e.date)}${age > 7 ? " (senesnis nei savaitė)" : ""} · ${(e.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(" · ")}</p>
    ${opts.footer === false ? "" : `<p class="explain-foot">Paaiškinimą parengė DI pagal nurodytus šaltinius. Tai ne rekomendacija pirkti ar parduoti.</p>`}
  </div>`;
}

/* ---------- Programėlė (PWA) ---------- */
const STANDALONE = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
if (STANDALONE) document.documentElement.classList.add("standalone");
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e)));
}
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; showInstall(); });
function installDismissed() { try { return localStorage.getItem("investai.install.dismissed") === "1"; } catch { return false; } }
function setupInstall(page) {
  if (STANDALONE || installDismissed() || !["home", "portfolio"].includes(page)) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  if (ios) showInstall(true);
}
function showInstall(ios = false) {
  if (STANDALONE || installDismissed() || document.querySelector(".install") || !["home", "portfolio"].includes(document.body.dataset.page)) return;
  const el = document.createElement("div");
  el.className = "install";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Įdiegti InvestAI");
  el.innerHTML = `<img src="assets/icons/icon-192.png" alt="" width="44" height="44">
    <div><b>Įdiek InvestAI telefone</b><span>${ios ? "Paspausk „Bendrinti“ <svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' stroke-width='2' style='vertical-align:-2px'><path d='M12 3v12M7 8l5-5 5 5'/><path d='M5 13v7h14v-7'/></svg> ir „Į pradžios ekraną“." : "Atsidarys kaip programėlė – be naršyklės juostų."}</span></div>
    ${ios ? "" : `<button class="btn primary small" type="button" data-act="install">Įdiegti</button>`}
    <button class="icon-btn" type="button" data-act="close" aria-label="Uždaryti">×</button>`;
  document.body.append(el);
  el.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "install" && deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; el.remove(); }
    if (act === "close") { try { localStorage.setItem("investai.install.dismissed", "1"); } catch {} el.remove(); }
  });
}

/* ---------- TradingView valdikliai ---------- */
function tv(el, name, cfg) {
  if (!el) return;
  el.innerHTML = "";
  const box = document.createElement("div");
  box.className = "tradingview-widget-container";
  const inner = document.createElement("div");
  inner.className = "tradingview-widget-container__widget";
  box.appendChild(inner);
  const s = document.createElement("script");
  s.type = "text/javascript";
  s.async = true;
  s.src = `https://s3.tradingview.com/external-embedding/embed-widget-${name}.js`;
  s.innerHTML = JSON.stringify({ locale: TV_LOCALE, colorTheme: THEME, isTransparent: true, ...cfg });
  box.appendChild(s);
  el.appendChild(box);
}
const tickerTape = (el) =>
  tv(el, "ticker-tape", {
    symbols: [
      { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
      { proName: "FOREXCOM:NSXUSD", title: "Nasdaq 100" },
      { proName: "NASDAQ:NVDA", title: "Nvidia" },
      { proName: "NASDAQ:AAPL", title: "Apple" },
      { proName: "NASDAQ:MSFT", title: "Microsoft" },
      { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
      { proName: "TVC:UKOIL", title: "Brent" },
      { proName: "FX:EURUSD", title: "EUR/USD" },
    ],
    showSymbolLogo: true,
    displayMode: "adaptive",
  });

/* ---------- Apžvalga ---------- */
function renderItem(it) {
  const st = STATUS[it.status] || STATUS.media;
  const tags = (it.tags || []).map((t) => `<span class="badge tag">${esc(t)}</span>`).join("");
  const srcs = (it.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(" · ");
  return `
    <article class="item">
      <div class="badges"><span class="badge ${st.cls}">${st.label}</span>${tags}</div>
      <h3>${esc(it.headline)}</h3>
      <p>${esc(it.text)}</p>
      ${it.note ? `<p class="item-note">⚠ ${esc(it.note)}</p>` : ""}
      ${it.why ? `<p class="why"><b>Kodėl svarbu:</b> ${esc(it.why)}</p>` : ""}
      ${srcs ? `<div class="sources">Šaltiniai: ${srcs}</div>` : ""}
    </article>`;
}
function renderDigest(d) {
  const sections = (d.sections || [])
    .map((s) => `<section id="${esc(s.id)}"><h2 class="kicker">${esc(s.title)}</h2>${(s.items || []).map(renderItem).join("")}</section>`)
    .join("");
  const cal = (d.calendar || []).length
    ? `<section id="kalendorius"><h2 class="kicker">Artimiausios datos</h2><ul class="cal">${d.calendar
        .map((c) => `<li><time datetime="${esc(c.date)}">${fmtShort(c.date)}</time><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.text)}</a></li>`)
        .join("")}</ul></section>`
    : "";
  document.title = `${d.title} – InvestAI`;
  return `
    <div class="dateline">${fmtDate(d.date, true)}</div>
    <h1>${esc(d.title)}</h1>
    <p class="lead">${esc(d.lead)}</p>
    <p class="ai-note">Apžvalgą parengė dirbtinis intelektas pagal nurodytus šaltinius. Tai ne investavimo rekomendacija.</p>
    ${sections}${cal}`;
}
async function pageDigest() {
  const root = $("#app");
  const params = new URLSearchParams(location.search);
  const idx = await getJSON("data/index.json");
  const date = isDate(params.get("d")) ? params.get("d") : idx.latest;
  const pos = idx.digests.findIndex((x) => x.date === date);
  const d = await getJSON(`data/digests/${date}.json`);
  const prev = idx.digests[pos + 1];
  const next = pos > 0 ? idx.digests[pos - 1] : null;
  root.innerHTML =
    renderDigest(d) +
    `<nav class="pager">
      ${prev ? `<a href="apzvalga.html?d=${prev.date}">Ankstesnė: ${fmtShort(prev.date)}</a>` : "<span></span>"}
      <a href="archyvas.html">Visos apžvalgos</a>
      ${next ? `<a href="apzvalga.html?d=${next.date}">Kita: ${fmtShort(next.date)}</a>` : "<span></span>"}
    </nav>`;
}

/* ---------- Archyvas ---------- */
async function pageArchive() {
  const idx = await getJSON("data/index.json");
  $("#app").innerHTML = `
    <h1>Archyvas</h1>
    <ul class="archive">${idx.digests
      .map((x) => `<li><time datetime="${esc(x.date)}">${fmtDate(x.date, true)}</time><a href="apzvalga.html?d=${esc(x.date)}">${esc(x.title)}</a><p>${esc(x.lead)}</p></li>`)
      .join("")}</ul>`;
}

/* ---------- Pradžia ---------- */
async function pageHome() {
  tickerTape($("#ticker"));
  $("#home-help").innerHTML = helpHTML();
  $("#demo-strip").innerHTML = stripHTML([
    { k: "Technologijos", p: 0.5 }, { k: "Pasaulio indeksas", p: 0.2 }, { k: "Komunalinės", p: 0.12 },
    { k: "Kriptovaliutos", p: 0.07 }, { k: "Finansai", p: 0.06 }, { k: "Grynieji", p: 0.05 },
  ]);
  try {
    const idx = await getJSON("data/index.json");
    const d = await getJSON(`data/digests/${idx.latest}.json`);
    const items = (d.sections || []).flatMap((s) => s.items || []).slice(0, 3);
    $("#latest").innerHTML = `
      <div class="dateline">${fmtDate(d.date, true)}</div>
      <h3 class="latest-title"><a href="apzvalga.html">${esc(d.title)}</a></h3>
      <p>${esc(d.lead)}</p>
      <ul class="latest-list">${items.map((it) => `<li><span class="badge ${(STATUS[it.status] || STATUS.media).cls}">${(STATUS[it.status] || STATUS.media).label}</span> ${esc(it.headline)}</li>`).join("")}</ul>
      <a class="btn" href="apzvalga.html">Skaityti visą apžvalgą</a>`;
  } catch (e) {
    console.error(e);
    $("#latest").innerHTML = `<p class="muted">Apžvalgos įkelti nepavyko.</p>`;
  }
}

/* ---------- Rinkos ---------- */
const MARKET_TABS = {
  us: (el) =>
    tv(el, "stock-heatmap", {
      exchanges: [], dataSource: "SPX500", grouping: "sector", blockSize: "market_cap_basic", blockColor: "change",
      symbolUrl: siteBase() + "aktyvas.html", hasTopBar: true, isDataSetEnabled: true, isZoomEnabled: true,
      hasSymbolTooltip: true, isMonoSize: false, width: "100%", height: 640,
    }),
  world: (el) =>
    tv(el, "market-overview", {
      dateRange: "12M", showChart: true, largeChartUrl: siteBase() + "aktyvas.html", showSymbolLogo: true,
      showFloatingTooltip: true, width: "100%", height: 640,
      tabs: [
        { title: "Indeksai", symbols: [
          { s: "FOREXCOM:SPXUSD", d: "S&P 500" }, { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100" }, { s: "FOREXCOM:DJI", d: "Dow Jones" },
          { s: "INDEX:DEU40", d: "DAX" }, { s: "FOREXCOM:UKXGBP", d: "FTSE 100" }, { s: "INDEX:NKY", d: "Nikkei 225" } ] },
        { title: "Žaliavos", symbols: [
          { s: "TVC:GOLD", d: "Auksas" }, { s: "TVC:SILVER", d: "Sidabras" }, { s: "TVC:UKOIL", d: "Brent nafta" }, { s: "TVC:USOIL", d: "WTI nafta" } ] },
        { title: "Valiutos", symbols: [
          { s: "FX:EURUSD", d: "EUR/USD" }, { s: "FX:EURGBP", d: "EUR/GBP" }, { s: "FX_IDC:EURPLN", d: "EUR/PLN" }, { s: "FX_IDC:EURSEK", d: "EUR/SEK" } ] },
        { title: "Obligacijos", symbols: [
          { s: "TVC:US10Y", d: "JAV 10 m." }, { s: "TVC:US02Y", d: "JAV 2 m." }, { s: "TVC:DE10Y", d: "Vokietijos 10 m." } ] },
      ],
    }),
  baltic: async (el) => {
    const data = await getJSON("data/assets.json");
    const baltic = data.groups.find((g) => g.id === "baltic").items;
    const group = (prefix, name) => ({
      name,
      symbols: baltic.filter((a) => a.s.startsWith(prefix)).map((a) => ({ name: a.s, displayName: a.n })),
    });
    tv(el, "market-quotes", {
      width: "100%", height: 640, showSymbolLogo: true,
      symbolsGroups: [group("OMXVSE:", "Vilnius"), group("OMXTSE:", "Talinas"), group("OMXRSE:", "Ryga")],
    });
  },
  crypto: (el) =>
    tv(el, "crypto-coins-heatmap", {
      dataSource: "Crypto", blockSize: "market_cap_calc", blockColor: "change", symbolUrl: siteBase() + "aktyvas.html",
      hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false,
      width: "100%", height: 600,
    }),
};
function pageMarkets() {
  tickerTape($("#ticker"));
  const tabs = document.querySelectorAll("[data-tab]");
  const loaded = new Set();
  const show = (id) => {
    if (!MARKET_TABS[id]) id = "us";
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === id)));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== id));
    if (!loaded.has(id)) {
      loaded.add(id);
      MARKET_TABS[id]($(`[data-panel="${id}"] .widget`));
    }
    history.replaceState(null, "", `#${id}`);
  };
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  show(location.hash.slice(1) || "us");
}

/* ---------- Aktyvas ---------- */
async function buildSearch(form) {
  const data = await getJSON("data/assets.json");
  const all = data.groups.flatMap((g) => g.items.map((a) => ({ ...a, g: g.title })));
  const input = $("input", form);
  const list = $(".suggest", form);
  const go = (sym) => (location.href = assetUrl(sym));
  const render = (q) => {
    q = q.trim().toLowerCase();
    if (!q) return (list.hidden = true);
    const hits = all.filter((a) => a.n.toLowerCase().includes(q) || a.s.toLowerCase().includes(q)).slice(0, 8);
    const raw = q.toUpperCase();
    if (SYMBOL_RE.test(raw) && !hits.some((h) => h.s === raw)) hits.push({ s: raw, n: "Atidaryti simbolį", g: "" });
    list.innerHTML = hits.length
      ? hits.map((h) => `<li><a href="${assetUrl(h.s)}"><b>${esc(h.n)}</b><span>${esc(h.s)}</span></a></li>`).join("")
      : `<li class="muted">Nerasta. Įveskite BIRŽA:SIMBOLIS, pvz., NYSE:KO</li>`;
    list.hidden = false;
  };
  input.addEventListener("input", () => render(input.value));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const first = $(".suggest a", form);
    const raw = input.value.trim().toUpperCase();
    if (SYMBOL_RE.test(raw)) go(raw);
    else if (first) location.href = first.getAttribute("href");
  });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) list.hidden = true; });
  return data;
}
async function pageAsset() {
  const params = new URLSearchParams(location.search);
  const raw = (params.get("s") || params.get("tvwidgetsymbol") || "").toUpperCase().replace(/^X:.*/, "");
  const data = await buildSearch($("#search"));
  const all = data.groups.flatMap((g) => g.items);
  const sym = SYMBOL_RE.test(raw) ? raw : null;

  if (!sym) {
    $("#asset").hidden = true;
    $("#browse").insertAdjacentHTML("beforeend", data.groups
      .map((g) => `<section><h2 class="kicker">${esc(g.title)}</h2><div class="chips">${g.items.filter((a) => !a.s.startsWith("X:")).map((a) => `<a class="chip" href="${assetUrl(a.s)}">${esc(a.n)}<span>${esc(a.s.split(":")[1])}</span></a>`).join("")}</div></section>`)
      .join(""));
    return;
  }
  const known = all.find((a) => a.s === sym);
  document.title = `${known ? known.n : sym} – InvestAI`;
  $("#browse").hidden = true;
  $("#asset-title").textContent = known ? known.n : sym;
  $("#asset-symbol").textContent = sym;
  $("#tv-link").href = `https://www.tradingview.com/symbols/${sym.replace(":", "-")}/`;

  tv($("#w-info"), "symbol-info", { symbol: sym, width: "100%" });
  loadExplain().then((ex) => { if (ex[sym]) $("#w-explain").innerHTML = explainHTML(ex[sym]); });
  tv($("#w-chart"), "advanced-chart", {
    symbol: sym, width: "100%", height: 520, interval: "D", timezone: "Europe/Vilnius", theme: THEME,
    style: "1", allow_symbol_change: false, calendar: false, hide_volume: false, support_host: "https://www.tradingview.com",
  });
  const isCrypto = /^(BITSTAMP|BINANCE|COINBASE|KRAKEN|CRYPTO)/.test(sym);
  if (isCrypto) {
    $("#fundamentals").hidden = true;
  } else {
    tv($("#w-profile"), "symbol-profile", { symbol: sym, width: "100%", height: 420 });
    tv($("#w-fin"), "financials", { symbol: sym, width: "100%", height: 520, displayMode: "regular" });
  }
  tv($("#w-news"), "timeline", { feedMode: "symbol", symbol: sym, width: "100%", height: 520, displayMode: "regular" });
}

/* ---------- Paleidimas ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  renderChrome(page);
  try {
    if (page === "home") await pageHome();
    if (page === "digest") await pageDigest();
    if (page === "archive") await pageArchive();
    if (page === "markets") pageMarkets();
    if (page === "asset") await pageAsset();
  } catch (e) {
    console.error(e);
    const root = $("#app");
    if (root) root.innerHTML = `<p class="error">Nepavyko įkelti turinio. Bandykite atnaujinti puslapį.</p>`;
  }
});
