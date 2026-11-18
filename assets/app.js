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
  ["morning", "rytas.html", "Mano rytas"],
  ["news", "naujienos.html", "Naujienos"],
  ["markets", "rinkos.html", "Rinkos"],
  ["screener", "atranka.html", "Atranka"],
  ["strategy", "strategija.html", "Strategija"],
  ["premium", "premium.html", "Premium"],
  ["portfolio", "portfelis.html", "Mano portfelis", "nav-cta"],
];
// Portfelio juostos spalvos (tamsiam tekstui – šviesios spalvos)
const PALETTE = ["#4f8cff", "#f5b335", "#2ec4b6", "#ff7a59", "#a77bff", "#8bd450", "#ff6fae", "#5ad1ff", "#c9a227", "#8fa3c0"];
const LIGHT_COLORS = new Set(["#f5b335", "#2ec4b6", "#ff7a59", "#8bd450", "#ff6fae", "#5ad1ff", "#c9a227", "#8fa3c0"]);
function stripHTML(list, max = 7) {
  const top = list.slice(0, max);
  const rest = list.slice(max).reduce((t, x) => t + x.p, 0);
  const items = top.map((x, i) => ({ ...x, c: PALETTE[i % PALETTE.length] }));
  if (rest > 0.0005) items.push({ k: "Kiti", p: rest, c: "#8fa3c0" });
  const pctS = (p) => `${Math.round(p * 100)}\u00a0%`;
  return `<div class="strip" role="img" aria-label="${esc(items.map((x) => `${x.k} ${pctS(x.p)}`).join(", "))}">${items
    .map((x) => `<span style="flex:${x.p};background:${x.c}" class="${LIGHT_COLORS.has(x.c) ? "ink-dark" : ""}" data-k="${esc(x.k)}" title="${esc(x.k)} ${pctS(x.p)}"><em>${pctS(x.p)}</em></span>`)
    .join("")}</div><ul class="strip-legend">${items.map((x) => `<li data-k="${esc(x.k)}"><i style="background:${x.c}"></i>${esc(x.k)} <b>${pctS(x.p)}</b></li>`).join("")}</ul>`;
}
const SECTOR_SHORT = { "Nebūtinos vartojimo prekės": "Vartojimas", "Būtinos vartojimo prekės": "Būtinos prekės", "Sveikatos apsauga": "Sveikata", "Komunalinės paslaugos": "Komunalinės", "Gynyba ir aviacija": "Gynyba", "Nekilnojamasis turtas": "NT", "Komunikacijos": "Komunikacijos", "Technologijos": "Technologijos" };
const shortSector = (k) => SECTOR_SHORT[k] || k;
// Sektorių ikonos ir šalių vėliavos (emoji – telefonuose rodomos spalvotai)
const KEY_ICON = {
  "Technologijos": "💻", "Finansai": "🏦", "Nebūtinos vartojimo prekės": "🛍️", "Būtinos vartojimo prekės": "🛒", "Sveikatos apsauga": "💊",
  "Pramonė": "🏭", "Komunikacijos": "📡", "Energetika": "🛢️", "Komunalinės paslaugos": "⚡", "Žaliavos": "⛏️", "Nekilnojamasis turtas": "🏠",
  "Gynyba ir aviacija": "🛡️", "Kriptovaliutos": "🪙", "Grynieji pinigai": "💶", "Auksas": "🥇", "Obligacijos": "📜", "Obligacijos ir pinigų rinka": "📜", "Pinigų rinka": "💶",
  "Platus JAV indeksas": "🇺🇸", "Pasaulio indeksas": "🌍", "JAV technologijų indeksas": "💻", "Europos indeksas": "🇪🇺", "Besivystančių rinkų indeksas": "🌏",
  "JAV": "🇺🇸", "Europa": "🇪🇺", "Baltija": "🇱🇹", "Japonija": "🇯🇵", "Azija ir besivystančios": "🌏", "Kitos išsivysčiusios": "🌐", "Be šalies": "🌐", "Nežinoma": "❔", "Kita": "❔",
  "Lietuva": "🇱🇹", "Estija": "🇪🇪", "Latvija": "🇱🇻", "Vokietija": "🇩🇪", "Didžioji Britanija": "🇬🇧", "Prancūzija": "🇫🇷", "Nyderlandai": "🇳🇱", "Švedija": "🇸🇪",
  "Italija": "🇮🇹", "Kinija": "🇨🇳", "Šveicarija": "🇨🇭", "Danija": "🇩🇰", "Kanada": "🇨🇦", "Norvegija": "🇳🇴", "Suomija": "🇫🇮", "Taivanas": "🇹🇼",
  "Singapūras": "🇸🇬", "Argentina": "🇦🇷", "Pietų Korėja": "🇰🇷", "Pasaulis": "🌍", "Besivystančios rinkos": "🌏",
  "Akcija": "📈", "Akcijos": "📈", "ETF": "🧺", "Kriptovaliuta": "🪙", "Grynieji": "💶",
};
const keyIcon = (k) => KEY_ICON[k] || "";
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
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  morning: '<circle cx="12" cy="13" r="4"/><path d="M12 3v2M4.2 7.2l1.4 1.4M19.8 7.2l-1.4 1.4M2 17h20M5 21h14"/>',
  portfolio: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/><path d="M3 12.5h18"/>',
  markets: '<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15.5 7H21v5.5"/>',
  digest: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 19h4"/>',
  screener: '<path d="M4 5h16l-6 7.5V19l-4 2v-8.5z"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h6M7 13h10M7 17h10"/><rect x="15" y="7.5" width="3" height="3" rx=".5"/>',
  strategy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  tools: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.2h.01M12 18.2h.01M15.5 18.2h.01"/>',
  premium: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10.5h14V9M10 13h4"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  glossary: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 19.5V4.5M9 7h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  asset: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
  styles: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};
const icon = (id, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] || ""}</svg>`;
const MENU = [
  ["home", "./", "Pradžia"], ["morning", "rytas.html", "Mano rytas"], ["portfolio", "portfelis.html", "Mano portfelis"],
  ["news", "naujienos.html", "Naujienos"], ["calendar", "naujienos.html#kalendorius", "Kalendorius"], ["digest", "apzvalga.html", "Dienos apžvalga"],
  ["markets", "rinkos.html", "Rinkos"], ["screener", "atranka.html", "Atranka"], ["strategy", "strategija.html", "Strategija"],
  ["tools", "irankiai.html", "Skaičiuoklės"], ["glossary", "zodynas.html", "Žodynas"], ["premium", "premium.html", "Premium"],
  ["archive", "archyvas.html", "Archyvas"], ["about", "apie.html", "Apie InvestAI"],
];
// Kur grįžti, jei naršyklės istorijos nėra (pvz., atidaryta iš nuorodos)
const PARENT = { asset: "rinkos.html", digest: "naujienos.html", archive: "apzvalga.html", tools: "./", premium: "./", about: "./", glossary: "./" };
function goBack(page) {
  const same = document.referrer && new URL(document.referrer).origin === location.origin;
  if (same && history.length > 1) history.back();
  else location.href = PARENT[page] || "./";
}
/* ---------- Paieška (iš bet kurio puslapio) ---------- */
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
let _search;
async function openSearch() {
  if (!_search) {
    _search = document.createElement("dialog");
    _search.className = "sheet search-sheet";
    _search.setAttribute("aria-label", "Paieška");
    _search.innerHTML = `<div class="ss-top"><label class="ss-field">${icon("asset", 20)}<input type="search" placeholder="Įmonė, fondas, kriptovaliuta…" autocomplete="off" enterkeyhint="search" aria-label="Ieškoti"></label><button type="button" class="ss-cancel">Atšaukti</button></div><div class="ss-body"><ul class="grp" id="ss-res"></ul></div>`;
    document.body.append(_search);
    const close = () => _search.close();
    $(".ss-cancel", _search).addEventListener("click", close);
    _search.addEventListener("click", (e) => { if (e.target === _search) close(); });
    const input = $("input", _search);
    const [all, P] = await Promise.all([allAssets(), loadPrices()]);
    const list = all.filter((a) => !a.s.startsWith("X:"));
    const draw = () => {
      const q = norm(input.value.trim());
      let res;
      if (!q) {
        const wl = watchList().map((s) => list.find((a) => a.s === s)).filter(Boolean);
        const pop = ["NASDAQ:NVDA", "NASDAQ:AAPL", "NASDAQ:TSLA", "NASDAQ:MSFT", "XETR:VWCE", "OMXVSE:IGN1L", "BITSTAMP:BTCUSD", "XETR:RHM"].map((s) => list.find((a) => a.s === s)).filter(Boolean);
        res = [...wl, ...pop.filter((a) => !wl.includes(a))].slice(0, 12);
        $("#ss-res").dataset.label = wl.length ? "Stebimi ir populiarūs" : "Populiarūs";
      } else {
        const score = (a) => { const t = norm(a.s.split(":")[1]), n = norm(a.n); return t === q ? 0 : t.startsWith(q) ? 1 : n.startsWith(q) ? 2 : n.split(/[\s(]+/).some((w) => w.startsWith(q)) ? 3 : n.includes(q) || t.includes(q) ? 4 : 9; };
        res = list.map((a) => [score(a), a]).filter(([sc]) => sc < 9).sort((x, y) => x[0] - y[0] || ((P.items[y[1].s] || {}).mcap || 0) - ((P.items[x[1].s] || {}).mcap || 0)).slice(0, 30).map(([, a]) => a);
        $("#ss-res").dataset.label = res.length ? "Rezultatai" : "";
      }
      $("#ss-res").innerHTML = res.length ? res.map((a) => P.items[a.s] ? assetRow(a, P.items[a.s], { spark: false, sub: `${a.s.split(":")[1]} · ${a.type || ""}` }) : rowHTML({ href: assetUrl(a.s), ava: logoHTML(a.s, a.n, "#1d3a63", 40), title: esc(a.n), sub: esc(a.s) })).join("")
        : `<li class="row row-empty"><span>Nieko nerasta. Bet kurį aktyvą galima atidaryti formatu BIRŽA:SIMBOLIS, pvz., <a href="aktyvas.html?s=NYSE:KO">NYSE:KO</a>.</span></li>`;
    };
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Enter") return;
      const v = input.value.trim().toUpperCase();
      const first = $("#ss-res a.row-main");
      if (SYMBOL_RE.test(v)) location.href = assetUrl(v); else if (first) location.href = first.getAttribute("href");
    });
    draw();
  }
  _search.showModal();
  const inp = $("input", _search); inp.value = ""; inp.dispatchEvent(new Event("input")); setTimeout(() => inp.focus(), 30);
}

function renderChrome(page) {
  const header = document.createElement("header");
  header.className = "masthead";
  const showBack = page !== "home";
  header.innerHTML = `
    <div class="wrap wide">
      ${showBack ? `<button class="icon-btn back-btn" type="button" aria-label="Atgal">${icon("back", 24)}</button>` : ""}
      <a class="logo" href="./" aria-label="InvestAI pradžia">
        <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0e1f3a"/><rect x="12" y="38" width="10" height="14" rx="3" fill="#2fb3c0"/><rect x="27" y="28" width="10" height="24" rx="3" fill="#ffffff"/><rect x="42" y="14" width="10" height="38" rx="3" fill="#f5b335"/></svg>
        <span>Invest<b>AI</b></span>
      </a>
      <nav id="main-nav">${NAV.map(([id, href, label, cls]) => `<a href="${href}"${cls ? ` class="${cls}"` : ""}${id === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
      <div class="head-actions"><button class="icon-btn search-open" type="button" aria-label="Ieškoti akcijų, fondų ir kriptovaliutų">${icon("asset", 22)}</button><button class="icon-btn theme-btn" type="button" aria-label="${currentTheme() === "dark" ? "Įjungti šviesią temą" : "Įjungti tamsią temą"}">${THEME_ICON}</button><button class="icon-btn menu-open" type="button" aria-label="Visi puslapiai" aria-haspopup="dialog">${icon("menu", 24)}</button></div>
    </div>`;
  document.body.prepend(header);
  $(".theme-btn", header).addEventListener("click", toggleTheme);
  $(".search-open", header).addEventListener("click", openSearch);
  if (showBack) $(".back-btn", header).addEventListener("click", () => goBack(page));

  const sheet = document.createElement("dialog");
  sheet.className = "sheet";
  sheet.setAttribute("aria-label", "Visi puslapiai");
  sheet.innerHTML = `<div class="sheet-head"><b>Visi puslapiai</b><button class="icon-btn sheet-close" type="button" aria-label="Uždaryti">${icon("close", 22)}</button></div>
    <nav class="sheet-grid">${MENU.map(([id, href, label]) => `<a href="${href}"${id === page ? ' aria-current="page"' : ""}><span class="sheet-ico">${icon(id, 22)}</span>${label}</a>`).join("")}</nav>`;
  document.body.append(sheet);
  const close = () => { sheet.classList.add("closing"); setTimeout(() => { sheet.classList.remove("closing"); sheet.close(); }, 160); };
  $(".menu-open", header).addEventListener("click", () => sheet.showModal());
  $(".sheet-close", sheet).addEventListener("click", close);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });

  const footer = document.createElement("footer");
  footer.innerHTML = `
    <div class="wrap wide">
      <div class="foot-grid">
        <a class="logo" href="./"><span>Invest<b>AI</b></span></a>
        <nav class="foot-links" aria-label="Kiti puslapiai">${MENU.slice(1).map(([, href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav>
      </div>
      <div class="legend">
        <span class="badge primary">Pirminis šaltinis</span><span>įmonės ar biržos pranešimas</span>
        <span class="badge media">Žiniasklaida</span><span>naujienų agentūra ar analitikas</span>
        <span class="badge unverified">Reikia patikrinti</span><span>šaltiniai neaiškūs ar nesutaria</span>
      </div>
      <p>InvestAI teikia informaciją, o ne investavimo rekomendacijas. Apžvalgas rengia dirbtinis intelektas pagal nurodytus šaltinius, todėl galimos klaidos. Kainų duomenys – Yahoo Finance (uždelsti), grafikai – <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a>.</p>
    </div>`;
  document.body.append(footer);

  // Apatinė navigacija telefone
  const tabs = [["home", "./", "Pradžia"], ["portfolio", "portfelis.html", "Portfelis"], ["markets", "rinkos.html", "Rinkos"], ["news", "naujienos.html", "Naujienos"]];
  const inTabs = tabs.some(([id]) => id === page) || page === "asset";
  const bar = document.createElement("nav");
  bar.className = "tabbar";
  bar.setAttribute("aria-label", "Pagrindinė navigacija");
  bar.innerHTML = tabs.map(([id, href, label]) => `<a href="${href}"${id === page || (page === "asset" && id === "markets") ? ' aria-current="page"' : ""}><span class="tab-ico">${icon(id, 23)}</span><span>${label}</span></a>`).join("")
    + `<button type="button" class="tab-more"${inTabs ? "" : ' aria-current="page"'}><span class="tab-ico">${icon("grid", 23)}</span><span>Daugiau</span></button>`;
  document.body.append(bar);
  $(".tab-more", bar).addEventListener("click", () => sheet.showModal());
  setupInstall(page);
}

/* ---------- Kainų duomenys, logotipai, mini grafikai ---------- */
let _prices = null;
async function loadPrices() {
  if (_prices) return _prices;
  const [d, l] = await Promise.all([getJSON("data/prices.json").catch(() => null), getJSON("data/live.json").catch(() => null)]);
  _prices = { updated: d ? d.updated : null, live: l ? l.updated : null, items: (d && d.items) || {} };
  if (d && d.fx && typeof TO_EUR === "object") Object.assign(TO_EUR, d.fx); // naujausi valiutų kursai
  // Biržų darbo metu kas ~15 min atnaujinama kaina (uždelsta) perrašo dienos uždarymo kainą
  if (l && l.items) {
    const fresh = Date.now() - new Date(l.updated).getTime() < 40 * 60e3;
    for (const [s, [price, d1, date]] of Object.entries(l.items)) {
      const p = _prices.items[s];
      if (!p || !price || (p.date && date < p.date)) continue;
      if (date > (p.date || "")) { p.spark = [...(p.spark || []), price]; if (p.recent) p.recent = [...p.recent, [date, price]]; }
      else if (p.spark) { p.spark = [...p.spark.slice(0, -1), price]; if (p.recent) p.recent = [...p.recent.slice(0, -1), [date, price]]; }
      Object.assign(p, { price, d1, date, ts: l.updated, live: fresh && date === l.updated.slice(0, 10) });
    }
  }
  return _prices;
}
// Aiški žyma: uždelsta kaina prekybos metu arba paskutinė uždarymo kaina
function priceStamp(p) {
  if (!p) return "";
  if (p.live && p.ts) {
    const t = new Date(p.ts);
    return `Uždelsta ~15 min · ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
  return p.date ? `Uždarymo kaina · ${fmtShort(p.date)}` : "";
}
function dataStamp(P) {
  const t = P.live ? new Date(P.live) : P.updated ? new Date(P.updated) : null;
  if (!t || isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60e3);
  const ago = mins < 1 ? "ką tik" : mins < 60 ? `prieš ${mins} min.` : mins < 1440 ? `prieš ${Math.round(mins / 60)} val.` : fmtShort(t.toISOString().slice(0, 10));
  return `Kainos atnaujintos ${ago} · uždelstos iki ~15 min`;
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
const AVA_COLORS = ["#2b63d9", "#0f8f7e", "#7a4fd6", "#c4520f", "#c0266d", "#0e7da0", "#4f7d12", "#a8740a", "#3c54b0", "#c22d45"];
function avaColor(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVA_COLORS[h % AVA_COLORS.length]; }
// Savame serveryje laikomi logotipai (tools/fetch_logos.py); jei nėra – bandoma iš išorės, galiausiai – inicialai
let LOGOS = {};
async function loadLogos() { try { LOGOS = await getJSON("data/logos.json"); } catch { LOGOS = {}; } }
function logoHTML(s, name, color = "#1d3a63", size = 40) {
  if (color === "#1d3a63") color = avaColor(s);
  const ini = esc(initialsOf(name));
  if (LOGOS[s]) return `<span class="logo-ava has-img" style="--ava:${color};width:${size}px;height:${size}px"><b>${ini}</b><img src="${LOGOS[s]}" alt="" decoding="async" onerror="this.parentNode.classList.remove('has-img');this.remove()"></span>`;
  const y = yahooSymbol(s);
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
  s.innerHTML = JSON.stringify({ locale: TV_LOCALE, colorTheme: currentTheme(), isTransparent: true, ...cfg });
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

/* ---------- Pradžia: žr. žemiau (pageHome) ---------- */
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
/* pageAsset – žr. žemiau */

/* ---------- Paleidimas ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  await loadLogos();
  // Pasirinkto stiliaus diagramų paletė (CSS kintamasis --palette)
  const pal = getComputedStyle(document.documentElement).getPropertyValue("--palette").trim();
  if (pal) {
    PALETTE.splice(0, PALETTE.length, ...pal.split(",").map((x) => x.trim()));
    LIGHT_COLORS.clear();
    getComputedStyle(document.documentElement).getPropertyValue("--palette-light").split(",").map((x) => x.trim()).filter(Boolean).forEach((c) => LIGHT_COLORS.add(c));
  }
  renderChrome(page);
  document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = icon(el.dataset.icon, 24); });
  try {
    if (page === "home") await pageHome();
    if (page === "digest") await pageDigest();
    if (page === "archive") await pageArchive();
    if (page === "markets") await pageMarkets();
    if (page === "news") await pageNews();
    if (page === "asset") await pageAsset();
    if (page === "morning") await pageMorning();
    if (page === "glossary") pageGlossary();
  } catch (e) {
    console.error(e);
    const root = $("#app");
    if (root) root.innerHTML = `<p class="error">Nepavyko įkelti turinio. Bandykite atnaujinti puslapį.</p>`;
  }
});
