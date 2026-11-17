// InvestAI Premium įrankiai: įspėjimai, analitikai apie turimas akcijas, portfelio istorija, PDF ataskaita.
"use strict";

const HISTORY_KEY = "investai.history.v1";
function historyList() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } }

function lineChart(points, w = 720, h = 200) {
  if (points.length < 2) return "";
  const vs = points.map((p) => p.v), min = Math.min(...vs), max = Math.max(...vs), r = max - min || 1;
  const X = (i) => 40 + (i / (points.length - 1)) * (w - 56), Y = (v) => 14 + (1 - (v - min) / r) * (h - 44);
  const path = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const area = `${path} L${X(points.length - 1).toFixed(1)},${h - 30} L${X(0).toFixed(1)},${h - 30} Z`;
  const ticks = [min, (min + max) / 2, max];
  return `<svg class="hist" viewBox="0 0 ${w} ${h}" role="img" aria-label="Portfelio vertės istorija">
    ${ticks.map((t) => `<line x1="40" x2="${w - 16}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/><text x="34" y="${Y(t) + 4}" text-anchor="end">${Math.round(t).toLocaleString("lt-LT")}</text>`).join("")}
    <path d="${area}" class="area"/><path d="${path}" class="line"/>
    <text x="40" y="${h - 10}">${points[0].d}</text><text x="${w - 16}" y="${h - 10}" text-anchor="end">${points[points.length - 1].d}</text>
  </svg>`;
}

let PT_PRICES = { items: {} };
let TH = 5;
function renderAlerts() {
  const rows = [];
  for (const h of state.holdings || []) {
    const p = PT_PRICES.items[h.s];
    if (!p) continue;
    const m = meta(h);
    if (p.d1 !== null && Math.abs(p.d1) >= TH) rows.push({ h, m, p, k: "Per dieną", v: p.d1 });
    else if (p.w1 !== null && Math.abs(p.w1) >= TH) rows.push({ h, m, p, k: "Per savaitę", v: p.w1 });
  }
  rows.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  $("#alerts").innerHTML = rows.length
    ? `<ul class="alerts">${rows.map(({ h, m, p, k, v }) => `<li>${logoHTML(h.s, m.n, "#1d3a63", 36)}<span class="al-name"><b>${esc(m.n)}</b><small>${k} · tavo pozicija ~${money(h.value)}</small></span><b class="${v >= 0 ? "up" : "down"}">${fmtPct(v)}</b><span class="al-eur ${v >= 0 ? "up" : "down"}">${signed((h.value * v) / (100 + v))}</span>${EXPLAIN[h.s] ? `<a class="why-dot" href="aktyvas.html?s=${encodeURIComponent(h.s)}">Kodėl?</a>` : `<a class="small" href="aktyvas.html?s=${encodeURIComponent(h.s)}">Naujienos</a>`}</li>`).join("")}</ul>`
    : `<p class="muted" style="margin:0">Šiandien ir per savaitę nė viena tavo pozicija nepajudėjo daugiau nei ${TH} %.</p>`;
}
function renderAnalysts() {
  const rows = (state.holdings || []).map((h) => ({ h, m: meta(h), p: PT_PRICES.items[h.s] })).filter((r) => r.m.type === "Akcija");
  if (!rows.length) { $("#analysts").innerHTML = `<p class="muted" style="margin:0">Tavo portfelyje nėra atskirų akcijų.</p>`; return; }
  $("#analysts").innerHTML = `<div class="pf-table-wrap"><table class="pf-table"><thead><tr><th>Akcija</th><th>Vertinimas</th><th class="num">Analitikų</th><th class="num">Vid. tikslinė kaina</th><th class="num">Iki tikslo</th></tr></thead><tbody>${rows.map(({ h, m, p }) => {
    const an = (p && p.an) || {};
    const label = { strong_buy: "Stipriai pirkti", buy: "Pirkti", hold: "Laikyti", underperform: "Prasčiau už rinką", sell: "Parduoti" }[an.key] || "–";
    return `<tr><td><a href="aktyvas.html?s=${encodeURIComponent(h.s)}">${esc(m.n)}</a></td><td>${label}</td><td class="num">${an.n || "–"}</td><td class="num">${an.tMean ? `${an.tMean.toLocaleString("lt-LT", { maximumFractionDigits: 2 })} ${p.cur || ""}` : "–"}</td><td class="num"><b class="${(an.up ?? 0) >= 0 ? "up" : "down"}">${an.up !== undefined ? fmtPct(an.up, 0) : "–"}</b></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function renderHistory() {
  const list = historyList();
  if (list.length < 2) {
    $("#history").innerHTML = `<p class="muted" style="margin:0">${list.length ? `Kol kas vienas įrašas: ${list[0].d} – ${money(list[0].v)}. Grafikas atsiras po kito atnaujinimo kitą dieną.` : "Istorijos dar nėra – ji pradės kauptis atnaujinus portfelį."}</p>`;
    return;
  }
  const first = list[0], last = list[list.length - 1];
  $("#history").innerHTML = lineChart(list) + `<p class="muted small">Nuo ${first.d}: ${money(first.v)} → ${money(last.v)} (${signed(last.v - first.v)}). Vertės pokytį lemia ir kainų judėjimas, ir tavo įneštos ar išimtos sumos.</p>`;
}
function renderReport() {
  const a = analyze(state.holdings || []);
  if (!a.total) return;
  const P = a.pnl;
  $("#report").innerHTML = `<h1>InvestAI portfelio ataskaita</h1><p>${new Date().toLocaleDateString("lt-LT")}</p>
    <p><b>Vertė:</b> ${money(a.total)}${P.known ? ` · <b>Rezultatas:</b> ${signed(P.pnl)}${P.pct !== null ? ` (${signedPct(P.pct)})` : ""}` : ""}</p>
    <h2>Svarbiausia</h2><ul>${facts(a).map((f) => `<li>${f}</li>`).join("")}</ul>
    <h2>Pozicijos</h2><table><thead><tr><th>Aktyvas</th><th>Sektorius</th><th>Vertė</th><th>Dalis</th><th>Rezultatas</th><th>Nuo aukščiausios</th></tr></thead><tbody>${(state.holdings || []).filter((h) => h.value > 0).sort((x, y) => y.value - x.value).map((h) => { const m = meta(h), p = PT_PRICES.items[h.s] || {}; return `<tr><td>${esc(m.n)}</td><td>${esc(m.sector)}</td><td>${money(h.value)}</td><td>${pct(h.value / a.total)}</td><td>${typeof h.pnlPct === "number" ? signedPct(h.pnlPct) : "–"}</td><td>${fmtPct(p.fromHigh)}</td></tr>`; }).join("")}</tbody></table>
    <h2>Pagal sektorius</h2><table><tbody>${a.sectors.map((x) => `<tr><td>${esc(x.k)}</td><td>${pct(x.p)}</td></tr>`).join("")}</tbody></table>
    <p class="small">Informacinė ataskaita, ne investavimo rekomendacija. Duomenys: tavo įkeltas portfelis, Yahoo Finance, InvestAI. investai – azuollas06-stack.github.io/investai</p>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  if (document.body.dataset.page !== "premium") return;
  try { ASSETS = (await getJSON("data/assets.json")).groups.flatMap((g) => g.items); } catch (e) { console.error(e); }
  [EXPLAIN, PT_PRICES] = await Promise.all([loadExplain(), loadPrices()]);
  load();
  const draw = () => {
    if (!isPremium()) return;
    $("#pm-noportfolio").hidden = (state.holdings || []).length > 0;
    renderAlerts(); renderAnalysts(); renderHistory(); renderReport();
  };
  draw();
  $("#pm-form").addEventListener("submit", () => setTimeout(draw, 50));
  $("#al-th").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    TH = Number(b.dataset.th);
    $("#al-th").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderAlerts();
  }));
  $("#pm-print").addEventListener("click", () => { renderReport(); window.print(); });
});
