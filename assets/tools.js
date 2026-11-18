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
    const infl = f.infl.checked, defl = (y) => (infl ? Math.pow(1.025, y) : 1);
    const series = SAV.map(([n, r, c]) => {
      const vals = [init]; let v = init;
      for (let m = 1; m <= yrs * 12; m++) { v = v * (1 + r / 100 / 12) + mon; if (m % 12 === 0) vals.push(v / defl(m / 12)); }
      return { name: `${n} (${r} % per metus)`, values: vals, color: c, end: v / defl(yrs), r, n };
    });
    const paid = init + mon * 12 * yrs;
    const contrib = Array.from({ length: yrs + 1 }, (_, i) => init + mon * 12 * i);
    $("#o-sav").innerHTML = `
      <p class="calc-q">Per ${yrs} m. pats įneštum <b>${eur(paid)}</b>. Priklausomai nuo grąžos, sukauptum:</p>
      <div class="sav-cards">${series.map((s) => `<div class="sav-card" style="--c:${s.color}"><span>${s.n}, ${s.r} %</span><b>${eur(s.end)}</b>${infl ? "<small>šiandienos pinigais</small>" : `<small>iš jų uždirbta ${eur(s.end - paid)}</small>`}</div>`).join("")}</div>
      ${multiLineSVG([...series, { name: "Įnešta suma", values: contrib, color: "var(--muted)", dash: true, width: 1.4 }], { h: 240, fmt: (v) => eur(v), zero: true, labels: ["Šiandien", `po ${Math.round(yrs / 2)} m.`, `po ${yrs} m.`] })}
      ${infl ? `<p class="note">Sumos perskaičiuotos šiandienos pinigais: po ${yrs} m. 1 € perkamąja galia atitiks ~${(1 / defl(yrs)).toLocaleString("lt-LT", { maximumFractionDigits: 2 })} € šiandien.</p>` : ""}
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
  const CMP_R = [["3 mėn.", 91], ["1 m.", 365], ["2 m.", 730], ["5 m.", 1826]];
  let cmpDays = 365, cmpList = [];
  const drawCmpChart = () => mountCompareChart($("#cmp-chart"), cmpList, cmpDays).catch(() => {});
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
      <div class="card"><div class="card-head"><h3>Kaip keitėsi 100 €</h3><div class="seg seg-sm" id="cmp-r">${CMP_R.map(([l, d]) => `<button type="button" data-d="${d}" aria-pressed="${d === cmpDays}">${l}</button>`).join("")}</div></div><div id="cmp-chart"><div class="skel" style="height:300px"></div></div><ul class="ml-legend">${series.map((x) => `<li><i style="background:${x.color}"></i>${esc(x.name)}</li>`).join("")}</ul></div>
      <div class="card cmp-table-wrap"><table class="cmp-table"><thead><tr><th></th>${uniq.map((a) => `<th><a href="${assetUrl(a.s)}">${logoHTML(a.s, a.n, "#1d3a63", 32)}<span>${esc(a.n)}</span></a>${starHTML(a.s, a.n)}</th>`).join("")}</tr></thead>
      <tbody>${CMP_ROWS.map((r) => `<tr><th scope="row">${r[0]}</th>${uniq.map((a) => cell(r, a)).join("")}</tr>`).join("")}</tbody></table>
      <p class="muted small">Kainos skirtingomis valiutomis; grafike – kiek būtų verta 100 € (vietine valiuta), investuota laikotarpio pradžioje. Analitikų duomenys – Yahoo Finance, tai trečiųjų šalių nuomonės, ne InvestAI rekomendacija.</p></div>`;
    cmpList = uniq.map((a, i) => ({ s: a.s, p: P.items[a.s], color: cols[i], label: a.s.split(":")[1] }));
    $("#cmp-r").addEventListener("click", (e) => { const b = e.target.closest("[data-d]"); if (!b) return; cmpDays = +b.dataset.d; $("#cmp-r").querySelectorAll("[data-d]").forEach((x) => x.setAttribute("aria-pressed", String(+x.dataset.d === cmpDays))); drawCmpChart(); });
    drawCmpChart();
  }

  /* ---------- Lietuvos mokesčiai (2026 m. taisyklės, VMI) ---------- */
  const VDU12 = 27745.8, VDU36 = 83237.4, VDU60 = 138729;
  let txMode = "sale", hold = "lt5";
  const eur2 = (v) => `${v.toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  // Progresinė dalis: „krūva“ nuo base iki base+amt pagal 20/25/32 % ribas
  function progressive(base, amt) {
    let tax = 0, from = base, left = amt;
    for (const [lim, r] of [[VDU36, 0.2], [VDU60, 0.25], [Infinity, 0.32]]) {
      if (left <= 0) break;
      const room = Math.max(0, lim - from), take = Math.min(room, left);
      tax += take * r; left -= take; from += take;
    }
    return tax;
  }
  function renderTax() {
    const f = $("#f-tax"), out = $("#o-tax");
    f.querySelectorAll("[data-tx]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tx === txMode)));
    f.querySelectorAll("[data-hold]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hold === hold)));
    f.querySelectorAll("[data-for]").forEach((d) => (d.hidden = d.dataset.for !== txMode));
    let html = "";
    if (txMode === "sale") {
      const gain = num(f.sale.value) - num(f.cost.value) - num(f.fees.value);
      const taxable = Math.max(0, gain - 500);
      let tax = 0, lines = [];
      if (gain <= 0) lines.push(["Pelno nėra – mokėti nereikia", ""]);
      else if (hold === "ge5") { tax = taxable * 0.15; lines.push(["Apmokestinama suma (pelnas − 500 €)", eur2(taxable)], ["Tarifas", "15 % (laikyta ≥ 5 m.)"]); }
      else {
        const room = Math.max(0, VDU12 - num(f.other.value));
        const in15 = Math.min(taxable, room), rest = taxable - in15;
        const base = num(f.salary.value) + Math.min(VDU12, num(f.other.value) + in15);
        const prog = progressive(base, rest);
        tax = in15 * 0.15 + prog;
        lines.push(["Apmokestinama suma (pelnas − 500 €)", eur2(taxable)], ["Iš jos 15 % tarifu", eur2(in15)]);
        if (rest > 0) lines.push(["Viršija 12 VDU ribą – 20/25/32 % tarifais", eur2(rest)]);
      }
      html = `<p class="calc-q">Pelnas: <b>${eur2(Math.max(0, gain))}</b>. Apytikslis gyventojų pajamų mokestis:</p><p class="calc-big">${eur2(tax)}</p>
        <ul class="tax-lines">${lines.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join("")}</ul>
        <p class="muted small">500 € neapmokestinama suma taikoma visam metų finansinių priemonių pardavimo pelnui (ne kiekvienam pardavimui atskirai). ${hold === "lt5" ? "Trumpiau nei 5 m. laikytų akcijų pelnui 15 % tarifas taikomas, kol visos ne darbo pajamos neviršija 12 VDU (27 745,80 € 2026 m.)." : ""}</p>`;
    } else if (txMode === "is") {
      const over = Math.max(0, num(f.out.value) - num(f.in.value));
      html = `<p class="calc-q">Iš investicinės sąskaitos išsiimant daugiau, nei įnešei, apmokestinamas tik skirtumas:</p><p class="calc-big">${eur2(over * 0.15)}</p>
        <ul class="tax-lines"><li><span>Apmokestinama suma</span><b>${eur2(over)}</b></li><li><span>Tarifas</span><b>15 % (nepriklausomai nuo sumos)</b></li></ul>
        <p class="muted small">Kol pinigus laikai ir perinvestuoji sąskaitoje, mokestis atidedamas. 500 € lengvata investicinei sąskaitai netaikoma.</p>`;
    } else {
      const dv = num(f.dv.value), wh = Math.min(num(f.wh.value), 15);
      const lt = dv * Math.max(0, 0.15 - wh / 100);
      html = `<p class="calc-q">Dividendams Lietuvoje taikomas 15 % tarifas. Užsienyje nuskaičiuotas mokestis paprastai įskaitomas pagal dvigubo apmokestinimo sutartį, todėl Lietuvoje dar reikėtų sumokėti:</p><p class="calc-big">${eur2(lt)}</p>
        <ul class="tax-lines"><li><span>Nuskaičiuota užsienyje</span><b>${eur2(dv * num(f.wh.value) / 100)}</b></li><li><span>Lietuvos mokestis (15 %)</span><b>${eur2(dv * 0.15)}</b></li><li><span>Liko sumokėti Lietuvoje</span><b>${eur2(lt)}</b></li></ul>
        <p class="muted small">Įskaitymas negali viršyti Lietuvos mokesčio. Jei užsienyje nuskaičiuota daugiau nei 15 %, skirtumą susigrąžinti galima tik toje šalyje.</p>`;
    }
    out.innerHTML = html + `<p class="tax-src">Šaltiniai: <a href="https://www.vmi.lt/evmi/kaip-apmokestinamos-finansini%C5%B3-priemoni%C5%B3-pardavimo-pajamos-" target="_blank" rel="noopener">VMI: finansinių priemonių pardavimo pajamos</a> · <a href="https://www.vmi.lt/evmi/5725" target="_blank" rel="noopener">VMI: GPM tarifai</a>. Apytikslis skaičiavimas pagal 2026 m. taisykles – ne mokesčių konsultacija; prieš deklaruodamas pasitikrink VMI arba pas konsultantą.</p>`;
  }

  /* ---------- Paleidimas ---------- */
  const PANELS = { jei: renderJei, taupymas: renderSav, dividendai: () => renderDiv(), palyginti: renderCmp, mokesciai: renderTax };
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
    $("#f-tax").addEventListener("input", renderTax);
    $("#f-tax").addEventListener("click", (e) => { const b = e.target.closest("[data-tx],[data-hold]"); if (!b) return; if (b.dataset.tx) txMode = b.dataset.tx; else hold = b.dataset.hold; renderTax(); });
    document.querySelectorAll("form.calc-form, #f-cmp, #f-tax").forEach((f) => f.addEventListener("submit", (e) => e.preventDefault()));
    document.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
    show(location.hash.slice(1) || "jei");
  });
})();
