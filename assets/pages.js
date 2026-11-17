// InvestAI – puslapiai su savais vizualais: pradžia, rinkos, aktyvas, naujienos.
"use strict";

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

/* ---------- Pradžia ---------- */
async function pageHome() {
  $("#home-help").innerHTML = helpHTML();
  $("#demo-strip").innerHTML = stripHTML([
    { k: "Technologijos", p: 0.5 }, { k: "Pasaulio indeksas", p: 0.2 }, { k: "Komunalinės", p: 0.12 },
    { k: "Kriptovaliutos", p: 0.07 }, { k: "Finansai", p: 0.06 }, { k: "Grynieji", p: 0.05 },
  ]);
  homeToday().catch((e) => console.error(e));
  homeNews().catch((e) => console.error(e));
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
const PULSE = [["AMEX:SPY", "S&P 500", "SPY"], ["NASDAQ:QQQ", "Nasdaq 100", "QQQ"], ["XETR:VWCE", "Pasaulio akcijos", "VWCE"], ["AMEX:GLD", "Auksas", "GLD"], ["BITSTAMP:BTCUSD", "Bitcoin", "BTC"]];
async function homeToday() {
  const [P, all] = await Promise.all([loadPrices(), allAssets()]);
  const items = P.items;
  $("#today-date").textContent = lastDateLabel(P);
  $("#pulse").innerHTML = PULSE.filter(([s]) => items[s]).map(([s, n, t]) => {
    const p = items[s];
    return `<a class="pulse-item" href="${assetUrl(s)}"><span class="pulse-name">${esc(n)} <small>${t}</small></span><b>${fmtPrice(p.price, p.cur)}</b><span class="${(p.d1 ?? 0) >= 0 ? "up" : "down"}">${fmtPct(p.d1, 2)}</span>${sparkSVG(sparkTail(p.spark, 0.09), 120, 28)}</a>`;
  }).join("");
  const stocks = all.filter((a) => a.type === "Akcija" && items[a.s] && items[a.s].d1 !== null && items[a.s].d1 !== undefined);
  const sorted = [...stocks].sort((x, y) => items[y.s].d1 - items[x.s].d1);
  $("#gainers").innerHTML = sorted.slice(0, 5).map((a) => moverRow(a, items[a.s])).join("");
  $("#losers").innerHTML = sorted.slice(-5).reverse().map((a) => moverRow(a, items[a.s])).join("");
  const renderWatch = () => {
    const wl = watchList().map((s) => all.find((a) => a.s === s) || { s, n: s.split(":")[1] }).filter((a) => items[a.s]);
    $("#watch-home").innerHTML = wl.length
      ? `<div class="card"><h3>Mano stebimi</h3><ul class="mv-list">${wl.map((a) => moverRow(a, items[a.s])).join("")}</ul></div>`
      : `<div class="card watch-empty"><h3>Mano stebimi</h3><p class="muted">Pažymėk žvaigždute ${starHTML("NASDAQ:NVDA", "Nvidia")} bet kurią įmonę – čia matysi jos kainą kasdien.</p></div>`;
  };
  renderWatch();
  document.addEventListener("watchchange", renderWatch);
}
async function homeNews() {
  const n = await getJSON("data/news.json");
  const today = new Date().toISOString().slice(0, 10);
  const next = (n.events || []).filter((e) => e.date >= today).slice(0, 4);
  const st = (n.stories || [])[0];
  $("#home-news").innerHTML = `
    ${st ? `<a class="card news-teaser" href="naujienos.html#${esc(st.id)}"><span class="badge tag">${esc(KIND[st.kind] || "Naujiena")}</span><h3>${esc(st.title)}</h3><p>${esc(st.lead)}</p><span class="go">Ką apie tai sako analitikai</span></a>` : ""}
    <div class="card"><h3>Artimiausi įvykiai</h3><ol class="ev-list">${next.map(eventHTML).join("")}</ol><a class="btn small" href="naujienos.html">Visi įvykiai</a></div>`;
}

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
    const items = all.filter((a) => a.type === "Akcija" && P.items[a.s] && P.items[a.s].mcap && (reg === "Visi" || regionOf(a) === reg)).map((a) => {
      const p = P.items[a.s];
      return { label: a.s.split(":")[1].replace(/\..*/, ""), sub: fmtPct(p[key]), v: p.mcap * (TO_EUR[p.cur] || 1), c: p[key], href: assetUrl(a.s), title: `${a.n}: ${fmtPct(p[key])}`, group: a.sector || "Kita" };
    });
    box.innerHTML = items.length ? treemapHTML(items, { groups: true, scale, ratio: window.innerWidth < 680 ? 1.25 : 0.56 }) : `<p class="muted">Duomenų nėra.</p>`;
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
function statCard([k, label, kind, help], p) {
  const v = p[k];
  if (v === undefined || v === null || (kind !== "pct" && !v)) return "";
  const val = kind === "pct" ? `<b class="${v >= 0 ? "up" : "down"}">${fmtPct(v)}</b>` : kind === "vol" ? `<b>${v.toLocaleString("lt-LT", { maximumFractionDigits: 0 })} %</b>` : kind === "dy" ? `<b>${v.toLocaleString("lt-LT", { maximumFractionDigits: 2 })} %</b>` : kind === "big" ? `<b>${fmtBig(v, CUR_SIGN[p.cur] || p.cur)}</b>` : `<b>${v.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}</b>`;
  return `<div class="stat"><span>${esc(label)}</span>${val}${help ? `<small>${esc(help)}</small>` : ""}</div>`;
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
  $("#asset-meta").textContent = known ? [known.type, known.sector, known.country].filter(Boolean).join(" · ") : "";
  $("#asset-logo").innerHTML = logoHTML(sym, name, "#1d3a63", 52);
  $("#asset-star").innerHTML = starHTML(sym, name, true);
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
    $("#ap-date").textContent = p.date ? `Uždarymo kaina, ${fmtShort(p.date)}` : "";
    mountPriceChart($("#ap-chart"), p.spark, { endDate: p.date, cur: CUR_SIGN[p.cur] || p.cur });
    $("#ap-range").innerHTML = rangeBarHTML(p.lo52, p.hi52, p.price, CUR_SIGN[p.cur] || p.cur);
    if (p.an && p.an.n) $("#ap-an").innerHTML = analystGaugeHTML(p.an, p.price, CUR_SIGN[p.cur] || p.cur);
    else $("#ap-an-card").hidden = true;
    $("#ap-stats").innerHTML = STAT_DEFS.map((d) => statCard(d, p)).join("");
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
  if (isCrypto) $("#fundamentals").hidden = true;
  else {
    tv($("#w-profile"), "symbol-profile", { symbol: sym, width: "100%", height: 420 });
    tv($("#w-fin"), "financials", { symbol: sym, width: "100%", height: 520, displayMode: "regular" });
  }
  tv($("#w-news"), "timeline", { feedMode: "symbol", symbol: sym, width: "100%", height: 520, displayMode: "regular" });
  // Susijusios naujienos iš InvestAI naujienų sąrašo
  getJSON("data/news.json").then((n) => {
    const st = (n.stories || []).filter((x) => (x.symbols || []).includes(sym));
    if (st.length) $("#ap-news").innerHTML = st.map((x) => `<a class="card news-teaser" href="naujienos.html#${esc(x.id)}"><span class="badge tag">${esc(KIND[x.kind] || "Naujiena")}</span><h3>${esc(x.title)}</h3><p>${esc(x.lead)}</p><span class="go">Faktai ir analitikų nuomonės</span></a>`).join("");
  }).catch(() => {});
}

/* ---------- Naujienos ir įvykiai ---------- */
const KIND = { ipo: "IPO", earnings: "Rezultatai", macro: "Ekonomika", company: "Įmonė", bonds: "Obligacijos", dividend: "Dividendai" };
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
  const soon = daysUntil(e.date) <= 1 && daysUntil(e.date) >= 0;
  return `<li class="ev${soon ? " ev-soon" : ""}${daysUntil(e.date) < 0 ? " ev-past" : ""}"><time datetime="${esc(e.date)}"><b>${d}</b><span>${MONTHS[m - 1].slice(0, 3)}.</span></time>
    <div><span class="ev-when">${whenLabel(e.date)} · ${esc(KIND[e.kind] || "Įvykis")}</span><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a></div></li>`;
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
  const ev = (n.events || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = ev.filter((e) => e.date >= today), past = ev.filter((e) => e.date < today).slice(-3).reverse();
  $("#events").innerHTML = upcoming.map(eventHTML).join("") || `<li class="muted">Artimiausių įvykių sąraše nėra.</li>`;
  $("#events-past").innerHTML = past.map(eventHTML).join("");
  $("#events-past-wrap").hidden = !past.length;
  $("#stories").innerHTML = (n.stories || []).map((st) => storyHTML(st, assets, P)).join("") || `<p class="muted">Naujienų dar nėra.</p>`;
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50); }
}
