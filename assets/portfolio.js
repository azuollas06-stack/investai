// InvestAI – „Mano portfelis“. Viskas skaičiuojama naršyklėje, duomenys saugomi localStorage.
// Naudoja bendrus pagalbininkus iš app.js: $, esc, getJSON, tv, assetUrl, SYMBOL_RE, fmtDate, isDate.
"use strict";

const PF_KEY = "investai.portfolio.v1";
const SECTORS = ["Technologijos", "Komunikacijos", "Finansai", "Sveikatos apsauga", "Nebūtinos vartojimo prekės", "Būtinos vartojimo prekės", "Pramonė", "Energetika", "Komunalinės paslaugos", "Nekilnojamasis turtas", "Žaliavos", "Platus JAV indeksas", "Pasaulio indeksas", "JAV technologijų indeksas", "Auksas", "Kriptovaliutos", "Grynieji pinigai", "Kita"];
const COUNTRIES = ["JAV", "Lietuva", "Estija", "Latvija", "Europa", "Pasaulis", "Be šalies", "Kita"];
const TYPES = ["Akcija", "ETF", "Kriptovaliuta", "Auksas", "Obligacijos", "Grynieji", "Kita"];
const CASH = "CASH:EUR";
const RULES = [
  { id: "maxAsset", label: "Viena pozicija – ne daugiau kaip", unit: "%", kind: "max", group: "asset" },
  { id: "maxSector", label: "Vienas sektorius – ne daugiau kaip", unit: "%", kind: "max", group: "sector" },
  { id: "maxCountry", label: "Viena šalis – ne daugiau kaip", unit: "%", kind: "max", group: "country" },
  { id: "maxCrypto", label: "Kriptovaliutos – ne daugiau kaip", unit: "%", kind: "maxType", type: "Kriptovaliuta" },
  { id: "minFunds", label: "ETF ir fondai – ne mažiau kaip", unit: "%", kind: "minType", type: "ETF" },
  { id: "minCash", label: "Grynieji pinigai – ne mažiau kaip", unit: "%", kind: "minType", type: "Grynieji" },
];
const DEMO = [
  { s: "NASDAQ:NVDA", value: 2500 }, { s: "NASDAQ:AAPL", value: 1500 }, { s: "NASDAQ:MSFT", value: 1000 },
  { s: "XETR:EUNL", value: 2000 }, { s: "OMXVSE:IGN1L", value: 1200 }, { s: "OMXTSE:LHV1T", value: 600 },
  { s: "BITSTAMP:BTCUSD", value: 700 }, { s: CASH, value: 500 },
];

let ASSETS = [];
let state = { holdings: [], rules: {} };
let lastQuoteKey = "";

/* ---------- Saugojimas ---------- */
function load() {
  try {
    const raw = localStorage.getItem(PF_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.holdings)) state = { holdings: d.holdings, rules: d.rules || {} };
    }
  } catch (e) { console.warn("localStorage nepasiekiamas", e); }
}
function save() {
  try { localStorage.setItem(PF_KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
}

/* ---------- Pagalbininkai ---------- */
const eur = (v) => new Intl.NumberFormat("lt-LT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const pct = (v) => `${(v * 100).toLocaleString("lt-LT", { maximumFractionDigits: 1, minimumFractionDigits: v < 0.1 ? 1 : 0 })} %`;
const ticker = (s) => s.split(":")[1] || s;
const findAsset = (s) => ASSETS.find((a) => a.s === s);
function meta(h) {
  if (h.s === CASH) return { n: "Grynieji pinigai", sector: "Grynieji pinigai", country: "Be šalies", type: "Grynieji" };
  const a = findAsset(h.s);
  return {
    n: h.n || (a && a.n) || h.s,
    sector: h.sector || (a && a.sector) || "Kita",
    country: h.country || (a && a.country) || "Kita",
    type: h.type || (a && a.type) || "Kita",
  };
}

/* ---------- Analizė ---------- */
function analyze(holdings) {
  const rows = holdings.filter((h) => h.value > 0).map((h) => ({ ...h, ...meta(h) }));
  const total = rows.reduce((t, r) => t + r.value, 0);
  const group = (key) => {
    const m = new Map();
    rows.forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + r.value));
    return [...m.entries()].map(([k, v]) => ({ k, v, p: total ? v / total : 0 })).sort((a, b) => b.v - a.v);
  };
  const byAsset = rows.map((r) => ({ k: r.n, s: r.s, v: r.value, p: total ? r.value / total : 0 })).sort((a, b) => b.v - a.v);
  const bySector = group("sector"), byCountry = group("country"), byType = group("type");
  const typeShare = (t) => (byType.find((x) => x.k === t) || { p: 0 }).p;
  // Fondams priskiriami ETF ir auksas
  const fundsShare = typeShare("ETF");
  return { rows, total, byAsset, bySector, byCountry, byType, typeShare, fundsShare };
}
function checkRules(a, rules) {
  const out = [];
  for (const r of RULES) {
    const lim = Number(rules[r.id]);
    if (!rules[r.id] && rules[r.id] !== 0) continue;
    if (!isFinite(lim)) continue;
    const L = lim / 100;
    if (r.kind === "max") {
      const list = r.group === "asset" ? a.byAsset.filter((x) => x.s !== CASH) : r.group === "sector" ? a.bySector.filter((x) => x.k !== "Grynieji pinigai") : a.byCountry.filter((x) => x.k !== "Be šalies");
      const over = list.filter((x) => x.p > L + 1e-9);
      out.push({ rule: r, lim, ok: over.length === 0, detail: over.length ? over.map((x) => `${x.k}: ${pct(x.p)}`).join(", ") : list.length ? `didžiausia – ${list[0].k}: ${pct(list[0].p)}` : "" });
    } else {
      const share = r.type === "ETF" ? a.fundsShare : a.typeShare(r.type);
      const ok = r.kind === "maxType" ? share <= L + 1e-9 : share >= L - 1e-9;
      out.push({ rule: r, lim, ok, detail: `dabar ${pct(share)}` });
    }
  }
  return out;
}

/* ---------- Atvaizdavimas ---------- */
function bars(title, list, limit = 8) {
  const shown = list.slice(0, limit);
  const rest = list.slice(limit).reduce((t, x) => t + x.p, 0);
  return `<div class="pf-bar-group"><h3>${esc(title)}</h3>${shown
    .map((x) => `<div class="pf-bar"><span class="pf-bar-label">${esc(x.k)}</span><span class="pf-bar-track"><span style="width:${Math.max(1, x.p * 100).toFixed(1)}%"></span></span><span class="pf-bar-val">${pct(x.p)}</span></div>`)
    .join("")}${rest > 0 ? `<div class="pf-bar muted"><span class="pf-bar-label">Kiti</span><span class="pf-bar-track"><span style="width:${(rest * 100).toFixed(1)}%"></span></span><span class="pf-bar-val">${pct(rest)}</span></div>` : ""}</div>`;
}

function renderTable(a) {
  const el = $("#pf-table");
  if (!state.holdings.length) {
    el.innerHTML = `<div class="pf-empty card"><p><b>Dar nėra pozicijų.</b> Pridėk savo aktyvus viršuje – užtenka pavadinimo ir vertės eurais.</p><p class="muted">Nori pirmiausia pamatyti, kaip tai veikia? <button type="button" class="linkish" id="pf-demo">Įkelti pavyzdinį portfelį</button> (išgalvotas, tik demonstracijai).</p></div>`;
    $("#pf-demo").addEventListener("click", () => { state.holdings = DEMO.map((d) => ({ ...d })); commit(); });
    return;
  }
  el.innerHTML = `<div class="pf-table-wrap"><table class="pf-table">
    <thead><tr><th>Aktyvas</th><th>Sektorius</th><th>Šalis</th><th class="num">Vertė, €</th><th class="num">Dalis</th><th></th></tr></thead>
    <tbody>${state.holdings.map((h, i) => {
      const m = meta(h);
      const p = a.total ? (h.value || 0) / a.total : 0;
      const link = h.s === CASH ? esc(m.n) : `<a href="${assetUrl(h.s)}">${esc(m.n)}</a> <span class="muted mono">${esc(ticker(h.s))}</span>`;
      return `<tr><td>${link}</td><td>${esc(m.sector)}</td><td>${esc(m.country)}</td>
        <td class="num"><input class="pf-edit" data-i="${i}" type="number" min="0" step="any" value="${h.value}" aria-label="${esc(m.n)} vertė"></td>
        <td class="num">${pct(p)}</td>
        <td><button class="pf-del" data-i="${i}" aria-label="Pašalinti ${esc(m.n)}">×</button></td></tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td>Iš viso</td><td></td><td></td><td class="num">${eur(a.total)}</td><td class="num">100 %</td><td></td></tr></tfoot>
  </table></div>`;
  el.querySelectorAll(".pf-edit").forEach((inp) => inp.addEventListener("change", () => {
    state.holdings[+inp.dataset.i].value = Math.max(0, Number(inp.value) || 0);
    commit();
  }));
  el.querySelectorAll(".pf-del").forEach((b) => b.addEventListener("click", () => {
    state.holdings.splice(+b.dataset.i, 1);
    commit();
  }));
}

function renderXray(a) {
  const top = a.byAsset.filter((x) => x.s !== CASH);
  const top3 = top.slice(0, 3).reduce((t, x) => t + x.p, 0);
  $("#pf-stats").innerHTML = [
    ["Vertė", eur(a.total)],
    ["Pozicijų", String(a.rows.length)],
    ["Didžiausia pozicija", top[0] ? `${pct(top[0].p)}<small>${esc(top[0].k)}</small>` : "–"],
    ["3 didžiausios kartu", top.length ? pct(top3) : "–"],
  ].map(([k, v]) => `<div class="pf-stat"><span>${k}</span><b>${v}</b></div>`).join("");
  $("#pf-bars").innerHTML =
    bars("Pagal aktyvą", a.byAsset) + bars("Pagal sektorių", a.bySector) + bars("Pagal šalį", a.byCountry) + bars("Pagal tipą", a.byType);
}

function renderRules(a) {
  const box = $("#pf-rule-inputs");
  if (!box.dataset.ready) {
    box.innerHTML = RULES.map((r) => `<label class="pf-rule"><span>${r.label}</span><span class="pf-rule-in"><input type="number" min="0" max="100" step="any" data-rule="${r.id}" value="${state.rules[r.id] ?? ""}" placeholder="–"> ${r.unit}</span></label>`).join("");
    box.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
      const v = inp.value.trim();
      if (v === "") delete state.rules[inp.dataset.rule];
      else state.rules[inp.dataset.rule] = Number(v);
      save();
      renderChecks(analyze(state.holdings));
    }));
    box.dataset.ready = "1";
  }
  renderChecks(a);
}
function renderChecks(a) {
  const checks = checkRules(a, state.rules);
  $("#pf-checks").innerHTML = checks.length
    ? checks.map((c) => `<li class="${c.ok ? "ok" : "warn"}"><b>${c.ok ? "✓ Atitinka" : "⚠ Neatitinka tavo taisyklės"}</b> · ${esc(c.rule.label.toLowerCase())} ${c.lim} %${c.detail ? ` <span class="muted">(${esc(c.detail)})</span>` : ""}</li>`).join("")
    : `<li class="muted">Kol kas nenustatei jokių taisyklių.</li>`;
}

function renderQuotes(a) {
  const syms = a.rows.filter((r) => r.s !== CASH && SYMBOL_RE.test(r.s)).map((r) => ({ name: r.s, displayName: r.n }));
  const key = syms.map((s) => s.name).sort().join(",");
  if (key === lastQuoteKey) return;
  lastQuoteKey = key;
  if (!syms.length) { $("#pf-quotes").innerHTML = `<p class="muted">Pridėk aktyvų, kad matytum jų kainas.</p>`; return; }
  tv($("#pf-quotes"), "market-quotes", { width: "100%", height: Math.min(120 + syms.length * 46, 640), showSymbolLogo: true, symbolsGroups: [{ name: "Mano aktyvai", symbols: syms }] });
}

let mentionsKey = "";
async function renderMentions(a) {
  const el = $("#pf-mentions");
  const mine = a.rows.filter((r) => r.s !== CASH);
  const key = mine.map((r) => r.s).sort().join(",");
  if (key === mentionsKey) return;
  mentionsKey = key;
  if (!mine.length) { el.innerHTML = `<p class="muted">Pridėk aktyvų, kad matytum, kada jie minimi apžvalgose.</p>`; return; }
  try {
    const idx = await getJSON("data/index.json");
    const digests = await Promise.all(idx.digests.slice(0, 30).map((x) => getJSON(`data/digests/${x.date}.json`).catch(() => null)));
    const hits = [];
    for (const d of digests.filter(Boolean)) {
      for (const sec of d.sections || []) for (const it of sec.items || []) {
        const tags = (it.tags || []).map((t) => t.toUpperCase());
        const hay = `${it.headline} ${it.text}`.toLowerCase();
        const match = mine.find((r) => tags.includes(ticker(r.s).toUpperCase()) || (r.n.length > 3 && hay.includes(r.n.toLowerCase().split(" (")[0])));
        if (match) hits.push({ d, it, match });
      }
    }
    el.innerHTML = hits.length
      ? `<ul class="pf-mentions">${hits.map(({ d, it, match }) => `<li><time>${fmtShort(d.date)}</time> <span class="badge tag">${esc(ticker(match.s))}</span> <a href="apzvalga.html?d=${d.date}">${esc(it.headline)}</a></li>`).join("")}</ul>`
      : `<p class="muted">Paskutinėse apžvalgose tavo aktyvai neminėti. Naujienų srautą apie kiekvieną aktyvą rasi jo puslapyje.</p>`;
  } catch (e) {
    el.innerHTML = `<p class="muted">Apžvalgų įkelti nepavyko.</p>`;
  }
}

function render() {
  const a = analyze(state.holdings);
  renderTable(a);
  $("#pf-results").hidden = a.total <= 0;
  if (a.total > 0) {
    renderXray(a);
    renderRules(a);
    renderQuotes(a);
    renderMentions(a);
  }
}
function commit() { save(); render(); }

/* ---------- Paieška (pridėjimui ir „kas būtų jei“) ---------- */
function attachPicker(input, onPick) {
  const list = input.parentElement.querySelector(".suggest");
  let picked = null;
  const show = () => {
    const q = input.value.trim().toLowerCase();
    picked = null;
    onPick(null, input.value);
    if (!q) return (list.hidden = true);
    const pool = [...state.holdings.map((h) => ({ s: h.s, n: meta(h).n })), ...ASSETS].filter((a, i, arr) => arr.findIndex((b) => b.s === a.s) === i);
    const hits = pool.filter((a) => a.n.toLowerCase().includes(q) || a.s.toLowerCase().includes(q)).slice(0, 7);
    const raw = q.toUpperCase();
    if (SYMBOL_RE.test(raw) && !hits.some((h) => h.s === raw)) hits.push({ s: raw, n: "Kitas aktyvas" });
    list.innerHTML = hits.length
      ? hits.map((h) => `<li><a href="#" data-s="${esc(h.s)}"><b>${esc(h.n)}</b><span>${esc(h.s)}</span></a></li>`).join("")
      : `<li class="muted">Nerasta. Įvesk BIRŽA:SIMBOLIS, pvz., NYSE:KO</li>`;
    list.hidden = false;
  };
  input.addEventListener("input", show);
  input.addEventListener("focus", () => input.value && show());
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-s]");
    if (!a) return;
    e.preventDefault();
    picked = a.dataset.s;
    const known = findAsset(picked) || state.holdings.find((h) => h.s === picked);
    input.value = known ? (known.n || meta(known).n) : picked;
    list.hidden = true;
    onPick(picked, input.value);
  });
  document.addEventListener("click", (e) => { if (!input.parentElement.contains(e.target)) list.hidden = true; });
  document.addEventListener("focusin", (e) => { if (!input.parentElement.contains(e.target)) list.hidden = true; });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") list.hidden = true; });
  return () => picked || (SYMBOL_RE.test(input.value.trim().toUpperCase()) ? input.value.trim().toUpperCase() : null);
}

function setupAdd() {
  const fill = (sel, opts) => ($(sel).innerHTML = opts.map((o) => `<option>${esc(o)}</option>`).join(""));
  fill("#pf-sector", SECTORS); fill("#pf-country", COUNTRIES); fill("#pf-type", TYPES);
  $("#pf-sector").value = "Kita"; $("#pf-country").value = "Kita"; $("#pf-type").value = "Akcija";
  const custom = document.querySelectorAll(".pf-custom");
  const getPicked = attachPicker($("#pf-q"), (sym) => {
    const unknown = sym && !findAsset(sym) && !state.holdings.some((h) => h.s === sym);
    custom.forEach((c) => (c.hidden = !unknown));
  });
  $("#pf-q").addEventListener("input", () => {
    const raw = $("#pf-q").value.trim().toUpperCase();
    const unknown = SYMBOL_RE.test(raw) && !findAsset(raw);
    custom.forEach((c) => (c.hidden = !unknown));
  });
  $("#pf-add").addEventListener("submit", (e) => {
    e.preventDefault();
    let sym = getPicked();
    if (!sym) {
      const q = $("#pf-q").value.trim().toLowerCase();
      const hit = ASSETS.find((a) => a.n.toLowerCase() === q) || ASSETS.find((a) => a.n.toLowerCase().includes(q) && q.length > 1);
      sym = hit && hit.s;
    }
    const value = Number($("#pf-val").value);
    if (!sym) return alertField($("#pf-q"), "Pasirink aktyvą iš sąrašo arba įvesk BIRŽA:SIMBOLIS");
    if (!(value > 0)) return alertField($("#pf-val"), "Įvesk vertę eurais");
    const existing = state.holdings.find((h) => h.s === sym);
    if (existing) existing.value = (existing.value || 0) + value;
    else {
      const h = { s: sym, value };
      if (!findAsset(sym)) Object.assign(h, { n: ticker(sym), sector: $("#pf-sector").value, country: $("#pf-country").value, type: $("#pf-type").value });
      state.holdings.push(h);
    }
    $("#pf-q").value = ""; $("#pf-val").value = "";
    custom.forEach((c) => (c.hidden = true));
    $("#pf-sector").value = "Kita"; $("#pf-country").value = "Kita"; $("#pf-type").value = "Akcija";
    commit();
    $("#pf-q").focus();
  });
  $("#pf-cash").addEventListener("click", () => {
    const v = Number(prompt("Kiek grynųjų pinigų (€) nori įtraukti?", "500"));
    if (!(v > 0)) return;
    const c = state.holdings.find((h) => h.s === CASH);
    if (c) c.value += v; else state.holdings.push({ s: CASH, value: v });
    commit();
  });
}
function alertField(input, msg) {
  input.setCustomValidity(msg);
  input.reportValidity();
  setTimeout(() => input.setCustomValidity(""), 2500);
}

/* ---------- Kas būtų, jei ---------- */
function setupWhatIf() {
  const getPicked = attachPicker($("#pf-wi-q"), () => {});
  $("#pf-wi").addEventListener("submit", (e) => {
    e.preventDefault();
    let sym = getPicked();
    if (!sym) {
      const q = $("#pf-wi-q").value.trim().toLowerCase();
      const hit = state.holdings.map((h) => ({ s: h.s, n: meta(h).n })).concat(ASSETS).find((a) => a.n.toLowerCase().includes(q) && q.length > 1);
      sym = hit && hit.s;
    }
    const delta = Number($("#pf-wi-val").value);
    if (!sym) return alertField($("#pf-wi-q"), "Pasirink aktyvą");
    if (!delta) return alertField($("#pf-wi-val"), "Įvesk sumą, pvz., 500 arba -300");
    const after = state.holdings.map((h) => ({ ...h }));
    const ex = after.find((h) => h.s === sym);
    if (ex) ex.value = Math.max(0, (ex.value || 0) + delta);
    else if (delta > 0) after.push({ s: sym, value: delta, ...(findAsset(sym) ? {} : { n: ticker(sym) }) });
    const A = analyze(state.holdings), B = analyze(after);
    const m = meta(ex || { s: sym });
    const share = (an, key, k) => ((key === "asset" ? an.byAsset.find((x) => x.s === sym) : an[key].find((x) => x.k === k)) || { p: 0 }).p;
    const rows = [
      [`${m.n} dalis`, share(A, "asset"), share(B, "asset")],
      [`Sektorius „${m.sector}“`, share(A, "bySector", m.sector), share(B, "bySector", m.sector)],
      [`Šalis „${m.country}“`, share(A, "byCountry", m.country), share(B, "byCountry", m.country)],
      [`Tipas „${m.type}“`, share(A, "byType", m.type), share(B, "byType", m.type)],
    ];
    const cA = checkRules(A, state.rules), cB = checkRules(B, state.rules);
    const changes = cB.map((c, i) => ({ c, was: cA[i] && cA[i].ok })).filter((x) => x.c.ok !== x.was);
    $("#pf-wi-out").innerHTML = `
      <div class="card pf-wi-card">
        <p><b>${delta > 0 ? "Pridėjus" : "Sumažinus"} ${eur(Math.abs(delta))} – ${esc(m.n)}</b> · portfelis ${eur(A.total)} → ${eur(B.total)}</p>
        <table class="pf-table"><thead><tr><th></th><th class="num">Dabar</th><th class="num">Po pokyčio</th></tr></thead>
        <tbody>${rows.map(([k, x, y]) => `<tr><td>${esc(k)}</td><td class="num">${pct(x)}</td><td class="num"><b>${pct(y)}</b> <span class="muted">${y > x ? "↑" : y < x ? "↓" : ""}</span></td></tr>`).join("")}</tbody></table>
        ${cB.length
          ? changes.length
            ? `<ul class="pf-checks">${changes.map(({ c }) => `<li class="${c.ok ? "ok" : "warn"}"><b>${c.ok ? "✓ Pradėtų atitikti" : "⚠ Nebeatitiktų"}</b> tavo taisyklės: ${esc(c.rule.label.toLowerCase())} ${c.lim} %</li>`).join("")}</ul>`
            : `<p class="muted">Tavo taisyklių atitiktis nepasikeistų.</p>`
          : `<p class="muted">Nustatyk taisykles 3 skiltyje, kad matytum, kaip pokytis jas paveiktų.</p>`}
      </div>`;
  });
}

/* ---------- Eksportas / importas ---------- */
function setupData() {
  $("#pf-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "InvestAI", version: 1, exported: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "investai-portfelis.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#pf-import-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.holdings)) throw new Error("bad");
      state = {
        holdings: d.holdings.filter((h) => h && typeof h.s === "string" && (h.s === CASH || SYMBOL_RE.test(h.s))).map((h) => ({ ...h, value: Math.max(0, Number(h.value) || 0) })),
        rules: d.rules && typeof d.rules === "object" ? d.rules : {},
      };
      $("#pf-rule-inputs").dataset.ready = "";
      commit();
    } catch { alert("Nepavyko nuskaityti failo. Ar tai InvestAI eksportas?"); }
    e.target.value = "";
  });
  $("#pf-clear").addEventListener("click", () => {
    if (!confirm("Ištrinti visas pozicijas ir taisykles šioje naršyklėje?")) return;
    state = { holdings: [], rules: {} };
    $("#pf-rule-inputs").dataset.ready = "";
    commit();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page !== "portfolio") return;
  try {
    const data = await getJSON("data/assets.json");
    ASSETS = data.groups.flatMap((g) => g.items);
  } catch (e) { console.error(e); }
  load();
  setupAdd();
  setupWhatIf();
  setupData();
  render();
});
