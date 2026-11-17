// InvestAI – savi vizualai: medžio žemėlapis, kainos grafikas, 52 sav. juosta, analitikų skalė, stebimi aktyvai, tema.
"use strict";

/* ---------- Tema (šviesi / tamsi) ---------- */
function currentTheme() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
function toggleTheme() {
  const t = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("investai.theme", t); } catch {}
  document.querySelectorAll(".theme-btn").forEach((b) => b.setAttribute("aria-label", t === "dark" ? "Įjungti šviesią temą" : "Įjungti tamsią temą"));
}
const THEME_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path class="i-moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><g class="i-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g></svg>';

/* ---------- Stebimi aktyvai ⭐ ---------- */
const WATCH_KEY = "investai.watch.v1";
function watchList() { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"); } catch { return []; } }
function isWatched(s) { return watchList().includes(s); }
function toggleWatch(s) {
  const l = watchList(), i = l.indexOf(s);
  if (i >= 0) l.splice(i, 1); else l.unshift(s);
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(l.slice(0, 60))); } catch {}
  document.querySelectorAll(`.star[data-star="${CSS.escape(s)}"]`).forEach((b) => setStar(b, i < 0));
  document.dispatchEvent(new CustomEvent("watchchange"));
  return i < 0;
}
function setStar(b, on) {
  b.setAttribute("aria-pressed", String(on));
  const label = b.dataset.label;
  b.setAttribute("aria-label", on ? `Nebestebėti${label ? " " + label : ""}` : `Stebėti${label ? " " + label : ""}`);
  const t = b.querySelector(".star-t");
  if (t) t.textContent = on ? "Stebima" : "Stebėti";
}
function starHTML(s, name = "", withText = false) {
  const on = isWatched(s);
  return `<button type="button" class="star${withText ? " star-text" : ""}" data-star="${esc(s)}" data-label="${esc(name)}" aria-pressed="${on}" aria-label="${on ? "Nebestebėti" : "Stebėti"} ${esc(name)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>${withText ? `<span class="star-t">${on ? "Stebima" : "Stebėti"}</span>` : ""}</button>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".star[data-star]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const on = toggleWatch(b.dataset.star);
  b.classList.remove("pop"); void b.offsetWidth; if (on) b.classList.add("pop");
});

/* ---------- Spalva pagal pokytį ---------- */
// Sodrumas pagal |pokytį| / mastelį. Naudoja CSS kintamuosius, todėl tinka abiem temoms.
function changeColor(v, scale = 3) {
  if (v === null || v === undefined || !isFinite(v)) return "var(--tile-0)";
  const k = Math.min(1, Math.abs(v) / scale);
  const pct = Math.round(18 + k * 82);
  return `color-mix(in srgb, var(${v >= 0 ? "--tile-up" : "--tile-down"}) ${pct}%, var(--tile-0))`;
}

/* ---------- Medžio žemėlapis (squarified) ---------- */
function squarify(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((t, i) => t + i.v, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let rest = items.map((i) => ({ ...i, a: i.v * scale }));
  const worst = (row, side) => {
    const s = row.reduce((t, r) => t + r.a, 0);
    const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]], i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i++; }
    rest = rest.slice(i);
    const s = row.reduce((t, r) => t + r.a, 0);
    if (w >= h) {
      const rw = s / h; let yy = y;
      row.forEach((r) => { const rh = r.a / rw; out.push({ ...r, x, y: yy, w: rw, h: rh }); yy += rh; });
      x += rw; w -= rw;
    } else {
      const rh = s / w; let xx = x;
      row.forEach((r) => { const cw = r.a / rh; out.push({ ...r, x: xx, y, w: cw, h: rh }); xx += cw; });
      y += rh; h -= rh;
    }
  }
  return out;
}
// items: [{label, sub, v, c (pokytis %), href, title, group}] → HTML (procentinės koordinatės, prisitaiko prie pločio)
function treemapHTML(items, { ratio = 0.55, scale = 3, groups = false, minLabel = 0.22 } = {}) {
  const W = 1000, H = Math.round(1000 * ratio);
  items = items.filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  let tiles = [], heads = [];
  if (groups) {
    const m = new Map();
    items.forEach((i) => { if (!m.has(i.group)) m.set(i.group, []); m.get(i.group).push(i); });
    const gs = [...m].map(([k, list]) => ({ k, list, v: list.reduce((t, i) => t + i.v, 0) })).sort((a, b) => b.v - a.v);
    squarify(gs, 0, 0, W, H).forEach((g) => {
      const head = g.h > 60 && g.w > 90 ? 22 : 0;
      if (head) heads.push(g);
      tiles.push(...squarify(g.list, g.x, g.y + head, g.w, g.h - head));
    });
  } else tiles = squarify(items, 0, 0, W, H);
  const P = (v, d) => `${((v / d) * 100).toFixed(3)}%`;
  const html = tiles.map((t, i) => {
    const area = (t.w * t.h) / (W * H) * 100;
    const big = area > 3 ? " tm-big" : area > 0.9 ? "" : area > minLabel ? " tm-sm" : " tm-tiny";
    const tag = t.href ? "a" : "div";
    return `<${tag} class="tm-tile${big}" ${t.href ? `href="${esc(t.href)}"` : ""} style="left:${P(t.x, W)};top:${P(t.y, H)};width:${P(t.w, W)};height:${P(t.h, H)};background:${changeColor(t.c, scale)};--d:${Math.min(i, 40) * 12}ms" title="${esc(t.title || `${t.label} ${fmtPct(t.c)}`)}"><b>${esc(t.label)}</b>${t.sub ? `<span>${esc(t.sub)}</span>` : ""}</${tag}>`;
  }).join("");
  const hs = heads.map((g) => `<div class="tm-group" style="left:${P(g.x, W)};top:${P(g.y, H)};width:${P(g.w, W)}">${esc(g.k)}</div>`).join("");
  return `<div class="treemap" style="aspect-ratio:${W}/${H}">${hs}${html}</div>`;
}
function tmLegend(scale = 3, unit = "%") {
  const steps = [-scale, -scale / 2, 0, scale / 2, scale];
  return `<div class="tm-legend" aria-hidden="true">${steps.map((s) => `<span style="background:${changeColor(s === 0 ? null : s, scale)}">${s > 0 ? "+" : s < 0 ? "−" : ""}${Math.abs(s).toLocaleString("lt-LT")}${unit}</span>`).join("")}</div>`;
}

/* ---------- Kainos grafikas su laikotarpiais ---------- */
// values – ~1 metų uždarymo kainos (lygiais tarpais), endDate – paskutinės kainos data.
function mountPriceChart(el, values, { endDate = null, cur = "", ranges = [["1 mėn.", 1 / 12, "mėnesį"], ["3 mėn.", 0.25, "3 mėnesius"], ["6 mėn.", 0.5, "pusmetį"], ["1 metai", 1, "metus"]] } = {}) {
  if (!el || !values || values.length < 3) return;
  const end = endDate ? new Date(endDate + "T12:00:00") : new Date();
  const N = values.length;
  const dateAt = (i) => new Date(end.getTime() - ((N - 1 - i) / (N - 1)) * 365 * 864e5);
  let sel = ranges.length - 1;
  el.classList.add("pchart");
  el.innerHTML = `<div class="pchart-top"><div class="pchart-chg" aria-live="polite"></div><div class="seg pchart-seg" role="group" aria-label="Laikotarpis">${ranges.map(([l], i) => `<button type="button" data-r="${i}" aria-pressed="${i === sel}">${l}</button>`).join("")}</div></div><div class="pchart-box"><svg preserveAspectRatio="none" viewBox="0 0 600 220"></svg><div class="pchart-tip" hidden></div></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".pchart-tip"), chg = el.querySelector(".pchart-chg");
  const fmtP = (v) => `${v.toLocaleString("lt-LT", { maximumFractionDigits: v < 10 ? 3 : 2 })}${cur ? " " + cur : ""}`;
  let pts = [];
  const draw = () => {
    const n = Math.max(3, Math.round(N * ranges[sel][1]));
    const vals = values.slice(-n), off = N - vals.length;
    const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
    pts = vals.map((v, i) => ({ x: (i / (vals.length - 1)) * 600, y: 12 + (1 - (v - mn) / r) * 190, v, d: dateAt(off + i) }));
    const up = vals[vals.length - 1] >= vals[0];
    const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    el.classList.toggle("p-up", up); el.classList.toggle("p-down", !up);
    svg.innerHTML = `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      <line class="pchart-base" x1="0" x2="600" y1="${pts[0].y}" y2="${pts[0].y}"/>
      <polygon points="0,220 ${line} 600,220" fill="url(#pg)"/>
      <polyline class="pchart-line" points="${line}" fill="none" stroke="currentColor" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <line class="pchart-x" x1="0" x2="0" y1="0" y2="220" visibility="hidden" vector-effect="non-scaling-stroke"/>`;
    const c = (vals[vals.length - 1] / vals[0] - 1) * 100;
    chg.innerHTML = `<b class="${up ? "up" : "down"}">${fmtPct(c)}</b> <span class="muted">per ${ranges[sel][2]}</span>`;
    el.querySelectorAll("[data-r]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.r === sel)));
  };
  draw();
  el.querySelector(".pchart-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) { sel = +b.dataset.r; draw(); } });
  const box = el.querySelector(".pchart-box");
  const move = (clientX) => {
    const rc = box.getBoundingClientRect();
    const x = ((clientX - rc.left) / rc.width) * 600;
    let best = pts[0];
    pts.forEach((p) => { if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
    const xl = svg.querySelector(".pchart-x"); xl.setAttribute("x1", best.x); xl.setAttribute("x2", best.x); xl.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.innerHTML = `<b>${fmtP(best.v)}</b><span>~${best.d.getFullYear()}-${String(best.d.getMonth() + 1).padStart(2, "0")}-${String(best.d.getDate()).padStart(2, "0")}</span>`;
    tip.style.left = `${Math.min(Math.max((best.x / 600) * 100, 8), 88)}%`;
  };
  box.addEventListener("pointermove", (e) => move(e.clientX));
  box.addEventListener("pointerleave", () => { tip.hidden = true; svg.querySelector(".pchart-x").setAttribute("visibility", "hidden"); });
}

/* ---------- Kelių linijų grafikas (palyginimui, skaičiuoklėms) ---------- */
function multiLineSVG(series, { h = 240, labels = null, fmt = (v) => v.toFixed(0), zero = false } = {}) {
  const all = series.flatMap((s) => s.values);
  if (!all.length) return "";
  let mn = Math.min(...all), mx = Math.max(...all);
  if (zero) mn = Math.min(0, mn);
  const r = mx - mn || 1, W = 600;
  const Y = (v) => 10 + (1 - (v - mn) / r) * (h - 34);
  const gv = [0, 0.5, 1].map((k) => mn + r * (1 - k));
  const grid = gv.map((v) => `<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="ml-grid"/>`).join("");
  const glab = gv.map((v) => `<span class="ml-lab" style="top:${((Y(v) / h) * 100).toFixed(2)}%">${esc(fmt(v))}</span>`).join("");
  const lines = series.map((s) => {
    const n = s.values.length;
    const pts = s.values.map((v, i) => `${((i / Math.max(1, n - 1)) * W).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" ${s.dash ? 'stroke-dasharray="5 5"' : ""} vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  }).join("");
  const xl = labels ? `<div class="ml-x">${labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : "";
  const leg = `<ul class="ml-legend">${series.filter((s) => s.name).map((s) => `<li><i style="background:${s.color}"></i>${esc(s.name)}</li>`).join("")}</ul>`;
  return `<div class="mline"><div class="ml-plot"><svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img" aria-label="Grafikas">${grid}${lines}</svg>${glab}</div>${xl}${leg}</div>`;
}

/* ---------- 52 savaičių intervalas ---------- */
function rangeBarHTML(lo, hi, price, cur = "") {
  if (!(hi > lo) || !price) return "";
  const k = Math.max(0, Math.min(1, (price - lo) / (hi - lo)));
  const f = (v) => v.toLocaleString("lt-LT", { maximumFractionDigits: v < 10 ? 3 : 2 });
  return `<div class="rbar"><div class="rbar-track"><i style="left:${(k * 100).toFixed(1)}%"></i></div><div class="rbar-lab"><span>${f(lo)}</span><span>${f(hi)} ${esc(cur)}</span></div></div>`;
}

/* ---------- Analitikų vertinimų skalė ---------- */
// mean: 1 = stipriai pirkti … 5 = parduoti (Yahoo skalė). Tai trečiųjų šalių nuomonių vidurkis, ne InvestAI vertinimas.
function analystGaugeHTML(an, price, cur = "") {
  if (!an || !an.n || !an.mean) return `<p class="muted small" style="margin:0">Analitikų vertinimų šiam aktyvui nėra.</p>`;
  const k = Math.max(0, Math.min(1, (an.mean - 1) / 4));
  const ang = Math.PI * (1 - k);
  const nx = 100 + Math.cos(ang) * 72, ny = 100 - Math.sin(ang) * 72;
  const label = { strong_buy: "Stipriai pirkti", buy: "Pirkti", hold: "Laikyti", underperform: "Prasčiau už rinką", sell: "Parduoti", strong_sell: "Parduoti" }[an.key] || "–";
  const c = an.c || [];
  const t = (v) => (v ? v.toLocaleString("lt-LT", { maximumFractionDigits: v < 10 ? 2 : 0 }) : "–");
  const tg = an.tLow && an.tHigh && price ? (() => {
    const lo = Math.min(an.tLow, price), hi = Math.max(an.tHigh, price), R = hi - lo || 1, P = (v) => ((v - lo) / R) * 100;
    return `<div class="tgt"><div class="tgt-track"><span class="tgt-band" style="left:${P(an.tLow)}%;width:${P(an.tHigh) - P(an.tLow)}%"></span><i class="tgt-now" style="left:${P(price)}%" title="Dabartinė kaina"></i>${an.tMean ? `<i class="tgt-mean" style="left:${P(an.tMean)}%" title="Vidutinė tikslinė kaina"></i>` : ""}</div>
      <div class="tgt-lab"><span>Žemiausia ${t(an.tLow)}</span><span>Vidurkis <b>${t(an.tMean)}</b>${an.up !== undefined ? ` (<b class="${an.up >= 0 ? "up" : "down"}">${fmtPct(an.up, 0)}</b>)` : ""}</span><span>Aukščiausia ${t(an.tHigh)} ${esc(cur)}</span></div></div>`;
  })() : "";
  return `<div class="gauge-wrap"><svg class="gauge" viewBox="0 0 200 112" aria-hidden="true">
      <path d="M28 100a72 72 0 0 1 144 0" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round"/>
      <defs><linearGradient id="gg"><stop offset="0" stop-color="var(--up)"/><stop offset=".5" stop-color="var(--tile-0)"/><stop offset="1" stop-color="var(--down)"/></linearGradient></defs>
      <line x1="100" y1="100" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="currentColor"/>
    </svg><div class="gauge-txt"><b>${label}</b><span>${an.n} analitikų vidurkis</span>${c.length ? `<small>${c[0] + c[1]} pirkti · ${c[2]} laikyti · ${c[3] + c[4]} parduoti</small>` : ""}</div></div>${tg}`;
}

/* ---------- Skaičių formatai ---------- */
function fmtBig(v, cur = "") {
  if (!v) return "–";
  const a = Math.abs(v);
  const s = a >= 1e12 ? `${(v / 1e12).toLocaleString("lt-LT", { maximumFractionDigits: 2 })} trln.` : a >= 1e9 ? `${(v / 1e9).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} mlrd.` : a >= 1e6 ? `${(v / 1e6).toLocaleString("lt-LT", { maximumFractionDigits: 0 })} mln.` : v.toLocaleString("lt-LT");
  return `${s}${cur ? " " + cur : ""}`;
}
const CUR_SIGN = { USD: "$", EUR: "€", GBp: "p", GBP: "£", SEK: "SEK", NOK: "NOK", DKK: "DKK", CHF: "CHF", JPY: "¥", KRW: "₩" };
// Apytiksliai kursai į EUR (tik žemėlapio dydžiams palyginti, ne skaičiavimams)
const TO_EUR = { USD: 0.92, EUR: 1, GBp: 0.0117, GBP: 1.17, SEK: 0.087, NOK: 0.085, DKK: 0.134, CHF: 1.05, JPY: 0.0061, KRW: 0.00066 };
function fmtPrice(v, cur) {
  if (v === undefined || v === null) return "–";
  return `${v.toLocaleString("lt-LT", { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v < 1 ? 4 : 2 })} ${CUR_SIGN[cur] || cur || ""}`.trim();
}
const skel = (n = 3, h = 56) => Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join("");
