// InvestAI – skaičiuoklės: „O jei būčiau investavęs?“, taupymas, dividendai, palyginimas.
"use strict";
(() => {
  let A = [], P = { items: {} };
  const eur = (v) => `${Math.round(v).toLocaleString("lt-LT")} €`;
  const label = (a) => `${a.n} (${a.s.split(":")[1]})`;
  const find = (txt) => {
    const t = (txt || "").trim().toLowerCase();
    if (!t) return null;
    return A.find((a) => label(a).toLowerCase() === t) || A.find((a) => a.s.toLowerCase() === t || a.s.split(":")[1].toLowerCase() === t) || A.find((a) => a.n.toLowerCase() === t) || A.find((a) => a.n.toLowerCase().startsWith(t)) || null;
  };
  const num = (v, d = 0) => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : d; };

  /* ---------- O jei būčiau investavęs? ---------- */
  const JEI_TXT = { m1: ["prieš mėnesį", 1 / 12], m3: ["prieš 3 mėnesius", 0.25], ytd: ["metų pradžioje", null], y1: ["prieš metus", 1] };
  let jeiK = "y1";
  function renderJei() {
    const f = $("#f-jei"), a = find(f.a.value), sum = num(f.sum.value, 1000), out = $("#o-jei");
    f.querySelectorAll("[data-k]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === jeiK)));
    if (!a) { out.innerHTML = `<p class="muted">Pasirink aktyvą – pavyzdžiui, Nvidia, Tesla ar Bitcoin.</p>`; return; }
    const p = P.items[a.s];
    if (!p || p[jeiK] === undefined || p[jeiK] === null) { out.innerHTML = `<p class="muted">Šiam aktyvui kainų duomenų nėra.</p>`; return; }
    const ch = p[jeiK], now = sum * (1 + ch / 100), diff = now - sum;
    const [txt, frac] = JEI_TXT[jeiK];
    const ytdFrac = (() => { const d = p.date ? new Date(p.date) : new Date(); return (d - new Date(d.getFullYear(), 0, 1)) / (365 * 864e5); })();
    const tail = p.spark.slice(-Math.max(3, Math.round(p.spark.length * (frac ?? ytdFrac))));
    const scaled = tail.map((v) => (v / tail[0]) * sum);
    const bench = ["AMEX:SPY", "XETR:VWCE"].filter((s) => s !== a.s && P.items[s] && P.items[s][jeiK] !== undefined).map((s) => {
      const b = P.items[s], bn = A.find((x) => x.s === s);
      return `<li>${esc(bn ? bn.n : s)}: <b class="${b[jeiK] >= 0 ? "up" : "down"}">${eur(sum * (1 + b[jeiK] / 100))}</b> (${fmtPct(b[jeiK])})</li>`;
    }).join("");
    out.innerHTML = `
      <p class="calc-q">Jei ${txt} būtum investavęs <b>${eur(sum)}</b> į ${logoHTML(a.s, a.n, "#1d3a63", 26)} <b>${esc(a.n)}</b>, dabar turėtum</p>
      <p class="calc-big ${diff >= 0 ? "up" : "down"}">${eur(now)}</p>
      <p class="calc-sub"><span class="pill ${diff >= 0 ? "pill-up" : "pill-down"}">${diff >= 0 ? "+" : "−"}${eur(Math.abs(diff))} · ${fmtPct(ch)}</span></p>
      ${multiLineSVG([{ values: scaled, color: diff >= 0 ? "var(--up)" : "var(--down)" }, { values: scaled.map(() => sum), color: "var(--muted)", dash: true, width: 1.2 }], { h: 200, fmt: (v) => eur(v) })}
      ${bench ? `<p class="muted small" style="margin:14px 0 4px">Tuo pačiu laikotarpiu ta pati suma indeksų fonduose:</p><ul class="calc-bench">${bench}</ul>` : ""}
      <p class="muted small">Skaičiuojama pagal kainos pokytį ${esc(p.cur)} valiuta. Dividendai, mokesčiai ir valiutos kurso pokyčiai neįtraukti.</p>`;
  }

  /* ---------- Taupymas ---------- */
  const SAV = [["Atsargus", 2, "#8c9aab"], ["Vidutinis", 5, "#2c8c99"], ["Optimistinis", 8, "#e39b1b"]];
  function renderSav() {
    const f = $("#f-sav"), init = num(f.init.value), mon = num(f.mon.value), yrs = Math.round(num(f.yrs.value, 20));
    $("#yrs-l").textContent = `${yrs} ${yrs % 10 === 1 && yrs !== 11 ? "metai" : yrs % 10 === 0 || (yrs > 10 && yrs < 20) ? "metų" : "metai"}`;
    const series = SAV.map(([n, r, c]) => {
      const vals = [init]; let v = init;
      for (let m = 1; m <= yrs * 12; m++) { v = v * (1 + r / 100 / 12) + mon; if (m % 12 === 0) vals.push(v); }
      return { name: `${n} (${r} % per metus)`, values: vals, color: c, end: v, r, n };
    });
    const paid = init + mon * 12 * yrs;
    const contrib = Array.from({ length: yrs + 1 }, (_, i) => init + mon * 12 * i);
    $("#o-sav").innerHTML = `
      <p class="calc-q">Per ${yrs} m. pats įneštum <b>${eur(paid)}</b>. Priklausomai nuo grąžos, sukauptum:</p>
      <div class="sav-cards">${series.map((s) => `<div class="sav-card" style="--c:${s.color}"><span>${s.n}, ${s.r} %</span><b>${eur(s.end)}</b><small>iš jų uždirbta ${eur(s.end - paid)}</small></div>`).join("")}</div>
      ${multiLineSVG([...series, { name: "Įnešta suma", values: contrib, color: "var(--muted)", dash: true, width: 1.4 }], { h: 240, fmt: (v) => eur(v), zero: true, labels: ["Šiandien", `po ${Math.round(yrs / 2)} m.`, `po ${yrs} m.`] })}
      <p class="muted small">Tai pavyzdinės metinės grąžos, ne prognozė. Akcijų rinkos gali ir kristi – kai kuriais metais net 20–40 %. Grąža skaičiuojama kas mėnesį (sudėtinės palūkanos).</p>`;
  }

  /* ---------- Dividendai ---------- */
  function renderDiv(fromAsset = false) {
    const f = $("#f-div"), a = find(f.a.value);
    if (fromAsset && a) { const p = P.items[a.s]; if (p && p.dy) f.dy.value = p.dy.toFixed(2); }
    const sum = num(f.sum.value), dy = num(f.dy.value);
    const year = (sum * dy) / 100;
    let v = sum; for (let i = 0; i < 10; i++) v += (v * dy) / 100;
    const p = a && P.items[a.s];
    $("#o-div").innerHTML = `
      <p class="calc-q">${a ? `${logoHTML(a.s, a.n, "#1d3a63", 26)} <b>${esc(a.n)}</b>, ` : ""}${eur(sum)} su ${dy.toLocaleString("lt-LT")} % pajamingumu per metus atneštų</p>
      <p class="calc-big up">${eur(year)}</p>
      <div class="sav-cards"><div class="sav-card"><span>Vidutiniškai per mėnesį</span><b>${eur(year / 12)}</b></div><div class="sav-card"><span>Per 10 metų, jei neperinvestuotum</span><b>${eur(year * 10)}</b></div><div class="sav-card"><span>Po 10 m. metiniai dividendai, jei perinvestuotum</span><b>${eur((v * dy) / 100)}</b></div></div>
      ${a && !(p && p.dy) ? `<p class="note">${esc(a.n)} pagal mūsų duomenis dividendų nemoka arba duomenų nėra – pajamingumą įvesk pats.</p>` : ""}
      <p class="muted small">Suma prieš mokesčius. Daroma prielaida, kad pajamingumas ir kaina nesikeičia, o tai realybėje retai būna – įmonės dividendus gali ir sumažinti. Užsienio dividendams dažnai taikomas mokestis prie šaltinio, Lietuvoje – gyventojų pajamų mokestis.</p>`;
  }
  function divPicks() {
    const list = A.filter((a) => P.items[a.s] && P.items[a.s].dy >= 2 && P.items[a.s].dy < 15).sort((x, y) => P.items[y.s].dy - P.items[x.s].dy);
    const pick = [...list.filter((a) => a.g === "baltic").slice(0, 3), ...list.filter((a) => a.g !== "baltic").slice(0, 5)];
    $("#div-picks").innerHTML = pick.length ? `<p class="muted small" style="margin:8px 0 6px">Pavyzdžiai su dividendais (duomenys, ne rekomendacija):</p><div class="chipset">${pick.map((a) => `<button type="button" class="fchip" data-pick="${esc(a.s)}">${esc(a.n)} · ${P.items[a.s].dy.toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %</button>`).join("")}</div>` : "";
  }

  /* ---------- Palyginimas ---------- */
  const CMP_ROWS = [
    ["Kaina", (p) => fmtPrice(p.price, p.cur)], ["Per dieną", (p) => fmtPct(p.d1), "d1"], ["Per mėnesį", (p) => fmtPct(p.m1), "m1"], ["Nuo metų pradžios", (p) => fmtPct(p.ytd), "ytd"], ["Per metus", (p) => fmtPct(p.y1), "y1"],
    ["Nuo metų aukščiausios", (p) => fmtPct(p.fromHigh), "fromHigh"], ["Svyravimai per metus", (p) => (p.vol ? `${Math.round(p.vol)} %` : "–")],
    ["P/E", (p) => (p.pe ? p.pe.toLocaleString("lt-LT", { maximumFractionDigits: 1 }) : "–")], ["Dividendai", (p) => (p.dy ? `${p.dy.toLocaleString("lt-LT", { maximumFractionDigits: 2 })} %` : "–")],
    ["Įmonės vertė", (p) => (p.mcap ? fmtBig(p.mcap, CUR_SIGN[p.cur] || p.cur) : "–")],
    ["Analitikų vidurkis", (p) => (p.an && p.an.n ? `${{ strong_buy: "Stipriai pirkti", buy: "Pirkti", hold: "Laikyti", underperform: "Prasčiau už rinką", sell: "Parduoti" }[p.an.key] || "–"} (${p.an.n})` : "–")],
    ["Tikslinė kaina", (p) => (p.an && p.an.up !== undefined ? fmtPct(p.an.up, 0) : "–"), "an"],
  ];
  function renderCmp() {
    const f = $("#f-cmp");
    const picks = ["a0", "a1", "a2"].map((k) => find(f[k].value)).filter((a) => a && P.items[a.s]);
    const uniq = picks.filter((a, i) => picks.findIndex((b) => b.s === a.s) === i);
    const params = new URLSearchParams(location.search); params.set("c", uniq.map((a) => a.s).join(",")); params.delete("a");
    history.replaceState(null, "", `?${params}#palyginti`);
    if (uniq.length < 2) { $("#o-cmp").innerHTML = `<div class="card"><p class="muted" style="margin:0">Pasirink bent du aktyvus.</p></div>`; return; }
    const cols = ["#4f8cff", "#f5b335", "#2ec4b6"];
    const series = uniq.map((a, i) => { const sp = P.items[a.s].spark; return { name: a.n, values: sp.map((v) => (v / sp[0]) * 100), color: cols[i] }; });
    const cell = (row, a) => { const p = P.items[a.s]; const v = row[2] ? (row[2] === "an" ? (p.an || {}).up : p[row[2]]) : null; return `<td class="${v === null || v === undefined ? "" : v >= 0 ? "up" : "down"}">${row[1](p)}</td>`; };
    $("#o-cmp").innerHTML = `
      <div class="card"><h3>Kaip keitėsi 100 € per metus</h3>${multiLineSVG(series, { h: 240, fmt: (v) => `${Math.round(v)} €`, labels: ["Prieš metus", "Prieš pusmetį", "Dabar"] })}</div>
      <div class="card cmp-table-wrap"><table class="cmp-table"><thead><tr><th></th>${uniq.map((a) => `<th><a href="${assetUrl(a.s)}">${logoHTML(a.s, a.n, "#1d3a63", 32)}<span>${esc(a.n)}</span></a>${starHTML(a.s, a.n)}</th>`).join("")}</tr></thead>
      <tbody>${CMP_ROWS.map((r) => `<tr><th scope="row">${r[0]}</th>${uniq.map((a) => cell(r, a)).join("")}</tr>`).join("")}</tbody></table>
      <p class="muted small">Kainos skirtingomis valiutomis. Analitikų duomenys – Yahoo Finance, tai trečiųjų šalių nuomonės, ne InvestAI rekomendacija.</p></div>`;
  }

  /* ---------- Paleidimas ---------- */
  const PANELS = { jei: renderJei, taupymas: renderSav, dividendai: () => renderDiv(), palyginti: renderCmp };
  function show(id) {
    if (!PANELS[id]) id = "jei";
    document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === id)));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== id));
    history.replaceState(null, "", `${location.search}#${id}`);
    PANELS[id]();
  }
  document.addEventListener("DOMContentLoaded", async () => {
    if (document.body.dataset.page !== "tools") return;
    const [all, prices] = await Promise.all([allAssets(), loadPrices()]);
    P = prices;
    A = all.filter((a) => P.items[a.s]);
    $("#asset-list").innerHTML = A.map((a) => `<option value="${esc(label(a))}"></option>`).join("");
    const q = new URLSearchParams(location.search);
    const byS = (s) => A.find((a) => a.s === s);
    const a0 = byS(q.get("a")) || byS("NASDAQ:NVDA");
    if (a0) $("#f-jei").a.value = label(a0);
    const c = (q.get("c") || "").split(",").map(byS).filter(Boolean);
    const defaults = [c[0] || byS("NASDAQ:NVDA"), c[1] || (c[0] ? byS("AMEX:SPY") : byS("NASDAQ:AMD")), c[2]];
    ["a0", "a1", "a2"].forEach((k, i) => { if (defaults[i]) $("#f-cmp")[k].value = label(defaults[i]); });
    const ign = byS("OMXVSE:IGN1L");
    if (ign) { $("#f-div").a.value = label(ign); renderDiv(true); }
    divPicks();
    $("#f-jei").addEventListener("input", renderJei);
    $("#f-jei").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) { jeiK = b.dataset.k; renderJei(); } });
    $("#f-sav").addEventListener("input", renderSav);
    $("#f-div").addEventListener("input", (e) => renderDiv(e.target.name === "a"));
    $("#f-div").addEventListener("click", (e) => { const b = e.target.closest("[data-pick]"); if (b) { $("#f-div").a.value = label(byS(b.dataset.pick)); renderDiv(true); } });
    $("#f-cmp").addEventListener("input", renderCmp);
    document.querySelectorAll("form.calc-form, #f-cmp").forEach((f) => f.addEventListener("submit", (e) => e.preventDefault()));
    document.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
    show(location.hash.slice(1) || "jei");
  });
})();
