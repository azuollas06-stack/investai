// InvestAI – „Strategija“: pasirinktas paskirstymas + naujos sumos paskirstymas pagal vartotojo taisykles.
// Naudoja portfolio.js (state, analyze, meta, money, pct, signed, signedPct, checkRules, isTv, picker, resolveTyped, load, save)
// ir pf-insights.js (PFI). Nieko nerekomenduoja – tik mechaniškai pritaiko vartotojo pasirinktą planą.
"use strict";

const BUCKETS = [
  { id: "stocks", name: "Akcijos ir akcijų fondai", color: "#4f8cff" },
  { id: "bonds", name: "Obligacijos", color: "#2c8c99" },
  { id: "cash", name: "Grynieji ir pinigų rinka", color: "#8c9aab" },
  { id: "gold", name: "Auksas", color: "#a07a2c" },
  { id: "crypto", name: "Kriptovaliutos", color: "#e39b1b" },
];
// Bendri pavyzdžiai (apytiksliai istoriniai kritimai pasauliniam portfeliui eurais)
const MODELS = [
  { id: "m100", name: "Visos akcijos", t: { stocks: 100 }, dd08: -55, dd22: -25, desc: "Tik plačios akcijos. Didžiausias augimo potencialas ir didžiausi svyravimai." },
  { id: "m80", name: "Augimo 80/20", t: { stocks: 80, bonds: 20 }, dd08: -43, dd22: -22, desc: "Daugiausia akcijų, dalis obligacijų šiek tiek sušvelnina kritimus." },
  { id: "m60", name: "Subalansuota 60/40", t: { stocks: 60, bonds: 40 }, dd08: -30, dd22: -20, desc: "Klasikinis paskirstymas: akcijos augimui, obligacijos stabilumui." },
  { id: "m40", name: "Atsargi 40/60", t: { stocks: 40, bonds: 50, cash: 10 }, dd08: -18, dd22: -17, desc: "Mažiau svyruoja, bet ir ilgainiui paprastai mažiau uždirba." },
  { id: "custom", name: "Sava strategija", t: null, desc: "Nustatyk dalis pats – pvz., su kriptovaliutomis ar auksu." },
];
const STG_RULES = [
  { id: "maxAsset", label: "Viena pozicija – ne daugiau kaip" },
  { id: "maxSector", label: "Vienas sektorius – ne daugiau kaip" },
  { id: "maxCrypto", label: "Kriptovaliutos – ne daugiau kaip" },
];
let PRICES = { items: {} };

function strategy() {
  const s = state.strategy || { id: "m80" };
  const model = MODELS.find((m) => m.id === s.id) || MODELS[1];
  const t = model.t || s.custom || { stocks: 80, bonds: 20 };
  const sum = BUCKETS.reduce((x, b) => x + (Number(t[b.id]) || 0), 0) || 1;
  return { model, targets: Object.fromEntries(BUCKETS.map((b) => [b.id, (Number(t[b.id]) || 0) / sum])) };
}
function bucketValues(holdings) {
  const v = Object.fromEntries(BUCKETS.map((b) => [b.id, 0]));
  for (const h of holdings) {
    if (!(h.value > 0)) continue;
    const m = meta(h);
    let b = PFI.bucket({ ...h, ...m });
    if (m.sector === "Pinigų rinka") b = "cash";
    v[b] = (v[b] || 0) + h.value;
  }
  return v;
}

/* ---------- 1. Strategijos pasirinkimas ---------- */
function renderModels() {
  const cur = strategy();
  $("#models").innerHTML = MODELS.map((m) => {
    const t = m.t || (state.strategy && state.strategy.custom) || null;
    const bar = t ? BUCKETS.filter((b) => t[b.id]).map((b) => `<span style="flex:${t[b.id]};background:${b.color}"></span>`).join("") : `<span style="flex:1;background:repeating-linear-gradient(45deg,var(--line) 0 6px,transparent 6px 12px)"></span>`;
    const parts = t ? BUCKETS.filter((b) => t[b.id]).map((b) => `${t[b.id]} % ${b.name.toLowerCase()}`).join(", ") : "Nustatai pats";
    return `<button type="button" class="model${cur.model.id === m.id ? " on" : ""}" role="radio" aria-checked="${cur.model.id === m.id}" data-id="${m.id}">
      <span class="model-name">${esc(m.name)}</span>
      <span class="model-bar">${bar}</span>
      <span class="model-parts">${esc(parts)}</span>
      <span class="model-desc">${esc(m.desc)}</span>
      ${m.dd08 ? `<span class="model-dd"><span>2008 m. <b>≈ ${fmtPct(m.dd08, 0)}</b></span><span>2022 m. <b>≈ ${fmtPct(m.dd22, 0)}</b></span></span>` : ""}
    </button>`;
  }).join("");
  $("#models").querySelectorAll(".model").forEach((b) => b.addEventListener("click", () => {
    state.strategy = { ...(state.strategy || {}), id: b.dataset.id };
    if (b.dataset.id === "custom" && !state.strategy.custom) state.strategy.custom = { stocks: 70, bonds: 10, cash: 10, gold: 5, crypto: 5 };
    save(); renderAll();
  }));
  const custom = $("#custom");
  custom.hidden = cur.model.id !== "custom";
  if (!custom.hidden) {
    const c = state.strategy.custom;
    $("#custom-grid").innerHTML = BUCKETS.map((b) => `<label class="rule"><span><i class="dot" style="background:${b.color}"></i>${b.name}</span><span><input type="number" min="0" max="100" step="1" data-b="${b.id}" value="${c[b.id] || 0}"> %</span></label>`).join("");
    const sumEl = () => { const s = BUCKETS.reduce((x, b) => x + (Number(c[b.id]) || 0), 0); $("#custom-sum").textContent = s === 100 ? "Iš viso 100 %." : `Iš viso ${s} % – dalys bus perskaičiuotos proporcingai iki 100 %.`; };
    sumEl();
    $("#custom-grid").querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => { c[inp.dataset.b] = Math.max(0, Number(inp.value) || 0); save(); sumEl(); renderPlan(); renderChecks(); }));
  }
}

/* ---------- 2. Taisyklės ---------- */
function renderStgRules() {
  $("#stg-rules").innerHTML = STG_RULES.map((r) => `<label class="rule"><span>${r.label}</span><span><input type="number" min="0" max="100" step="any" data-rule="${r.id}" value="${state.rules[r.id] ?? ""}" placeholder="–"> %</span></label>`).join("");
  $("#stg-rules").querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
    const v = inp.value.trim();
    if (v === "") delete state.rules[inp.dataset.rule]; else state.rules[inp.dataset.rule] = Number(v);
    save(); renderPlan();
  }));
}

/* ---------- 3. Naujos sumos paskirstymas ---------- */
function allocate(holdings, A, targets) {
  const v = bucketValues(holdings);
  const T = Object.values(v).reduce((x, y) => x + y, 0), T2 = T + A;
  const def = Object.fromEntries(BUCKETS.map((b) => [b.id, Math.max(0, targets[b.id] * T2 - v[b.id])]));
  const sumDef = Object.values(def).reduce((x, y) => x + y, 0);
  const alloc = {};
  for (const b of BUCKETS) alloc[b.id] = sumDef >= A ? (sumDef ? (A * def[b.id]) / sumDef : 0) : def[b.id] + (A - sumDef) * targets[b.id];
  return { v, T, T2, alloc };
}
function overLimits(a) {
  const out = [];
  const L = (k) => (state.rules[k] === undefined || state.rules[k] === "" ? null : Number(state.rules[k]) / 100);
  const la = L("maxAsset"), ls = L("maxSector"), lc = L("maxCrypto");
  if (la !== null) a.byAsset.filter((x) => x.s !== CASH && x.p > la).forEach((x) => out.push({ kind: "asset", k: x.k, s: x.s, p: x.p, lim: la }));
  if (ls !== null) a.bySector.filter((x) => !/Grynieji|Kriptovaliutos|Pasaulio indeksas|Platus JAV indeksas|Europos indeksas|Besivystančių/.test(x.k) && x.p > ls).forEach((x) => out.push({ kind: "sector", k: x.k, p: x.p, lim: ls }));
  if (lc !== null && a.typeShare("Kriptovaliuta") > lc) out.push({ kind: "crypto", k: "Kriptovaliutos", p: a.typeShare("Kriptovaliuta"), lim: lc });
  return out;
}
function renderPlan() {
  const A = Math.max(0, Number($("#amount").value) || 0);
  const { model, targets } = strategy();
  const holdings = state.holdings || [];
  const { v, T, T2, alloc } = allocate(holdings, A, targets);
  const a = analyze(holdings);
  const over = holdings.length ? overLimits(a) : [];
  const rows = BUCKETS.filter((b) => targets[b.id] > 0 || v[b.id] > 0);
  const nowP = (b) => (T ? v[b.id] / T : 0);
  const afterP = (b) => (T2 ? (v[b.id] + alloc[b.id]) / T2 : 0);
  const spend = rows.filter((b) => alloc[b.id] >= 0.5).sort((x, y) => alloc[y.id] - alloc[x.id]);
  const stockOver = over.filter((o) => o.kind !== "crypto");
  const stockNote = alloc.stocks >= 0.5 && stockOver.length
    ? `Kadangi kai kurios tavo pozicijos ar sektoriai jau viršija tavo ribas, pagal tavo taisykles akcijų dalį labiau atitiktų <b>platus, daug įmonių apimantis akcijų fondas</b>, o ne tų pačių akcijų didinimas.`
    : alloc.stocks >= 0.5 ? "Akcijų dalį gali didinti tiek plačiu fondu, tiek atskiromis akcijomis – pasitikrink jas 4 žingsnyje." : "";
  $("#plan").innerHTML = `
    <div class="plan card">
      <div class="plan-head">
        <div><p class="muted small" style="margin:0">Pagal strategiją „${esc(model.name)}“</p><h3 class="plan-title">${money(A)} paskirstymas</h3></div>
        <p class="muted small" style="margin:0">Portfelis ${money(T)} → ${money(T2)}</p>
      </div>
      <p class="plan-why">${whyText(rows, targets, v, T, alloc, A)}</p>
      <ul class="plan-list">${spend.length ? spend.map((b) => `<li><i class="dot" style="background:${b.color}"></i><span>${b.name}</span><b>${money(alloc[b.id])}</b><a class="btn small" href="${screenLink(b.id, over)}">Žiūrėti sąrašą</a></li>`).join("") : `<li><span>Portfelis jau atitinka tavo strategiją – sumą gali skirstyti pagal tikslines dalis.</span></li>`}</ul>
      ${stockNote ? `<p class="plan-note">${stockNote}</p>` : ""}
      ${over.length ? `<div class="plan-avoid"><h4>Pagal tavo taisykles nedidintum</h4><ul>${over.map((o) => `<li><b>${esc(o.k)}</b> – ${pct(o.p)} portfelio, tavo riba ${pct(o.lim)}${o.s && EXPLAIN[o.s] ? ` · <a href="aktyvas.html?s=${encodeURIComponent(o.s)}">kodėl ${EXPLAIN[o.s].direction === "down" ? "krito" : "kilo"}?</a>` : ""}</li>`).join("")}</ul></div>` : holdings.length && !Object.keys(state.rules).length ? `<p class="plan-note">Nustatyk ribas 2 žingsnyje – tada matysi, ko pagal tavo taisykles nedidinti.</p>` : ""}
      <table class="pf-table plan-table"><thead><tr><th>Dalis</th><th class="num">Tikslas</th><th class="num">Dabar</th><th class="num">Po investavimo</th></tr></thead>
      <tbody>${rows.map((b) => `<tr><td><i class="dot" style="background:${b.color}"></i>${b.name}</td><td class="num">${pct(targets[b.id])}</td><td class="num">${pct(nowP(b))}</td><td class="num"><b>${pct(afterP(b))}</b></td></tr>`).join("")}</tbody></table>
    </div>`;
}

// Paprastas paaiškinimas, kodėl suma paskirstyta būtent taip
function whyText(rows, targets, v, T, alloc, A) {
  if (!T) return `Portfelio dar neturi, todėl suma paskirstoma tiesiog pagal strategijos dalis.`;
  const gaps = rows.map((b) => ({ b, now: v[b.id] / T, tgt: targets[b.id] })).filter((x) => Math.abs(x.now - x.tgt) >= 0.03);
  if (!gaps.length) return `Tavo portfelis jau artimas strategijai, todėl suma paskirstoma pagal tikslines dalis.`;
  const under = gaps.filter((x) => x.now < x.tgt), over = gaps.filter((x) => x.now > x.tgt);
  const s1 = under.length ? `Tau trūksta: ${under.map((x) => `${x.b.name.toLowerCase()} (turi ${pct(x.now)}, planuoji ${pct(x.tgt)})`).join(", ")}.` : "";
  const s2 = over.length ? ` Per daug: ${over.map((x) => `${x.b.name.toLowerCase()} (${pct(x.now)} vietoj ${pct(x.tgt)})`).join(", ")}.` : "";
  return `${s1}${s2} Todėl ${money(A)} nukreipiama ten, kur trūksta – taip portfelis priartėja prie tavo plano. Jei nori daugiau akcijų, pasirink kitą strategiją 1 žingsnyje.`;
}
// Nuoroda į atranką su šią dalį atitinkančiais aktyvais (ir tavo ribomis)
function screenLink(bucket, over) {
  const q = new URLSearchParams();
  if (bucket === "stocks") { q.set("type", "Akcija,ETF"); if (over.length) q.set("pf", "fit"); }
  else if (bucket === "bonds") q.set("type", "Obligacijos");
  else if (bucket === "crypto") q.set("type", "Kriptovaliuta");
  else if (bucket === "gold") q.set("type", "Auksas");
  else if (bucket === "cash") { q.set("type", "Obligacijos"); }
  return `atranka.html?${q}`;
}

/* ---------- 4. Pasitikrink prieš pirkdamas ---------- */
let checkPicked = null;
function renderChecks() {
  const out = $("#check-out");
  if (!out.dataset.s) return;
  const s = out.dataset.s, A = Number(out.dataset.v) || 0;
  const { targets, model } = strategy();
  const before = state.holdings || [];
  const after = before.map((h) => ({ ...h }));
  const ex = after.find((h) => h.s === s);
  if (ex) ex.value += A; else after.push({ s, value: A, ...(findAsset(s) || s === CASH ? {} : { n: ticker(s) }) });
  const m = meta(ex || { s });
  const a0 = analyze(before), a1 = analyze(after);
  const bv0 = bucketValues(before), bv1 = bucketValues(after);
  const T0 = Object.values(bv0).reduce((x, y) => x + y, 0), T1 = Object.values(bv1).reduce((x, y) => x + y, 0);
  const dist = (bv, T) => BUCKETS.reduce((x, b) => x + Math.abs((T ? bv[b.id] / T : 0) - targets[b.id]), 0);
  const closer = dist(bv1, T1) < dist(bv0, T0) - 1e-9;
  const c0 = checkRules(a0, state.rules), c1 = checkRules(a1, state.rules);
  const broken = c1.filter((c, i) => !c.ok && (!c0[i] || c0[i].ok));
  const share0 = (a0.byAsset.find((x) => x.s === s) || { p: 0 }).p, share1 = (a1.byAsset.find((x) => x.s === s) || { p: 0 }).p;
  const sec0 = (a0.bySector.find((x) => x.k === m.sector) || { p: 0 }).p, sec1 = (a1.bySector.find((x) => x.k === m.sector) || { p: 0 }).p;
  const p = PRICES.items[s];
  const facts = [];
  facts.push(`<li class="${closer ? "ok" : "warn"}"><b>${closer ? "Priartintų" : "Nutolintų"}</b> portfelį nuo tavo strategijos „${esc(model.name)}“.</li>`);
  facts.push(`<li><b>${esc(m.n)}</b> dalis: ${pct(share0)} → <b>${pct(share1)}</b>. Sektorius „${esc(m.sector)}“: ${pct(sec0)} → <b>${pct(sec1)}</b>.</li>`);
  if (c1.length) facts.push(broken.length ? broken.map((c) => `<li class="warn"><b>Nebeatitiktų tavo taisyklės:</b> ${esc(c.r.label.toLowerCase())} ${c.lim} %</li>`).join("") : `<li class="ok"><b>Tavo taisyklių nepažeistų.</b></li>`);
  if (p) {
    facts.push(`<li>Nuo metų aukščiausios kainos: <b>${fmtPct(p.fromHigh)}</b>. Per metus: ${fmtPct(p.y1)}, per mėnesį: ${fmtPct(p.m1)}.</li>`);
    if (p.vol) facts.push(`<li>Svyravimas: ~${Math.round(p.vol)} % per metus${p.vol > 45 ? " – <b>labai didelis</b> (plataus pasaulio akcijų fondo ~15 %)" : p.vol > 25 ? " – didesnis nei plačios rinkos (~15 %)" : " – panašus į plačią rinką"}.</li>`);
  }
  const an = p && p.an;
  if (an && an.n) {
    const lbl = { strong_buy: "stipriai pirkti", buy: "pirkti", hold: "laikyti", underperform: "prasčiau už rinką", sell: "parduoti" }[an.key] || "–";
    facts.push(`<li>Analitikų (${an.n}) vidutinis vertinimas: <b>${lbl}</b>${an.up !== undefined ? `, vidutinė tikslinė kaina ${fmtPct(an.up, 0)} nuo dabartinės` : ""}. <span class="muted">Trečiųjų šalių nuomonė (Yahoo Finance).</span></li>`);
  }
  const top = PFI.SCENARIOS[1];
  const shock = (top.shock[PFI.bucket({ ...m, value: 1 })] ?? 0) / 100;
  facts.push(`<li>Jei per nuosmukį kaip 2022 m. kristų tiek, kiek panašūs aktyvai, iš ${money(A)} liktų ~<b>${money(A * (1 + shock))}</b>${m.type === "Akcija" ? " (atskiros akcijos dažnai krenta daugiau)" : ""}.</li>`);
  out.innerHTML = `<div class="card check">
    <div class="check-head">${logoHTML(s, m.n, "#1d3a63", 44)}<div><h3>${esc(m.n)} už ${money(A)}</h3><p class="muted small" style="margin:0">${esc([isTv(s) ? ticker(s) : "", m.sector, m.country].filter(Boolean).join(" · "))}</p></div>${p ? `<div class="check-spark">${sparkSVG(p.spark, 140, 44)}</div>` : ""}</div>
    <ul class="checks">${facts.join("")}</ul>
    ${EXPLAIN[s] ? explainHTML(EXPLAIN[s]) : ""}
    ${isTv(s) ? `<p style="margin:14px 0 0"><a href="aktyvas.html?s=${encodeURIComponent(s)}">Grafikas, rodikliai ir naujienos apie ${esc(m.n)}</a></p>` : ""}
  </div>`;
}

/* ---------- Kritimai nuo aukščiausios kainos ---------- */
function renderDrawdowns() {
  const sec = $("#dd-section"), el = $("#dd");
  const rows = (state.holdings || []).filter((h) => isTv(h.s)).map((h) => ({ h, m: meta(h), p: PRICES.items[h.s] }));
  if (!rows.length) { sec.hidden = true; return; }
  sec.hidden = false;
  if (!rows.some((r) => r.p)) { el.innerHTML = `<p class="muted">Kainų duomenys dar ruošiami – kritimai nuo aukščiausios kainos ir svyravimai atsiras netrukus.</p>`; return; }
  rows.sort((x, y) => ((x.p && x.p.fromHigh) ?? 0) - ((y.p && y.p.fromHigh) ?? 0));
  el.innerHTML = `<div class="dd-list">${rows.map(({ h, m, p }) => `
    <a class="dd-row" href="aktyvas.html?s=${encodeURIComponent(h.s)}">
      ${logoHTML(h.s, m.n, "#1d3a63", 36)}
      <span class="dd-name"><b>${esc(m.n)}</b><small>${p ? `Per mėn. ${fmtPct(p.m1)} · svyravimas ~${p.vol ? Math.round(p.vol) : "–"} %` : "Kainos duomenų nėra"}</small></span>
      <span class="dd-spark">${p ? sparkSVG(p.spark) : ""}</span>
      <span class="dd-val"><b class="${p && p.fromHigh < -0.5 ? "down" : ""}">${p ? fmtPct(p.fromHigh) : "–"}</b><small>nuo aukščiausios</small></span>
      ${EXPLAIN[h.s] ? `<span class="why-dot">Kodėl?</span>` : `<span></span>`}
    </a>`).join("")}</div>`;
}

function renderAll() {
  $("#stg-noportfolio").hidden = (state.holdings || []).length > 0;
  renderModels(); renderPlan(); renderChecks(); renderDrawdowns();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page !== "strategy") return;
  try { ASSETS = (await getJSON("data/assets.json")).groups.flatMap((g) => g.items); } catch (e) { console.error(e); }
  [EXPLAIN, PRICES] = await Promise.all([loadExplain(), loadPrices()]);
  load();
  renderStgRules();
  renderAll();
  $("#amount-form").addEventListener("submit", (e) => { e.preventDefault(); renderPlan(); });
  $("#amount").addEventListener("input", renderPlan);
  picker($("#check-q"), (s) => (checkPicked = s));
  $("#check-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const s = checkPicked || resolveTyped($("#check-q").value);
    const v = Number($("#check-val").value);
    if (!s) return flag($("#check-q"), "Pasirink aktyvą iš sąrašo");
    if (!(v > 0)) return flag($("#check-val"), "Įvesk sumą");
    $("#check-out").dataset.s = s; $("#check-out").dataset.v = v;
    renderChecks();
  });
  $("#help-slot").innerHTML = helpHTML();
  const pre = new URLSearchParams(location.search).get("check");
  if (pre && (findAsset(pre) || SYMBOL_RE.test(pre))) {
    checkPicked = pre;
    $("#check-q").value = (findAsset(pre) || { n: pre }).n;
    $("#check-out").dataset.s = pre; $("#check-out").dataset.v = $("#check-val").value || 100;
    renderChecks();
    setTimeout(() => $("#check-form").scrollIntoView({ block: "start" }), 300);
  }
});
