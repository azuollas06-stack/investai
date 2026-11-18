// InvestAI – savi vizualai: medžio žemėlapis, kainos grafikas, 52 sav. juosta, analitikų skalė, stebimi aktyvai, tema.
"use strict";

/* ---------- Tema (šviesi / tamsi) ---------- */
function currentTheme() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
function toggleTheme() {
  const t = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("investai.theme", t); } catch {}
  document.querySelectorAll(".theme-btn").forEach((b) => b.setAttribute("aria-label", t === "dark" ? "Įjungti šviesią temą" : "Įjungti tamsią temą"));
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#0a1930" : "#f1f4f9";
  document.dispatchEvent(new CustomEvent("themechange"));
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
const TILE_UP = ["#2b5a45", "#1f7f4f", "#17a35c", "#1fc46d"];
const TILE_DOWN = ["#6a2f3b", "#9c2f3a", "#cf3540", "#f2454f"];
function changeColor(v, scale = 3) {
  if (v === null || v === undefined || !isFinite(v)) return "#3f4b5e";
  const k = Math.abs(v) / scale;
  if (k < 0.08) return "#3f4b5e";
  const i = k < 0.33 ? 0 : k < 0.66 ? 1 : k < 1 ? 2 : 3;
  return (v >= 0 ? TILE_UP : TILE_DOWN)[i];
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
function treemapHTML(items, { ratio = 0.55, scale = 3, groups = false, minLabel = 0.22, rich = false } = {}) {
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
    const tag = t.href ? "a" : "div";
    return `<${tag} class="tm-tile" data-info="${esc(t.title || `${t.label}: ${fmtPct(t.c)}`)}" ${t.href ? `href="${esc(t.href)}"` : 'tabindex="0"'} style="left:${P(t.x, W)};top:${P(t.y, H)};width:${P(t.w, W)};height:${P(t.h, H)};background:${changeColor(t.c, scale)};--d:${Math.min(i, 40) * 12}ms" title="${esc(t.title || `${t.label} ${fmtPct(t.c)}`)}">${t.ico ? `<i class="tm-ico">${t.ico}</i>` : ""}<b>${esc(t.label)}</b>${t.sub ? `<span>${esc(t.sub)}</span>` : ""}</${tag}>`;
  }).join("");
  const hs = heads.map((g) => `<div class="tm-group" title="${esc(g.k)}" style="left:${P(g.x, W)};top:${P(g.y, H)};width:${P(g.w, W)}">${esc(g.k)}</div>`).join("");
  return `<div class="treemap${rich ? " tm-rich" : ""}" style="aspect-ratio:${W}/${H}">${hs}${html}</div><div class="tm-info" hidden></div>`;
}
// Teksto dydis pagal tikrą langelio dydį: niekas nenukerpama, mažiems – tik simbolis arba nieko.
function fitTreemaps(root = document) {
  root.querySelectorAll(".treemap").forEach((tm) => {
    const run = () => tm.querySelectorAll(".tm-tile").forEach((t) => {
      const w = t.clientWidth, h = t.clientHeight, b = t.querySelector(":scope > b"), sp = t.querySelector(":scope > span");
      const len = Math.max(3, b.textContent.length);
      let fs = Math.min((w - 10) / (len * 0.7), h * 0.36, 24);
      if (fs < 11.5) { t.classList.add("tm-none"); return; }
      t.classList.remove("tm-none");
      const ic = t.querySelector(".tm-ico");
      if (ic) { const isz = Math.min(44, Math.max(22, Math.min(w, h) * 0.26)); const show = h > isz + fs * 2.6 && w > isz + 12; ic.style.display = show ? "" : "none"; ic.style.setProperty("--isz", `${isz.toFixed(0)}px`); if (show) fs = Math.min(fs, (h - isz) * 0.3); b.style.fontSize = `${fs.toFixed(1)}px`; }
      b.style.fontSize = `${fs.toFixed(1)}px`;
      if (sp) {
        const sfs = Math.max(11, Math.min(fs * 0.62, 15));
        const fits = h > fs * 1.25 + sfs * 1.35 + 6 && w > sp.textContent.length * sfs * 0.6 + 10;
        sp.style.display = fits ? "" : "none";
        sp.style.fontSize = `${sfs.toFixed(1)}px`;
        if (fits && (sp.scrollWidth > sp.clientWidth + 1 || sp.offsetWidth > t.clientWidth - 8)) sp.style.display = "none";
      }
    });
    run();
    tm.querySelectorAll(".tm-group").forEach((g) => { g.classList.remove("tm-g-hide"); if (g.scrollWidth > g.clientWidth + 1) g.classList.add("tm-g-hide"); });
    if (!tm._ro && window.ResizeObserver) { tm._ro = new ResizeObserver(() => run()); tm._ro.observe(tm); }
  });
}
// Paspaudus langelį – informacija po žemėlapiu; telefone pirmas paspaudimas rodo info, antras atidaro.
document.addEventListener("click", (e) => {
  const t = e.target.closest(".tm-tile");
  if (!t) return;
  const tm = t.closest(".treemap"), info = tm.nextElementSibling;
  const coarse = matchMedia("(hover: none)").matches;
  if (t.tagName === "A" && (!coarse || t.classList.contains("tm-sel"))) return;
  e.preventDefault();
  tm.querySelectorAll(".tm-sel").forEach((x) => x.classList.remove("tm-sel"));
  t.classList.add("tm-sel");
  if (info && info.classList.contains("tm-info")) {
    info.hidden = false;
    info.innerHTML = `<span>${esc(t.dataset.info)}</span>${t.tagName === "A" ? `<a class="btn small" href="${esc(t.getAttribute("href"))}">Atidaryti</a>` : ""}`;
  }
});
function tmLegend(scale = 3, unit = "%") {
  const steps = [-scale, -scale * 2 / 3, -scale / 3, 0, scale / 3, scale * 2 / 3, scale];
  return `<div class="tm-legend" aria-hidden="true">${steps.map((s) => `<span style="background:${changeColor(s, scale)}">${s > 0 ? "+" : s < 0 ? "−" : ""}${Math.abs(s).toLocaleString("lt-LT", { maximumFractionDigits: 1 })}${unit}</span>`).join("")}</div>`;
}

/* ---------- Kainos grafikas (TradingView Lightweight Charts, Apache-2.0) ---------- */
let _lwc;
function loadLWC() {
  return (_lwc ||= new Promise((res, rej) => {
    if (window.LightweightCharts) return res(window.LightweightCharts);
    const sc = document.createElement("script");
    sc.src = "assets/vendor/lightweight-charts.js";
    sc.onload = () => res(window.LightweightCharts);
    sc.onerror = rej;
    document.head.append(sc);
  }));
}
const histName = (s) => s.replace(":", "_").replace(/[^A-Za-z0-9_-]/g, "_");
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const _hist = {};
// Istorija: 2 m. dienos + 5 m. savaitės; prie jos prijungiamos naujausios kainos iš prices.json / live.json
async function loadHist(sym, p) {
  if (!_hist[sym]) _hist[sym] = getJSON(`data/hist/${histName(sym)}.json`).catch(() => null);
  const h = await _hist[sym];
  const unpack = (o) => (o ? o.t.map((t, i) => ({ time: addDays(o.d0, t), value: o.c[i] })) : []);
  let d = h ? unpack(h.d) : [], w = h ? unpack(h.w) : [];
  const recent = (p && p.recent) || [];
  const last = d.length ? d[d.length - 1].time : "";
  recent.forEach(([t, v]) => { if (t > last) d.push({ time: t, value: v }); else if (t === last) d[d.length - 1].value = v; });
  if (!d.length && p && p.spark) {
    // Atsarginis variantas, kol istorija dar nesugeneruota: ~1 m. mini grafikas su apytikslėmis datomis
    const end = p.date || new Date().toISOString().slice(0, 10), n = p.spark.length;
    d = p.spark.map((v, i) => ({ time: addDays(end, -Math.round(((n - 1 - i) / (n - 1)) * 365)), value: v }));
    d = d.filter((x, i) => i === 0 || x.time > d[i - 1].time);
  }
  if (w.length && d.length) w = [...w.filter((x) => x.time < d[0].time), ...d];
  return { d, w: w.length ? w : d, approx: !h };
}
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function chartTheme() {
  return {
    layout: { background: { type: "solid", color: "transparent" }, textColor: cssVar("--muted"), fontFamily: "Onest, system-ui, sans-serif", fontSize: 12, attributionLogo: true },
    grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--line") } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
    crosshair: { mode: 0, vertLine: { color: cssVar("--muted"), labelBackgroundColor: cssVar("--sea-2") }, horzLine: { color: cssVar("--muted"), labelBackgroundColor: cssVar("--sea-2") } },
    localization: { locale: "lt-LT", priceFormatter: (v) => v.toLocaleString("lt-LT", { maximumFractionDigits: Math.abs(v) < 10 ? 3 : 2 }) },
    handleScroll: { vertTouchDrag: false },
  };
}
const RANGES = [["1 mėn.", 30, "per mėnesį"], ["3 mėn.", 91, "per 3 mėnesius"], ["6 mėn.", 182, "per pusmetį"], ["Nuo m. pr.", "ytd", "nuo metų pradžios"], ["1 m.", 365, "per metus"], ["2 m.", 730, "per 2 metus"], ["5 m.", 1826, "per 5 metus"]];
function sliceRange(h, r) {
  const src = r[1] === 1826 ? h.w : h.d;
  if (!src.length) return [];
  const end = src[src.length - 1].time;
  const from = r[1] === "ytd" ? `${end.slice(0, 4)}-01-01` : addDays(end, -r[1]);
  const out = src.filter((x) => x.time >= from);
  const prev = src.filter((x) => x.time < from).pop();
  if (r[1] === "ytd" && prev) return [prev, ...out]; // kaip „nuo metų pradžios“ rodiklis: nuo praėjusių metų paskutinės kainos
  if (out.length >= 2) return out;
  return prev ? [prev, ...out] : out;
}
async function mountPriceChart(el, sym, p, { cur = "" } = {}) {
  if (!el) return;
  el.classList.add("pchart");
  el.innerHTML = `<div class="pchart-top"><div class="pchart-legend" aria-live="polite"></div></div><div class="pchart-box"></div><div class="seg pchart-seg" role="group" aria-label="Laikotarpis"></div><p class="pchart-note muted small" hidden>Grafikas apytikslis – detali istorija atsiras po artimiausio duomenų atnaujinimo.</p>`;
  const [LW, h] = await Promise.all([loadLWC(), loadHist(sym, p)]);
  if (!h.d.length) { el.innerHTML = `<p class="muted">Grafiko duomenų nėra.</p>`; return; }
  $(".pchart-note", el).hidden = !h.approx;
  const avail = RANGES.filter((r) => (r[1] === 1826 ? h.w.length > h.d.length : r[1] === "ytd" || r[1] <= 365 || (h.d.length && addDays(h.d[h.d.length - 1].time, -r[1] + 25) >= h.d[0].time)));
  let sel = avail.findIndex((r) => r[1] === 365); if (sel < 0) sel = avail.length - 1;
  const seg = $(".pchart-seg", el), legend = $(".pchart-legend", el), box = $(".pchart-box", el);
  seg.innerHTML = avail.map((r, i) => `<button type="button" data-r="${i}" aria-pressed="${i === sel}">${r[0]}</button>`).join("");
  const chart = LW.createChart(box, { ...chartTheme(), autoSize: true });
  const fmt = (v) => `${v.toLocaleString("lt-LT", { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v < 1 ? 4 : 2 })}${cur ? " " + cur : ""}`;
  const series = chart.addSeries(LW.AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 5, priceFormat: { type: "custom", formatter: (v) => v.toLocaleString("lt-LT", { maximumFractionDigits: v < 10 ? 3 : 2 }) } });
  let data = [];
  const paint = () => {
    const up = data.length < 2 || data[data.length - 1].value >= data[0].value;
    const col = cssVar(up ? "--up" : "--down");
    series.applyOptions({ lineColor: col, topColor: col + "55", bottomColor: col + "00", crosshairMarkerBackgroundColor: col });
    return up;
  };
  const showLegend = (pt) => {
    const first = data[0], last = pt || data[data.length - 1];
    if (!first || !last) return;
    const ch = (last.value / first.value - 1) * 100;
    legend.innerHTML = pt
      ? `<b>${fmt(pt.value)}</b> <span class="${ch >= 0 ? "up" : "down"}">${fmtPct(ch)}</span> <span class="muted">${fmtShort(pt.time)} ${pt.time.slice(0, 4)}</span>`
      : `<b class="${ch >= 0 ? "up" : "down"}">${fmtPct(ch)}</b> <span class="muted">${avail[sel][2]}</span>`;
  };
  const draw = () => {
    data = sliceRange(h, avail[sel]);
    series.setData(data);
    paint();
    chart.timeScale().fitContent();
    showLegend(null);
    seg.querySelectorAll("[data-r]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.r === sel)));
  };
  draw();
  seg.addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) { sel = +b.dataset.r; draw(); } });
  chart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.seriesData.size) return showLegend(null);
    const v = param.seriesData.get(series);
    showLegend(v ? { time: typeof param.time === "string" ? param.time : `${param.time.year}-${String(param.time.month).padStart(2, "0")}-${String(param.time.day).padStart(2, "0")}`, value: v.value } : null);
  });
  document.addEventListener("themechange", () => { chart.applyOptions(chartTheme()); paint(); });
}
// Keli aktyvai viename grafike (100 = laikotarpio pradžia)
async function mountCompareChart(el, list, days = 365) {
  const LW = await loadLWC();
  const hs = await Promise.all(list.map((x) => loadHist(x.s, x.p)));
  el.innerHTML = `<div class="pchart-box cmp-box"></div>`;
  const chart = LW.createChart($(".pchart-box", el), { ...chartTheme(), autoSize: true });
  hs.forEach((h, i) => {
    const d = days === 1826 ? h.w : h.d;
    if (!d.length) return;
    const from = addDays(d[d.length - 1].time, -days);
    const arr = d.filter((x) => x.time >= from), base = arr[0] ? arr[0].value : 1;
    const s = chart.addSeries(LW.LineSeries, { color: list[i].color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: list[i].label });
    s.setData(arr.map((x) => ({ time: x.time, value: +(100 * x.value / base).toFixed(2) })));
  });
  chart.timeScale().fitContent();
  document.addEventListener("themechange", () => chart.applyOptions(chartTheme()));
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
