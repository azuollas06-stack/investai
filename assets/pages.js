// InvestAI – puslapiai su savais vizualais: pradžia, rinkos, aktyvas, naujienos.
"use strict";

// Tos pačios įmonės kitos akcijų klasės / ADR – žemėlapiuose ir sąrašuose nerodomos, kad nesidubliuotų
const DUP_SKIP = new Set(["NASDAQ:GOOG", "NYSE:BRK.A", "NASDAQ:ASML"]);
let _assetsAll = null;
async function allAssets() {
  if (_assetsAll) return _assetsAll;
  try { const d = await getJSON("data/assets.json"); _assetsAll = d.groups.flatMap((g) => g.items.map((a) => ({ ...a, g: g.id }))); } catch { _assetsAll = []; }
  return _assetsAll;
}
const regionOf = (a) => (a.g === "baltic" ? "Baltija" : a.country === "JAV" ? "JAV" : "Europa ir kt.");
const sparkTail = (sp, frac) => (sp ? sp.slice(-Math.max(4, Math.round(sp.length * frac))) : null);
function lastDateLabel(P) {
  const d = Object.values(P.items).map((x) => x.date).filter(Boolean).sort().pop();
  return d ? `Paskutinė prekybos diena: ${fmtShort(d)}` : "";
}

/* ---------- Eilutė su logotipu, kaina ir pokyčiu ---------- */
function moverRow(a, p, { key = "d1", star = true } = {}) {
  return `<li class="mv"><a href="${assetUrl(a.s)}">${logoHTML(a.s, a.n, "#1d3a63", 36)}<span class="mv-name"><b>${esc(a.n)}</b><small>${esc(a.s.split(":")[1])}</small></span>
    <span class="mv-spark">${sparkSVG(sparkTail(p.spark, 0.09), 64, 24)}</span>
    <span class="mv-num"><b>${fmtPrice(p.price, p.cur)}</b><span class="pill ${(p[key] ?? 0) >= 0 ? "pill-up" : "pill-down"}">${fmtPct(p[key])}</span></span></a>${star ? starHTML(a.s, a.n) : ""}</li>`;
}

/* ---------- Asmeniniai duomenys (tik šioje naršyklėje) ---------- */
function myHoldings() {
  try { const d = JSON.parse(localStorage.getItem("investai.portfolio.v1") || "null"); return (d && d.holdings) || []; } catch { return []; }
}
// Kiek portfelis pasikeitė per paskutinę prekybos dieną (pagal kiekvienos pozicijos dienos pokytį)
function portfolioToday(P) {
  const hs = myHoldings().filter((h) => h.value > 0);
  if (!hs.length) return null;
  let total = 0, known = 0, chg = 0;
  const rows = [];
  hs.forEach((h) => {
    total += h.value;
    const p = P.items[h.s];
    if (p && p.d1 !== null && p.d1 !== undefined) {
      known += h.value;
      const c = h.value - h.value / (1 + p.d1 / 100);
      chg += c;
      rows.push({ s: h.s, n: h.n, value: h.value, d1: p.d1, c, p });
    }
  });
  rows.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
  return { total, known, chg, pct: known ? (chg / (known - chg)) * 100 : null, rows };
}
const eur0 = (v) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(Math.round(v)).toLocaleString("lt-LT")} €`;
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Labanakt" : h < 11 ? "Labas rytas" : h < 18 ? "Laba diena" : "Labas vakaras";
}
function todayLong() {
  const d = new Date();
  const wd = ["sekmadienis", "pirmadienis", "antradienis", "trečiadienis", "ketvirtadienis", "penktadienis", "šeštadienis"][d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()} d., ${wd}`;
}

/* ---------- Pradžia ---------- */
const PULSE = [["AMEX:SPY", "S&P 500", "SPY"], ["NASDAQ:QQQ", "Nasdaq 100", "QQQ"], ["AMEX:DIA", "Dow Jones", "DIA"], ["XETR:VWCE", "Pasaulio akcijos", "VWCE"], ["BITSTAMP:BTCUSD", "Bitcoin", "BTC"], ["AMEX:GLD", "Auksas", "GLD"]];
function pulseHTML(P) {
  return PULSE.filter(([s]) => P.items[s]).map(([s, n, t], i) => {
    const p = P.items[s], up = (p.d1 ?? 0) >= 0;
    return `<a class="pulse-item ${up ? "is-up" : "is-down"}" style="--i:${i}" href="${assetUrl(s)}"><span class="pulse-name">${esc(n)} <small>${t}</small></span><b>${fmtPrice(p.price, p.cur)}</b><span class="pulse-chg">${fmtPct(p.d1, 2)}</span>${sparkSVG(sparkTail(p.spark, 0.09), 120, 30)}</a>`;
  }).join("");
}
/* Sąrašo eilutė (Revolut / Trading 212 stiliaus grupėse) */
function rowHTML({ href, ava, title, sub, val, chg, spark, star, cls = "" }) {
  const tag = href ? "a" : "div";
  return `<li class="row ${cls}"><${tag} class="row-main"${href ? ` href="${esc(href)}"` : ""}>${ava || ""}<span class="row-txt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>${spark ? `<span class="row-spark">${spark}</span>` : ""}<span class="row-val">${val || ""}${chg !== undefined && chg !== null ? `<span class="${chg >= 0 ? "up" : "down"}">${fmtPct(chg)}</span>` : ""}</span></${tag}>${star || ""}</li>`;
}
function assetRow(a, p, opts = {}) {
  return rowHTML({ href: assetUrl(a.s), ava: logoHTML(a.s, a.n, "#1d3a63", 40), title: esc(a.n), sub: esc(opts.sub || a.s.split(":")[1]), val: fmtPrice(p.price, p.cur), chg: p.d1, spark: opts.spark === false ? "" : sparkSVG(sparkTail(p.spark, 0.09), 56, 22), star: opts.star ? starHTML(a.s, a.n) : "" });
}
const IDX_BADGE = { "AMEX:SPY": ["500", "#1f4fd1"], "NASDAQ:QQQ": ["100", "#0d8f8a"], "AMEX:DIA": ["30", "#6b46c1"], "XETR:VWCE": ["🌍", "#16385f"], "BITSTAMP:BTCUSD": ["₿", "#f7931a"], "AMEX:GLD": ["Au", "#b8901f"] };
function marketRows(P) {
  return PULSE.filter(([s]) => P.items[s]).map(([s, n, t]) => { const p = P.items[s], [txt, bg] = IDX_BADGE[s] || ["•", "#3a4558"]; return rowHTML({ href: assetUrl(s), ava: LOGOS[s] ? logoHTML(s, n, "#1d3a63", 40) : `<span class="row-badge" style="background:${bg}">${txt}</span>`, title: esc(n), sub: t, val: fmtPrice(p.price, p.cur), chg: p.d1, spark: sparkSVG(sparkTail(p.spark, 0.09), 56, 22) }); }).join("");
}
async function pageHome() {
  $(".home-search").addEventListener("click", openSearch);
  const [P, all] = await Promise.all([loadPrices(), allAssets()]);
  $("#data-stamp").textContent = dataStamp(P).replace("Kainos atnaujintos ", "").replace(" · uždelstos iki ~15 min", "");
  // Rinkos
  $("#pulse").innerHTML = marketRows(P);
  // Herojus
  const t = portfolioToday(P);
  if (t && t.rows.length) {
    const up = t.chg >= 0;
    $("#hero").innerHTML = `<a class="bal" href="portfelis.html"><span class="bal-label">Mano portfelis ${icon("chevron", 16)}</span>
      <span class="bal-num">${Math.round(t.total).toLocaleString("lt-LT")} €</span>
      <span class="bal-chg ${up ? "up" : "down"}">${eur0(t.chg)} · ${fmtPct(t.pct, 2)} <small>per dieną</small></span></a>`;
  } else {
    $("#hero").innerHTML = `<div class="bal bal-cta"><span class="bal-label">${esc(greeting())}</span>
      <span class="bal-title">Sužinok, kur iš tikrųjų tavo pinigai</span>
      <a class="btn primary" href="portfelis.html">${icon("upload", 18)} Įkelti portfelio nuotrauką</a>
      <a class="bal-sub" href="portfelis.html?pavyzdys=1">arba žiūrėti pavyzdį</a></div>`;
  }
  // Stebimi
  const drawWatch = () => {
    const wl = watchList().map((s) => all.find((a) => a.s === s) || { s, n: s.split(":")[1] }).filter((a) => P.items[a.s]);
    $("#watch").innerHTML = wl.length ? wl.slice(0, 8).map((a) => assetRow(a, P.items[a.s], { star: true })).join("")
      : `<li class="row row-empty">${starHTML("NASDAQ:NVDA", "Nvidia")}<span>Pažymėk akcijas žvaigždute – jos bus čia.</span></li>`;
  };
  drawWatch();
  document.addEventListener("watchchange", drawWatch);
  // Daugiausiai judėjo
  const stocks = all.filter((a) => a.type === "Akcija" && !DUP_SKIP.has(a.s) && P.items[a.s] && P.items[a.s].mcap && P.items[a.s].d1 !== null && P.items[a.s].d1 !== undefined).sort((x, y) => P.items[y.s].d1 - P.items[x.s].d1);
  let mode = "up";
  const drawMv = () => {
    const list = mode === "up" ? stocks.slice(0, 5) : stocks.slice(-5).reverse();
    $("#movers").innerHTML = list.map((a) => assetRow(a, P.items[a.s], { star: true })).join("");
    document.querySelectorAll("#mv-seg [data-mv]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mv === mode)));
  };
  $("#mv-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-mv]"); if (b) { mode = b.dataset.mv; drawMv(); } });
  drawMv();
  // Žemėlapis
  const big = all.filter((a) => a.type === "Akcija" && !DUP_SKIP.has(a.s) && P.items[a.s] && P.items[a.s].mcap).map((a) => ({ a, p: P.items[a.s], v: P.items[a.s].mcap * (TO_EUR[P.items[a.s].cur] || 1) })).sort((x, y) => y.v - x.v).slice(0, 30);
  $("#home-map").innerHTML = treemapHTML(big.map(({ a, p, v }) => ({ label: a.s.split(":")[1].replace(/\..*/, ""), sub: fmtPct(p.d1), v, c: p.d1, href: assetUrl(a.s), title: `${a.n}: ${fmtPct(p.d1)} per dieną` })), { scale: 3, ratio: 0.75 });
  fitTreemaps($("#home-map"));
  // Naujienos ir kalendorius
  getJSON("data/news.json").then((n) => {
    $("#news").innerHTML = (n.stories || []).slice(0, 4).map((st) => rowHTML({ href: `naujienos.html#${st.id}`, ava: `<span class="row-ico">${icon(st.kind === "ipo" ? "premium" : st.kind === "earnings" ? "markets" : "news", 20)}</span>`, title: esc(st.title), sub: `${esc(KIND[st.kind] || "Naujiena")} · ${fmtShort(st.date)}` })).join("") || `<li class="row row-empty"><span>Naujienų nėra.</span></li>`;
    const today = new Date().toISOString().slice(0, 10);
    const ev = calendarEvents(n, P, all).filter((e) => e.date >= today).slice(0, 5);
    $("#events").innerHTML = ev.map((e) => { const [, m, d] = e.date.split("-").map(Number); return rowHTML({ href: e.url, cls: e.mine ? "row-mine" : "", ava: `<span class="row-date${daysUntil(e.date) <= 1 ? " soon" : ""}"><b>${d}</b>${MONTHS[m - 1].slice(0, 3)}.</span>`, title: esc(e.title), sub: `${whenLabel(e.date)} · ${esc(KIND[e.kind] || "Įvykis")}${e.mine ? " · tavo" : ""}` }); }).join("");
  }).catch(() => {});
  // DI apžvalga
  try {
    const idx = await getJSON("data/index.json");
    const d = await getJSON(`data/digests/${idx.latest}.json`);
    $("#latest").innerHTML = `<span class="ai-label">${aiMark()} ${fmtShort(d.date)}</span><b>${esc(d.title)}</b><span class="digest-lead">${esc(d.lead)}</span>`;
  } catch { $("#latest").hidden = true; }
}
function aiMark() { return `<svg class="ai-mark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" fill="currentColor"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" opacity=".7"/></svg>`; }

/* ---------- Rinkos ---------- */
const MAP_PERIODS = [["d1", "Diena", 3], ["w1", "Savaitė", 6], ["m1", "Mėnuo", 12], ["ytd", "Nuo metų pradžios", 30]];
const MAP_REGIONS = ["Visi", "JAV", "Europa ir kt.", "Baltija"];
async function nativeMap(el) {
  const [P, all] = await Promise.all([loadPrices(), allAssets()]);
  let per = 0, reg = "Visi";
  el.innerHTML = `<div class="map-ctl"><div class="seg" role="group" aria-label="Laikotarpis">${MAP_PERIODS.map(([k, l], i) => `<button type="button" data-per="${i}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
    <div class="seg" role="group" aria-label="Regionas">${MAP_REGIONS.map((r) => `<button type="button" data-reg="${esc(r)}" aria-pressed="${r === "Visi"}">${esc(r)}</button>`).join("")}</div></div>
    <div class="map-box"></div><div class="map-foot"><span class="muted small">${esc(lastDateLabel(P))} · dydis – įmonės vertė (apytiksliai eurais)</span><span class="map-leg"></span></div>`;
  const box = $(".map-box", el);
  const draw = () => {
    const [key, , scale] = MAP_PERIODS[per];
    const items = all.filter((a) => a.type === "Akcija" && !DUP_SKIP.has(a.s) && P.items[a.s] && P.items[a.s].mcap && (reg === "Visi" || regionOf(a) === reg)).map((a) => {
      const p = P.items[a.s];
      return { label: a.s.split(":")[1].replace(/\..*/, ""), sub: fmtPct(p[key]), v: p.mcap * (TO_EUR[p.cur] || 1), c: p[key], href: assetUrl(a.s), title: `${a.n}: ${fmtPct(p[key])}`, group: window.innerWidth < 680 ? shortSector(a.sector || "Kita") : a.sector || "Kita" };
    });
    box.innerHTML = items.length ? treemapHTML(items, { groups: true, scale, ratio: window.innerWidth < 680 ? 1.5 : 0.56 }) : `<p class="muted">Duomenų nėra.</p>`;
    fitTreemaps(box);
    $(".map-leg", el).innerHTML = tmLegend(scale, " %");
    el.querySelectorAll("[data-per]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.per === per)));
    el.querySelectorAll("[data-reg]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.reg === reg)));
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-per],[data-reg]");
    if (!b) return;
    if (b.dataset.per !== undefined) per = +b.dataset.per; else reg = b.dataset.reg;
    draw();
  });
  draw();
}
async function pageMarkets() {
  const tabs = document.querySelectorAll("[data-tab]");
  const loaded = new Set();
  const runners = { ...MARKET_TABS, map: nativeMap };
  const show = (id) => {
    if (!runners[id]) id = "map";
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === id)));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== id));
    if (!loaded.has(id)) { loaded.add(id); runners[id]($(`[data-panel="${id}"] .widget`)); }
    history.replaceState(null, "", `#${id}`);
  };
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  show(location.hash.slice(1) || "map");
}

/* ---------- Aktyvas ---------- */
const STAT_DEFS = [
  ["w1", "Per savaitę", "pct"], ["m1", "Per mėnesį", "pct"], ["ytd", "Nuo metų pradžios", "pct"], ["y1", "Per metus", "pct"],
  ["fromHigh", "Nuo metų aukščiausios", "pct", "Kiek dabartinė kaina žemiau aukščiausios per 52 savaites."],
  ["vol", "Svyravimai", "vol", "Metinis kainos svyravimas. Kuo didesnis, tuo staigiau kaina kyla ir krenta."],
  ["pe", "P/E", "num", "Kaina, padalyta iš metinio pelno vienai akcijai. Rodo, kiek metų pelno „kainuoja“ akcija."],
  ["fpe", "Prognozinis P/E", "num", "Tas pats, tik pagal analitikų prognozuojamą kitų metų pelną."],
  ["dy", "Dividendai", "dy", "Metiniai dividendai procentais nuo kainos."],
  ["mcap", "Įmonės vertė", "big", "Visų įmonės akcijų vertė biržoje."],
];
const STAT_TERM = { fromHigh: "drawdown", vol: "vol", pe: "pe", fpe: "fpe", dy: "dy", mcap: "mcap" };
function statCard([k, label, kind, help], p) {
  const v = p[k];
  if (v === undefined || v === null || (kind !== "pct" && !v)) return "";
  const val = kind === "pct" ? `<b class="${v >= 0 ? "up" : "down"}">${fmtPct(v)}</b>` : kind === "vol" ? `<b>${v.toLocaleString("lt-LT", { maximumFractionDigits: 0 })} %</b>` : kind === "dy" ? `<b>${v.toLocaleString("lt-LT", { maximumFractionDigits: 2 })} %</b>` : kind === "big" ? `<b>${fmtBig(v, CUR_SIGN[p.cur] || p.cur)}</b>` : `<b>${v.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}</b>`;
  return `<li class="kv"><span>${STAT_TERM[k] ? termHTML(STAT_TERM[k], label) : esc(label)}</span>${val}</li>`;
}
async function pageAsset() {
  const params = new URLSearchParams(location.search);
  const raw = (params.get("s") || params.get("tvwidgetsymbol") || "").toUpperCase().replace(/^X:.*/, "");
  const data = await buildSearch($("#search"));
  const all = data.groups.flatMap((g) => g.items);
  const sym = SYMBOL_RE.test(raw) ? raw : null;

  if (!sym) {
    $("#asset").hidden = true;
    const P = await loadPrices();
    $("#browse").insertAdjacentHTML("beforeend", data.groups
      .map((g) => `<section><h2 class="kicker">${esc(g.title)}</h2><div class="chips">${g.items.filter((a) => !a.s.startsWith("X:")).map((a) => { const p = P.items[a.s]; return `<a class="chip" href="${assetUrl(a.s)}">${esc(a.n)}<span>${esc(a.s.split(":")[1])}</span>${p && p.d1 !== undefined && p.d1 !== null ? `<em class="${p.d1 >= 0 ? "up" : "down"}">${fmtPct(p.d1)}</em>` : ""}</a>`; }).join("")}</div></section>`)
      .join(""));
    return;
  }
  const known = all.find((a) => a.s === sym);
  const name = known ? known.n : sym;
  document.title = `${name} – InvestAI`;
  $("#browse").hidden = true;
  $("#asset-title").textContent = name;
  $("#asset-symbol").textContent = sym;
  $("#asset-meta").textContent = known ? [known.type, `${keyIcon(known.sector)} ${known.sector || ""}`.trim(), `${keyIcon(known.country)} ${known.country || ""}`.trim()].filter((x) => x && x.trim()).join(" · ") : "";
  $("#asset-logo").innerHTML = logoHTML(sym, name, "#1d3a63", 52);
  $("#asset-star").innerHTML = `<button type="button" class="icon-btn search-toggle" aria-label="Ieškoti kito aktyvo">${icon("asset", 22)}</button>` + starHTML(sym, name, true);
  document.body.classList.add("has-asset");
  $(".search-toggle").addEventListener("click", () => { document.body.classList.toggle("show-search"); if (document.body.classList.contains("show-search")) $("#q").focus(); });
  $("#tv-link").href = `https://www.tradingview.com/symbols/${sym.replace(":", "-")}/`;
  $("#ap-actions").innerHTML = `
    <a class="btn" href="irankiai.html?a=${encodeURIComponent(sym)}#jei">O jei būčiau investavęs?</a>
    <a class="btn" href="irankiai.html?c=${encodeURIComponent(sym)}#palyginti">Palyginti su kitu</a>
    <a class="btn" href="strategija.html?check=${encodeURIComponent(sym)}#check-form">Patikrinti pagal mano strategiją</a>`;

  const P = await loadPrices();
  const p = P.items[sym];
  if (p && p.spark) {
    $("#ap-price").textContent = fmtPrice(p.price, p.cur);
    $("#ap-d1").innerHTML = `<span class="pill ${(p.d1 ?? 0) >= 0 ? "pill-up" : "pill-down"}">${fmtPct(p.d1, 2)} per dieną</span>`;
    $("#ap-date").textContent = priceStamp(p);
    mountPriceChart($("#ap-chart"), sym, p, { cur: CUR_SIGN[p.cur] || p.cur });
    $("#ap-range").innerHTML = rangeBarHTML(p.lo52, p.hi52, p.price, CUR_SIGN[p.cur] || p.cur);
    if (p.an && p.an.n) $("#ap-an").innerHTML = analystGaugeHTML(p.an, p.price, CUR_SIGN[p.cur] || p.cur);
    else $("#ap-an-card").hidden = true;
    const today = new Date().toISOString().slice(0, 10);
    const dates = [
      p.ed && p.ed >= today ? `<li class="kv kv-date"><span>${termHTML("rezultatai", "Kiti rezultatai")}</span><b>${fmtShort(p.ed)} <small>${whenLabel(p.ed).toLowerCase()}</small></b></li>` : "",
      p.xd && p.xd >= today ? `<li class="kv kv-date"><span>${termHTML("exdiv", "Dividendų ex data")}</span><b>${fmtShort(p.xd)} <small>${whenLabel(p.xd).toLowerCase()}</small></b></li>` : "",
    ].join("");
    $("#ap-stats").innerHTML = STAT_DEFS.map((d) => statCard(d, p)).join("") + dates;
  } else {
    $("#asset-native").hidden = true;
    $("#w-info").hidden = false;
    tv($("#w-info"), "symbol-info", { symbol: sym, width: "100%" });
  }
  loadExplain().then((ex) => { if (ex[sym]) $("#w-explain").innerHTML = explainHTML(ex[sym]); });
  const chartBox = $("#tv-more");
  const loadChart = () => tv($("#w-chart"), "advanced-chart", {
    symbol: sym, width: "100%", height: 520, interval: "D", timezone: "Europe/Vilnius", theme: currentTheme(),
    style: "1", allow_symbol_change: false, calendar: false, hide_volume: false, support_host: "https://www.tradingview.com",
  });
  if (!p) { chartBox.open = true; loadChart(); } else chartBox.addEventListener("toggle", () => { if (chartBox.open && !$("#w-chart").children.length) loadChart(); });
  const isCrypto = /^(BITSTAMP|BINANCE|COINBASE|KRAKEN|CRYPTO)/.test(sym);
  // Skirtukai: TradingView valdikliai įkeliami tik atidarius skiltį (paslėptame bloke jie neišsidėsto)
  const loaded = new Set();
  const loadTab = (id) => {
    if (loaded.has(id)) return; loaded.add(id);
    if (id === "news") tv($("#w-news"), "timeline", { feedMode: "symbol", symbol: sym, width: "100%", height: 560, displayMode: "regular" });
    if (id === "about") {
      if (isCrypto) $("#fundamentals").hidden = true;
      else { tv($("#w-profile"), "symbol-profile", { symbol: sym, width: "100%", height: 420 }); tv($("#w-fin"), "financials", { symbol: sym, width: "100%", height: 520, displayMode: "regular" }); }
    }
  };
  const showTab = (id) => {
    document.querySelectorAll(".atabs [data-atab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.atab === id)));
    document.querySelectorAll(".atab[data-apanel]").forEach((p) => (p.hidden = p.dataset.apanel !== id));
    loadTab(id);
  };
  document.querySelectorAll(".atabs [data-atab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.atab)));
  if (!(p && p.an && p.an.n) && !(p && p.hi52)) $('.atabs [data-atab="analysts"]').hidden = true;
  // Prilipusi kaina, kai nuslenki žemiau
  if (p) {
    $("#asset-sticky").innerHTML = `${logoHTML(sym, name, "#1d3a63", 28)}<b>${esc(name)}</b><span class="as-price">${fmtPrice(p.price, p.cur)}</span><span class="${(p.d1 ?? 0) >= 0 ? "up" : "down"}">${fmtPct(p.d1, 2)}</span>`;
    const target = $(".ah-price");
    if (window.IntersectionObserver && target) new IntersectionObserver(([en]) => $("#asset-sticky").classList.toggle("on", !en.isIntersecting && en.boundingClientRect.top < 0), { rootMargin: "-60px 0px 0px 0px" }).observe(target);
  }
  // Susijusios naujienos iš InvestAI naujienų sąrašo
  getJSON("data/news.json").then((n) => {
    const st = (n.stories || []).filter((x) => (x.symbols || []).includes(sym));
    if (st.length) $("#ap-news").innerHTML = st.map((x) => `<a class="card news-teaser" href="naujienos.html#${esc(x.id)}"><span class="badge tag">${esc(KIND[x.kind] || "Naujiena")}</span><h3>${esc(x.title)}</h3><p>${esc(x.lead)}</p><span class="go">Faktai ir analitikų nuomonės</span></a>`).join("");
  }).catch(() => {});
}

/* ---------- Naujienos ir įvykiai ---------- */
const KIND = { ipo: "IPO", earnings: "Rezultatai", macro: "Ekonomika", company: "Įmonė", bonds: "Obligacijos", dividend: "Dividendai" };
const CAL_FILTERS = [["all", "Visi"], ["mine", "Mano"], ["earnings", "Rezultatai"], ["dividend", "Dividendai"], ["macro", "Ekonomika"], ["ipo", "IPO"]];
function daysUntil(iso) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + "T00:00:00") - t) / 864e5);
}
function whenLabel(iso) {
  const d = daysUntil(iso);
  return d === 0 ? "Šiandien" : d === 1 ? "Rytoj" : d === -1 ? "Vakar" : d > 1 ? `Po ${d} d.` : `Prieš ${-d} d.`;
}
function eventHTML(e) {
  const [, m, d] = e.date.split("-").map(Number);
  const dd = daysUntil(e.date);
  const ext = /^https?:/.test(e.url || "");
  const link = e.url ? `<a href="${esc(e.url)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(e.title)}</a>` : `<span class="ev-t">${esc(e.title)}</span>`;
  return `<li class="ev ev-${esc(e.kind || "x")}${dd <= 1 && dd >= 0 ? " ev-soon" : ""}${dd < 0 ? " ev-past" : ""}${e.mine ? " ev-mine" : ""}"><time datetime="${esc(e.date)}"><b>${d}</b><span>${MONTHS[m - 1].slice(0, 3)}.</span></time>
    <div><span class="ev-when">${whenLabel(e.date)} · ${esc(KIND[e.kind] || "Įvykis")}${e.mine ? ' · <em>tavo</em>' : ""}</span>${link}</div></li>`;
}
// Įvykiai iš naujienų sąrašo + rezultatų ir dividendų datos iš kainų duomenų (tavo aktyvams ir didžiausioms įmonėms)
function calendarEvents(n, P, all) {
  const mine = new Set([...myHoldings().map((h) => h.s), ...watchList()]);
  const out = (n.events || []).map((e) => ({ ...e, mine: (e.symbols || []).some((s) => mine.has(s)) }));
  const seen = new Set(out.map((e) => `${e.date}|${(e.symbols || [])[0] || e.title}|${e.kind}`));
  const bigCaps = new Set(all.filter((a) => P.items[a.s] && P.items[a.s].mcap).sort((x, y) => P.items[y.s].mcap * (TO_EUR[P.items[y.s].cur] || 1) - P.items[x.s].mcap * (TO_EUR[P.items[x.s].cur] || 1)).slice(0, 40).map((a) => a.s));
  const today = new Date().toISOString().slice(0, 10), horizon = addDays(today, 60);
  all.forEach((a) => {
    const p = P.items[a.s];
    if (!p) return;
    const isMine = mine.has(a.s);
    if (p.ed && p.ed >= addDays(today, -3) && p.ed <= horizon && (isMine || bigCaps.has(a.s) || a.g === "baltic")) {
      const k = `${p.ed}|${a.s}|earnings`;
      if (!seen.has(k)) { seen.add(k); out.push({ date: p.ed, kind: "earnings", title: `${a.n} skelbia rezultatus`, symbols: [a.s], url: assetUrl(a.s), mine: isMine }); }
    }
    if (p.xd && p.xd >= addDays(today, -3) && p.xd <= horizon && (isMine || a.g === "baltic" || bigCaps.has(a.s))) {
      out.push({ date: p.xd, kind: "dividend", title: `${a.n}: paskutinė diena dividendams (ex data)${p.dr ? ` · ${p.dr.toLocaleString("lt-LT")} ${CUR_SIGN[p.cur] || p.cur}/akc. per metus` : ""}`, symbols: [a.s], url: assetUrl(a.s), mine: isMine });
    }
  });
  return out.sort((x, y) => x.date.localeCompare(y.date) || (y.mine - x.mine));
}
function opinionHTML(list, cls, title) {
  if (!list || !list.length) return "";
  return `<div class="op ${cls}"><h4>${title}</h4><ul>${list.map((o) => `<li><b>${esc(o.who)}</b><p>${esc(o.text)}</p>${o.source ? `<small>Šaltinis: ${esc(o.source)}</small>` : ""}</li>`).join("")}</ul></div>`;
}
function storyHTML(st, assets, P) {
  const s = STATUS[st.status] || STATUS.media;
  const syms = (st.symbols || []).map((sym) => {
    const a = assets.find((x) => x.s === sym) || { s: sym, n: sym.split(":")[1] };
    const p = P.items[sym];
    return `<span class="sym-chip"><a href="${assetUrl(sym)}">${logoHTML(sym, a.n, "#1d3a63", 24)}${esc(a.n)}${p ? ` <em class="${(p.d1 ?? 0) >= 0 ? "up" : "down"}">${fmtPct(p.d1)}</em>` : ""}</a>${starHTML(sym, a.n)}</span>`;
  }).join("");
  return `<article class="story card" id="${esc(st.id)}">
    <div class="story-top"><span class="badge tag">${esc(KIND[st.kind] || "Naujiena")}</span><span class="badge ${s.cls}">${s.label}</span><time datetime="${esc(st.date)}">${fmtDate(st.date)}</time></div>
    <h2>${esc(st.title)}</h2>
    ${syms ? `<div class="sym-row">${syms}</div>` : ""}
    <p class="lead">${esc(st.lead)}</p>
    ${st.disclosure ? `<p class="disclosure"><b>Interesų konfliktas.</b> ${esc(st.disclosure)}</p>` : ""}
    <h3 class="story-h">Faktai</h3>
    <ul class="story-facts">${(st.facts || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    ${(st.pro || st.con) ? `<h3 class="story-h">Ką apie tai sako</h3><div class="ops">${opinionHTML(st.pro, "op-pro", "Optimistai")}${opinionHTML(st.con, "op-con", "Skeptikai")}</div>` : ""}
    <details class="story-src"><summary>Šaltiniai (${(st.sources || []).length})</summary><ul>${(st.sources || []).map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>${x.published ? ` <span class="muted">· ${fmtShort(x.published)}</span>` : ""}</li>`).join("")}</ul></details>
    <p class="explain-foot">Nuomonės priklauso jų autoriams ir pateikiamos su šaltiniais. InvestAI jų nevertina ir nepataria, ką pirkti ar parduoti.</p>
  </article>`;
}
async function pageNews() {
  const [n, assets, P] = await Promise.all([getJSON("data/news.json"), allAssets(), loadPrices()]);
  $("#news-updated").textContent = n.updated ? `Atnaujinta ${fmtDate(n.updated)}` : "";
  const today = new Date().toISOString().slice(0, 10);
  const ev = calendarEvents(n, P, assets);
  let f = "all";
  const drawCal = () => {
    const list = ev.filter((e) => e.date >= today && (f === "all" || (f === "mine" ? e.mine : e.kind === f || (f === "macro" && e.kind === "bonds"))));
    $("#events").innerHTML = list.slice(0, 40).map(eventHTML).join("") || `<li class="empty-note">${f === "mine" ? "Tavo aktyvų įvykių artimiausiu metu nėra. Įkelk portfelį arba pažymėk akcijas žvaigždute." : "Įvykių nerasta."}</li>`;
    document.querySelectorAll("#cal-f [data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === f)));
  };
  $("#cal-f").innerHTML = CAL_FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === f}">${l}</button>`).join("");
  $("#cal-f").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { f = b.dataset.f; drawCal(); } });
  drawCal();
  const past = ev.filter((e) => e.date < today && e.date >= addDays(today, -7)).slice(-4).reverse();
  $("#events-past").innerHTML = past.map(eventHTML).join("");
  $("#events-past-wrap").hidden = !past.length;
  $("#stories").innerHTML = (n.stories || []).map((st) => storyHTML(st, assets, P)).join("") || `<p class="muted">Naujienų dar nėra.</p>`;
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 80); }
}

/* ---------- Mano rytas (asmeninė dienos apžvalga) ---------- */
async function pageMorning() {
  const [P, all, n, ex] = await Promise.all([loadPrices(), allAssets(), getJSON("data/news.json").catch(() => ({})), loadExplain()]);
  const nameOf = (s) => (all.find((a) => a.s === s) || {}).n || s.split(":")[1] || s;
  $("#m-greet").textContent = greeting();
  $("#m-date").textContent = todayLong();
  $("#m-stamp").textContent = dataStamp(P);
  $("#m-pulse").innerHTML = marketRows(P);
  const mine = new Set([...myHoldings().map((h) => h.s), ...watchList()]);

  // Portfelis
  const t = portfolioToday(P);
  if (t && t.rows.length) {
    const up = t.chg >= 0;
    $("#m-lead").textContent = `Per paskutinę prekybos dieną tavo portfelis ${up ? "paaugo" : "sumažėjo"} ${eur0(Math.abs(t.chg)).replace(/^[+−]/, "")} (${fmtPct(t.pct, 2)}).`;
    $("#m-portfolio").innerHTML = `<div class="card-head"><h2>Tavo portfelis</h2><a class="card-link" href="portfelis.html">Atidaryti</a></div>
      <div class="me-num"><b class="${up ? "up" : "down"}">${eur0(t.chg)}</b><span class="pill ${up ? "pill-up" : "pill-down"}">${fmtPct(t.pct, 2)}</span><span class="muted small">iš ~${Math.round(t.total).toLocaleString("lt-LT")} €</span></div>
      <ul class="m-rows">${t.rows.map((r) => `<li><a href="${assetUrl(r.s)}">${logoHTML(r.s, nameOf(r.s), "#1d3a63", 32)}<span class="mv-name"><b>${esc(nameOf(r.s))}</b><small>${ex[r.s] ? `<span class="why-dot">Kodėl ${ex[r.s].direction === "up" ? "kilo" : "krito"}?</span>` : esc(r.s.split(":")[1])}</small></span><span class="m-c ${r.c >= 0 ? "up" : "down"}">${eur0(r.c)}</span><span class="pill ${r.d1 >= 0 ? "pill-up" : "pill-down"}">${fmtPct(r.d1)}</span></a></li>`).join("")}</ul>
      ${t.known < t.total ? `<p class="muted small">Dalies pozicijų (pvz., grynųjų ar nežinomų aktyvų) dienos pokytis nežinomas – jos neįskaičiuotos.</p>` : ""}`;
  } else {
    $("#m-portfolio").innerHTML = `<div class="card-head"><h2>Tavo portfelis</h2></div><p class="muted">Įkelk portfelio ekrano nuotrauką – kasdien čia matysi, kiek jis pasikeitė ir kurios pozicijos judėjo labiausiai.</p><a class="btn primary" href="portfelis.html">Įkelti portfelį</a>`;
  }

  // Stebimi
  const wl = watchList().map((s) => all.find((a) => a.s === s) || { s, n: s.split(":")[1] }).filter((a) => P.items[a.s]);
  $("#m-watch").innerHTML = `<div class="card-head"><h2>Stebimi</h2><a class="card-link" href="atranka.html?pf=watch">Atranka</a></div>` +
    (wl.length ? `<ul class="mv-list">${wl.map((a) => moverRow(a, P.items[a.s])).join("")}</ul>` : `<p class="muted">Pažymėk žvaigždute ${starHTML("NASDAQ:NVDA", "Nvidia")} įmones, kurias nori stebėti kasdien.</p>`);

  // DI santrauka iš dienos apžvalgos
  try {
    const idx = await getJSON("data/index.json");
    const d = await getJSON(`data/digests/${idx.latest}.json`);
    const items = (d.sections || []).flatMap((s) => s.items || []);
    const rel = items.filter((it) => (it.tags || []).some((tg) => [...mine].some((s) => s.endsWith(":" + tg))));
    const pick = [...rel, ...items.filter((it) => !rel.includes(it))].slice(0, 4);
    $("#m-ai").innerHTML = `<div class="card-head"><h2><span class="ai-label">${aiMark()} DI santrauka</span></h2><a class="card-link" href="apzvalga.html">Visa apžvalga</a></div>
      <h3 class="m-ai-title">${esc(d.title)}</h3><p>${esc(d.lead)}</p>
      <ul class="latest-list">${pick.map((it) => `<li><span class="badge ${(STATUS[it.status] || STATUS.media).cls}">${(STATUS[it.status] || STATUS.media).label}</span> ${esc(it.headline)}</li>`).join("")}</ul>
      <p class="explain-foot">Santrauką ${fmtShort(d.date)} parengė DI pagal nurodytus šaltinius. Tai ne rekomendacija.</p>`;
  } catch { $("#m-ai").hidden = true; }

  // Kodėl judėjo
  const exList = Object.entries(ex).sort(([a], [b]) => (mine.has(b) - mine.has(a))).slice(0, 4);
  $("#m-why").innerHTML = exList.length ? `<div class="card-head"><h2>Kodėl judėjo?</h2></div><ul class="why-list">${exList.map(([s, e]) => `<li class="ex-${esc(e.direction)}"><a href="${assetUrl(s)}">${logoHTML(s, nameOf(s), "#1d3a63", 32)}<span><b>${esc(nameOf(s))}${mine.has(s) ? ' <em class="mine-tag">tavo</em>' : ""}</b><small>${esc(e.headline)}</small></span><span class="why-move">${esc(e.move || "")}</span></a></li>`).join("")}</ul>` : "";
  $("#m-why").hidden = !exList.length;

  // Kalendorius – 10 dienų, pirmiausia tavo
  const today = new Date().toISOString().slice(0, 10), until = addDays(today, 10);
  const ev = calendarEvents(n, P, all).filter((e) => e.date >= today && e.date <= until);
  const evs = [...ev.filter((e) => e.mine), ...ev.filter((e) => !e.mine)].slice(0, 8).sort((a, b) => a.date.localeCompare(b.date));
  $("#m-cal").innerHTML = `<div class="card-head"><h2>Artimiausios 10 dienų</h2><a class="card-link" href="naujienos.html#kalendorius">Kalendorius</a></div>` + (evs.length ? `<ol class="ev-list">${evs.map(eventHTML).join("")}</ol>` : `<p class="muted">Svarbių įvykių sąraše nėra.</p>`);

  // Naujienos – pirmiausia apie tavo aktyvus
  const stories = (n.stories || []).slice().sort((a, b) => ((b.symbols || []).some((s) => mine.has(s)) - (a.symbols || []).some((s) => mine.has(s))));
  $("#m-news").innerHTML = `<div class="card-head"><h2>Naujienos</h2><a class="card-link" href="naujienos.html">Visos</a></div>` + (stories.length ? `<ul class="m-news">${stories.slice(0, 4).map((st) => `<li><a href="naujienos.html#${esc(st.id)}"><span class="badge tag">${esc(KIND[st.kind] || "Naujiena")}</span>${(st.symbols || []).some((s) => mine.has(s)) ? ' <em class="mine-tag">tavo</em>' : ""}<b>${esc(st.title)}</b><small>${esc(st.lead)}</small></a></li>`).join("")}</ul>` : `<p class="muted">Naujienų nėra.</p>`);

  // Daugiausiai judėjo rinkoje
  const stocks = all.filter((a) => a.type === "Akcija" && P.items[a.s] && P.items[a.s].d1 !== null && P.items[a.s].d1 !== undefined && P.items[a.s].mcap).sort((x, y) => P.items[y.s].d1 - P.items[x.s].d1);
  $("#m-movers").innerHTML = `<div class="card-head"><h2>Rinkoje daugiausiai judėjo</h2><a class="card-link" href="rinkos.html">Žemėlapis</a></div><ul class="mv-list">${[...stocks.slice(0, 3), ...stocks.slice(-3).reverse()].map((a) => moverRow(a, P.items[a.s])).join("")}</ul><p class="muted small">Faktai apie kainų pokyčius, ne pasiūlymai pirkti ar parduoti.</p>`;
}
