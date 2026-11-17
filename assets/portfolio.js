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
    { s: "NASDAQ:NVDA", value: 2500 }, { s: "NASDAQ:AAPL", value: 1500 }, { s: "NASDAQ:MSFT", value: 1000 },
    { s: "XETR:VWCE", value: 2000 }, { s: "OMXVSE:IGN1L", value: 1200 }, { s: "OMXTSE:LHV1T", value: 600 },
    { s: "BITSTAMP:BTCUSD", value: 700 }, { s: CASH, value: 500 },
  ],
  rules: {},
};
const DIM_LABEL = { bySector: "sektorių", byCountry: "šalis", byAsset: "pozicijas", byType: "tipus" };

let ASSETS = [];
let state = { holdings: [], rules: {}, currency: "EUR" };
let draft = [];          // peržiūros eilutės
let isDemo = false;
let dim = "bySector";

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
  return { rows, total, byAsset, bySector: group("sector"), byCountry: group("country"), byType, typeShare };
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
function facts(a) {
  const out = [];
  const pos = a.byAsset.filter((x) => x.s !== CASH);
  if (pos[0]) out.push(`Didžiausia pozicija – <b>${esc(pos[0].k)}</b>, ${pct(pos[0].p)} portfelio.`);
  if (pos.length >= 4) out.push(`3 didžiausios pozicijos kartu sudaro <b>${pct(pos.slice(0, 3).reduce((t, x) => t + x.p, 0))}</b>.`);
  const sec = a.bySector.filter((x) => x.k !== "Grynieji pinigai");
  if (sec[0]) out.push(`Didžiausia sektoriaus grupė – <b>${esc(sec[0].k)}</b>: ${pct(sec[0].p)}.`);
  const ctr = a.byCountry.filter((x) => x.k !== "Be šalies");
  if (ctr[0]) out.push(`Pagal šalį daugiausia – <b>${esc(ctr[0].k)}</b> (${pct(ctr[0].p)})${ctr[1] ? `, toliau ${esc(ctr[1].k)} (${pct(ctr[1].p)})` : ""}.`);
  const parts = [];
  if (a.typeShare("ETF")) parts.push(`ETF fondai – ${pct(a.typeShare("ETF"))}`);
  if (a.typeShare("Kriptovaliuta")) parts.push(`kriptovaliutos – ${pct(a.typeShare("Kriptovaliuta"))}`);
  if (a.typeShare("Grynieji")) parts.push(`grynieji – ${pct(a.typeShare("Grynieji"))}`);
  if (parts.length) out.push(parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".");
  return out;
}

/* ---------- Analizės vaizdas ---------- */
function renderResult() {
  const a = analyze(state.holdings);
  if (a.total <= 0) { show("start"); return; }
  show("result");
  $("#demo-note").hidden = !isDemo;
  $("#r-total").textContent = money(a.total);
  renderDim(a);
  $("#r-facts").innerHTML = facts(a).map((f) => `<li>${f}</li>`).join("");
  renderTable(a);
  renderRules(a);
  renderToday(a);
}
function renderDim(a) {
  a = a || analyze(state.holdings);
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dim === dim)));
  const list = a[dim];
  $("#r-strip").innerHTML = stripHTML(list);
  $("#r-bars").innerHTML = list
    .map((x, i) => `<div class="bar"><span class="bar-label"><i style="background:${i < 7 ? PALETTE[i % PALETTE.length] : "#8c9aab"}"></i><span>${esc(x.k)}</span></span><span class="bar-track"><span style="width:${Math.max(1, x.p * 100).toFixed(1)}%;background:${i < 7 ? PALETTE[i % PALETTE.length] : "#8c9aab"}"></span></span><span class="bar-val">${pct(x.p)}</span></div>`)
    .join("");
}
function renderTable(a) {
  $("#r-table").innerHTML = `<div class="pf-table-wrap"><table class="pf-table">
    <thead><tr><th>Aktyvas</th><th>Sektorius</th><th class="num">Vertė, ${curSym()}</th><th class="num">Dalis</th><th></th></tr></thead>
    <tbody>${state.holdings.map((h, i) => {
      const m = meta(h);
      const name = h.s === CASH ? esc(m.n) : `<a href="${assetUrl(h.s)}">${esc(m.n)}</a>`;
      return `<tr><td>${name}</td><td>${esc(m.sector)}</td>
        <td class="num"><input class="pf-edit" data-i="${i}" type="number" min="0" step="any" value="${Math.round(h.value * 100) / 100}" aria-label="${esc(m.n)} vertė"></td>
        <td class="num">${pct(a.total ? (h.value || 0) / a.total : 0)}</td>
        <td><button class="icon-btn" data-del="${i}" aria-label="Pašalinti ${esc(m.n)}">×</button></td></tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td>Iš viso</td><td></td><td class="num">${money(a.total)}</td><td class="num">100 %</td><td></td></tr></tfoot></table></div>`;
  $("#r-table").querySelectorAll(".pf-edit").forEach((inp) => inp.addEventListener("change", () => {
    state.holdings[+inp.dataset.i].value = Math.max(0, Number(inp.value) || 0);
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
    const syms = a.rows.filter((r) => r.s !== CASH && SYMBOL_RE.test(r.s)).map((r) => ({ name: r.s, displayName: r.n }));
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
function commit() { save(); renderResult(); }

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
  const hit = ASSETS.find((a) => a.n.toLowerCase() === q) || ASSETS.find((a) => a.n.toLowerCase().startsWith(q)) || ASSETS.find((a) => a.n.toLowerCase().includes(q));
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
      else draft.push({ s: row.s, n: row.n, value: Math.round(row.value * 100) / 100, src: row.src, unknown: false });
    }
    for (const u of r.unknown) {
      all++; if (u.cur === "USD") usd++;
      if (!draft.some((d) => d.unknown && d.src === u.text)) draft.push({ s: null, n: "", value: Math.round(u.value * 100) / 100, src: u.text, unknown: true });
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
    <li class="${d.unknown && !d.s ? "unknown" : ""}" data-i="${i}">
      <div class="field"><input type="search" aria-label="Aktyvas" placeholder="Kas tai? Pvz., Apple ar NYSE:KO" value="${esc(d.s ? (d.s === CASH ? "Grynieji pinigai" : d.n || meta(d).n) : "")}"></div>
      <div class="val" data-cur="${cur === "USD" ? "$" : "€"}"><input type="number" min="0" step="any" inputmode="decimal" aria-label="Vertė" value="${d.value}"></div>
      <button class="icon-btn" type="button" aria-label="Pašalinti eilutę">×</button>
      ${d.src ? `<p class="src">Nuotraukoje: „${esc(d.src)}“</p>` : ""}
    </li>`).join("");
  list.querySelectorAll("li").forEach((li) => {
    const i = +li.dataset.i;
    const [nameIn, valIn] = li.querySelectorAll("input");
    picker(nameIn, (s) => {
      draft[i].s = s;
      if (s) { draft[i].n = findAsset(s) ? findAsset(s).n : s === CASH ? "Grynieji pinigai" : ticker(s); li.classList.remove("unknown"); }
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
    if (!d.s && nameIn.value.trim()) d.s = resolveTyped(nameIn.value);
    const v = Number(d.value);
    if (!(v > 0)) return;
    if (!d.s) { missing++; li.classList.add("unknown"); return; }
    items.push({ s: d.s, value: v, ...(findAsset(d.s) || d.s === CASH ? {} : { n: ticker(d.s) }) });
  });
  if (missing) {
    const note = $("#review-note");
    note.hidden = false;
    note.textContent = `${missing} eilutėms nepriskirtas aktyvas. Pasirink aktyvą arba pašalink eilutę.`;
    note.scrollIntoView({ block: "center" });
    return;
  }
  if (!items.length) return;
  const merged = new Map();
  items.forEach((it) => merged.set(it.s, merged.has(it.s) ? { ...it, value: merged.get(it.s).value + it.value } : it));
  isDemo = false;
  state.holdings = [...merged.values()];
  state.currency = $("#v-review").dataset.cur || "EUR";
  draft = [];
  $("#rule-inputs").dataset.ready = "";
  quotesKey = mentionsKey = "";
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
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { dim = b.dataset.dim; renderDim(); }));

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
        holdings: d.holdings.filter((h) => h && typeof h.s === "string" && (h.s === CASH || SYMBOL_RE.test(h.s))).map((h) => ({ ...h, value: Math.max(0, Number(h.value) || 0) })),
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
  setupInputs();
  if (new URLSearchParams(location.search).has("pavyzdys")) {
    isDemo = true;
    state = JSON.parse(JSON.stringify(DEMO));
    renderResult();
    return;
  }
  load();
  if (state.holdings.length) renderResult(); else show("start");
});
