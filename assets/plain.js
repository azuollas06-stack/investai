/* InvestAI – „skaičiai paprastais žodžiais“ ir garsių investuotojų taisyklių patikra.
   Viskas skaičiuojama naršyklėje iš mūsų duomenų (prices.json, fund.json), be AI – todėl greita, nemokama ir patikrinama.
   Tai aprašymas, ne rekomendacija: nesakome „pirk“ ar „parduok“, tik ką rodo skaičiai. */
(function () {
  const pctS = (v, d = 0) => `${(v * 100).toFixed(d).replace(".", ",").replace("-", "−")} %`;
  const num = (v, d = 1) => Number(v).toFixed(d).replace(".", ",");
  const FIN = /Finans|Bank|Draud/i;
  const has = (v) => typeof v === "number" && isFinite(v);

  // Rinkos palyginimui – visų mūsų akcijų P/E mediana
  let _med = null;
  function marketPE(P) {
    if (_med !== null) return _med;
    const v = Object.values((P && P.items) || {}).map((x) => x.pe).filter((x) => has(x) && x > 0 && x < 300).sort((a, b) => a - b);
    _med = v.length > 20 ? v[Math.floor(v.length / 2)] : 22;
    return _med;
  }

  // Metinis grynasis pelnas iš fund.json: [[metai, suma], ...]
  function niHist(f) { return ((f && f.ni) || []).filter((x) => has(x[1])); }
  function revHist(f) { return ((f && f.rev) || []).filter((x) => has(x[1])); }
  function lossYears(f) { const h = niHist(f); return { n: h.length, loss: h.filter((x) => x[1] < 0).length }; }
  // Pelnas „popieriuje“, bet pagrindinė veikla nuostolinga (vienkartinės pajamos, investicijų perkainojimas ir pan.)
  const oneOff = (p) => has(p.om) && has(p.pm) && p.om < 0 && p.pm > 0;
  const coreProfit = (p) => (oneOff(p) ? false : has(p.pm) ? p.pm > 0 : null);
  function growingYears(h) { let up = 0; for (let i = 1; i < h.length; i++) if (h[i][1] > h[i - 1][1]) up++; return { up, of: Math.max(0, h.length - 1) }; }

  /* ---------- Rodikliai žodžiais ---------- */
  // tone: good / ok / bad / na. term – žodyno raktas (jei yra).
  function metrics(p, f, P, meta) {
    if (!p) return [];
    const fin = meta && FIN.test(meta.sector || "");
    const out = [];
    const med = marketPE(P);
    // Pelningumas
    if (oneOff(p)) {
      out.push({ k: "Pelningumas", v: pctS(p.pm), w: `Atsargiai: popieriuje pelninga, bet pagrindinė veikla nuostolinga (veiklos marža ${pctS(p.om)}). Pelną greičiausiai lėmė vienkartinės pajamos, ne pardavimai.`, t: "bad", term: "marza" });
    } else if (has(p.pm)) {
      const per100 = Math.round(p.pm * 100);
      out.push(p.pm >= 0.2 ? { k: "Pelningumas", v: pctS(p.pm), w: `Labai pelninga: iš kiekvienų 100 € pardavimų lieka ${per100} € grynojo pelno.`, t: "good", term: "marza" }
        : p.pm >= 0.08 ? { k: "Pelningumas", v: pctS(p.pm), w: `Pelninga: iš 100 € pardavimų lieka ${per100} € pelno.`, t: "good", term: "marza" }
        : p.pm >= 0 ? { k: "Pelningumas", v: pctS(p.pm), w: `Pelnas plonas: iš 100 € pardavimų lieka tik ${per100} €.`, t: "ok", term: "marza" }
        : { k: "Pelningumas", v: pctS(p.pm), w: `Nuostolinga: iš kiekvienų 100 € pardavimų prarandama ${Math.abs(per100)} €.`, t: "bad", term: "marza" });
    }
    // Pelno istorija
    const L = lossYears(f);
    if (L.n >= 3) out.push(L.loss === 0 ? { k: "Pelno istorija", v: `${L.n} iš ${L.n} m.`, w: `Pelninga visus pastaruosius ${L.n} metus.`, t: "good" }
      : L.loss === L.n ? { k: "Pelno istorija", v: `0 iš ${L.n} m.`, w: `Nuostolinga visus pastaruosius ${L.n} metus – įmonė dar neuždirba.`, t: "bad" }
      : { k: "Pelno istorija", v: `${L.n - L.loss} iš ${L.n} m.`, w: `Pelninga ${L.n - L.loss} iš ${L.n} pastarųjų metų – pelnas nepastovus.`, t: "ok" });
    // Augimas
    if (has(p.rg)) {
      out.push(p.rg >= 0.2 ? { k: "Pajamų augimas", v: pctS(p.rg), w: `Sparčiai auga: pajamos per metus padidėjo ${pctS(p.rg)}.`, t: "good" }
        : p.rg >= 0.05 ? { k: "Pajamų augimas", v: pctS(p.rg), w: `Auga: pajamos per metus padidėjo ${pctS(p.rg)}.`, t: "good" }
        : p.rg >= 0 ? { k: "Pajamų augimas", v: pctS(p.rg), w: "Auga lėtai – pajamos beveik nesikeičia.", t: "ok" }
        : { k: "Pajamų augimas", v: pctS(p.rg), w: `Pajamos mažėja (${pctS(p.rg)} per metus).`, t: "bad" });
    }
    // Kaina, palyginti su pelnu
    if (oneOff(p) && has(p.pe) && p.pe > 0) {
      out.push({ k: "Kaina pagal pelną (P/E)", v: num(p.pe), w: "P/E atrodo mažas, bet jis paremtas vienkartiniu pelnu, todėl klaidina. Pagal pagrindinę veiklą įmonė nuostolinga.", t: "bad", term: "pe" });
    } else if (has(p.pe) && p.pe > 0) {
      const r = p.pe / med;
      out.push(r < 0.7 ? { k: "Kaina pagal pelną (P/E)", v: num(p.pe), w: `Pigesnė nei dauguma: mokama ${num(p.pe, 0)} € už 1 € metinio pelno (vidutinė mūsų sąrašo akcija – ${num(med, 0)} €).`, t: "good", term: "pe" }
        : r <= 1.3 ? { k: "Kaina pagal pelną (P/E)", v: num(p.pe), w: `Panaši į vidutinę: ${num(p.pe, 0)} € už 1 € metinio pelno (vidurkis – ${num(med, 0)} €).`, t: "ok", term: "pe" }
        : r <= 2.5 ? { k: "Kaina pagal pelną (P/E)", v: num(p.pe), w: `Brangesnė nei dauguma: ${num(p.pe, 0)} € už 1 € pelno (vidurkis – ${num(med, 0)} €). Rinka tikisi spartaus augimo.`, t: "ok", term: "pe" }
        : { k: "Kaina pagal pelną (P/E)", v: num(p.pe), w: `Labai brangi pagal dabartinį pelną: ${num(p.pe, 0)} € už 1 € pelno. Kaina remiasi dideliais ateities lūkesčiais.`, t: "bad", term: "pe" });
    } else if (has(p.pm) && p.pm < 0) out.push({ k: "Kaina pagal pelną (P/E)", v: "–", w: "Pelno nėra, todėl P/E neskaičiuojamas – kaina remiasi tik ateities lūkesčiais.", t: "bad", term: "pe" });
    // Skola
    if (fin) { /* bankams skolos rodiklis neturi įprastos prasmės */ }
    else if (has(p.cash) && has(p.debt) && p.cash >= p.debt) out.push({ k: "Skola", v: has(p.de) ? `${num(p.de, 0)} %` : "–", w: "Grynųjų pinigų daugiau nei skolų – finansiškai tvirta.", t: "good", term: "skola" });
    else if (has(p.de)) out.push(p.de < 50 ? { k: "Skola", v: `${num(p.de, 0)} %`, w: "Skola nedidelė, palyginti su nuosavu kapitalu.", t: "good", term: "skola" }
      : p.de < 150 ? { k: "Skola", v: `${num(p.de, 0)} %`, w: "Vidutinė skola – įprasta daugeliui įmonių.", t: "ok", term: "skola" }
      : { k: "Skola", v: `${num(p.de, 0)} %`, w: "Didelė skola – sunkesniais laikais palūkanos gali slėgti pelną.", t: "bad", term: "skola" });
    // Kapitalo grąža
    if (has(p.roe)) out.push(p.roe >= 0.2 ? { k: "Grąža kapitalui (ROE)", v: pctS(p.roe), w: "Labai efektyviai naudoja akcininkų pinigus.", t: "good", term: "roe" }
      : p.roe >= 0.1 ? { k: "Grąža kapitalui (ROE)", v: pctS(p.roe), w: "Akcininkų pinigus naudoja vidutiniškai efektyviai.", t: "ok", term: "roe" }
      : { k: "Grąža kapitalui (ROE)", v: pctS(p.roe), w: "Akcininkų pinigai uždirba mažai.", t: p.roe < 0 ? "bad" : "ok", term: "roe" });
    // Laisvi pinigai
    if (has(p.fcf)) out.push(p.fcf > 0 ? { k: "Laisvi pinigų srautai", v: "teigiami", w: "Veikla atneša daugiau pinigų, nei išleidžiama investicijoms.", t: "good" }
      : { k: "Laisvi pinigų srautai", v: "neigiami", w: "Įmonė išleidžia daugiau, nei uždirba – gali tekti skolintis ar leisti naujų akcijų.", t: "bad" });
    // Dividendai
    if (has(p.dy) && p.dy > 0) out.push({ k: "Dividendai", v: `${num(p.dy, 1)} %`, w: p.dy >= 3 ? `Moka didelius dividendus: apie ${num(p.dy, 1)} € per metus už kiekvieną investuotą 100 €.` : `Moka dividendus: apie ${num(p.dy, 1)} € per metus už 100 €.`, t: "ok", term: "dividendai" });
    // Svyravimai
    if (has(p.beta)) out.push(p.beta >= 1.5 ? { k: "Svyravimai (beta)", v: num(p.beta), w: "Svyruoja daug stipriau nei rinka – kritimai gali būti gilūs.", t: "bad", term: "beta" }
      : p.beta >= 0.8 ? { k: "Svyravimai (beta)", v: num(p.beta), w: "Svyruoja panašiai kaip visa rinka.", t: "ok", term: "beta" }
      : { k: "Svyravimai (beta)", v: num(p.beta), w: "Ramesnė už rinką – svyruoja mažiau.", t: "good", term: "beta" });
    return out;
  }

  /* ---------- Vienas sakinys ---------- */
  function summary(p, f, P, meta) {
    if (!p || !has(p.pm)) return "";
    const L = lossYears(f), fin = meta && FIN.test(meta.sector || "");
    const growth = !has(p.rg) ? "" : p.rg >= 0.2 ? "sparčiai auganti" : p.rg >= 0.05 ? "auganti" : p.rg >= 0 ? "lėtai auganti" : "";
    const shrinking = has(p.rg) && p.rg < 0;
    let debt = "";
    if (!fin && has(p.cash) && has(p.debt) && p.cash >= p.debt) debt = " be didelių skolų";
    else if (!fin && has(p.de) && p.de >= 150) debt = " su didele skola";
    let s;
    if (oneOff(p)) {
      s = `${growth ? growth[0].toUpperCase() + growth.slice(1) + " įmonė" : "Įmonė"}${debt}${shrinking ? ", kurios pajamos mažėja," : ""}, tačiau pagrindinė veikla nuostolinga – pelnas popieriuje vienkartinis, todėl mažas P/E klaidina`;
    } else {
      const loss = p.pm < 0;
      const prof = p.pm >= 0.2 ? "labai pelninga" : p.pm >= 0.05 ? "pelninga" : p.pm >= 0 ? "vos pelninga" : L.n >= 3 && L.loss === L.n ? "nuolat nuostolinga" : "nuostolinga";
      const adj = growth ? `${prof}${loss ? ", bet" : " ir"} ${growth}` : prof;
      s = `${adj[0].toUpperCase() + adj.slice(1)} įmonė${debt}${shrinking ? ", kurios pajamos mažėja" : ""}`;
      if (has(p.pe) && p.pe > 0) { const r = p.pe / marketPE(P); s += r < 0.7 ? ", o akcija pagal pelną pigesnė nei dauguma" : r <= 1.3 ? ", o akcija pagal pelną kainuoja panašiai kaip vidutinė" : r <= 2.5 ? ", bet akcija pagal pelną brangesnė nei dauguma" : ", bet akcija pagal dabartinį pelną labai brangi"; }
      else if (loss) s += ", todėl akcijos kaina remiasi ateities lūkesčiais";
    }
    return s + ".";
  }

  /* ---------- Garsių investuotojų taisyklės (supaprastintos) ---------- */
  const Y = "y", N = "n", U = "u"; // atitinka / ne / nėra duomenų
  const chk = (ok, label) => ({ r: ok === null ? U : ok ? Y : N, label });
  const nz = (v) => has(v);
  function rules(p, f, P, meta) {
    if (!p) return [];
    const L = lossYears(f), ni = niHist(f), rv = revHist(f), med = marketPE(P);
    const g = growingYears(ni), gr = growingYears(rv);
    const peg = nz(p.peg) && p.peg > 0 ? p.peg : nz(p.pe) && p.pe > 0 && nz(p.eg) && p.eg > 0 ? p.pe / (p.eg * 100) : null;
    const lowDebt = meta && FIN.test(meta.sector || "") ? null : nz(p.cash) && nz(p.debt) && p.cash >= p.debt ? true : nz(p.de) ? p.de < 50 : null;
    const list = [
      { who: "Benjamin Graham", style: "Vertės investavimo tėvas: pigi, pelninga, saugi įmonė", checks: [
        chk(coreProfit(p) === false ? false : nz(p.pe) && p.pe > 0 ? p.pe < 15 : null, "P/E mažesnis nei 15"),
        chk(nz(p.pb) && p.pb > 0 ? p.pb < 1.5 || (nz(p.pe) && p.pe * p.pb < 22.5) : null, "Kaina nedaug viršija buhalterinę vertę (P/B < 1,5 arba P/E × P/B < 22,5)"),
        chk(L.n >= 3 ? L.loss === 0 : null, "Pelninga kiekvienais metais"),
        chk(nz(p.cr) ? p.cr >= 2 : null, "Trumpalaikis turtas bent 2 kartus viršija trumpalaikes skolas"),
        chk(nz(p.dy) ? p.dy > 0 : null, "Moka dividendus"),
      ] },
      { who: "Warren Buffett", style: "Puikus verslas su tvariu pranašumu ir maža skola", checks: [
        chk(nz(p.roe) ? p.roe >= 0.15 : null, "Grąža kapitalui (ROE) bent 15 %"),
        chk(coreProfit(p) === false ? false : nz(p.pm) ? p.pm >= 0.15 : null, "Pelno marža bent 15 %"),
        chk(lowDebt, "Maža skola"),
        chk(g.of >= 2 ? g.up === g.of || (g.up >= g.of - 1 && L.loss === 0) : null, "Pelnas pastoviai auga"),
        chk(nz(p.fcf) ? p.fcf > 0 : null, "Uždirba laisvų pinigų"),
      ] },
      { who: "Peter Lynch", style: "Augimas už protingą kainą", checks: [
        chk(coreProfit(p) === false ? false : peg !== null ? peg < 1 : null, "PEG mažesnis nei 1 (P/E mažesnis už pelno augimą)"),
        chk(nz(p.eg) ? p.eg >= 0.1 && p.eg <= 0.5 : null, "Pelnas auga 10–50 % per metus"),
        chk(lowDebt, "Maža skola"),
      ] },
      { who: "Philip Fisher", style: "Ilgalaikis augimas ir aukštos maržos", checks: [
        chk(nz(p.rg) ? p.rg >= 0.1 : null, "Pajamos auga bent 10 % per metus"),
        chk(gr.of >= 2 ? gr.up === gr.of : null, "Pajamos augo kiekvienais metais"),
        chk(nz(p.om) ? p.om >= 0.15 : null, "Veiklos marža bent 15 %"),
      ] },
      { who: "Joel Greenblatt", style: "„Magiška formulė“: geras verslas už pigią kainą", checks: [
        chk(nz(p.roe) ? p.roe >= 0.2 : null, "Aukšta grąža kapitalui (ROE bent 20 %)"),
        chk(coreProfit(p) === false ? false : nz(p.pe) && p.pe > 0 ? 100 / p.pe >= 6 : null, "Pelno grąža bent 6 % (P/E iki ~17)"),
      ] },
      { who: "John Neff", style: "Maža kaina, pastovus augimas ir dividendai", checks: [
        chk(coreProfit(p) === false ? false : nz(p.pe) && p.pe > 0 ? p.pe < med * 0.7 : null, "P/E gerokai žemesnis nei vidutinis"),
        chk(nz(p.eg) ? p.eg >= 0.07 && p.eg <= 0.2 : null, "Pelnas auga 7–20 % per metus"),
        chk(nz(p.dy) ? p.dy >= 2 : null, "Dividendų pajamingumas bent 2 %"),
      ] },
      { who: "John Templeton", style: "Pirkti, kai kiti panikuoja – bet tik kokybę", checks: [
        chk(nz(p.fromHigh) ? p.fromHigh <= -30 : null, "Kaina bent 30 % žemiau metų aukščiausios"),
        chk(coreProfit(p), "Pagrindinė veikla pelninga"),
        chk(lowDebt, "Maža skola"),
      ] },
    ];
    return list.map((x) => {
      const known = x.checks.filter((c) => c.r !== U);
      const pass = known.filter((c) => c.r === Y).length;
      return { ...x, pass, known: known.length, total: x.checks.length, ok: known.length >= Math.ceil(x.checks.length / 2) && pass === known.length };
    });
  }

  /* ---------- HTML ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MARK = { good: "✓", ok: "•", bad: "!", na: "–" };
  function plainHTML(p, f, P, meta) {
    const m = metrics(p, f, P, meta);
    if (m.length < 3) return "";
    const s = summary(p, f, P, meta);
    return `<section class="card plain" aria-labelledby="pl-h">
      <h2 class="plain-h" id="pl-h">Esmė paprastai</h2>
      ${s ? `<p class="plain-sum">${esc(s)}</p>` : ""}
      <ul class="plain-list">${m.map((x) => `<li class="pl-${x.t}"><span class="pl-mark" aria-hidden="true">${MARK[x.t]}</span><div><b>${x.term && typeof termHTML === "function" ? termHTML(x.term, x.k) : esc(x.k)}<em>${esc(x.v)}</em></b><span>${esc(x.w)}</span></div></li>`).join("")}</ul>
      <p class="muted small plain-note">Skaičiuojama automatiškai iš paskutinių metinių duomenų (Yahoo Finance). Tai aprašymas, ne rekomendacija pirkti ar parduoti.</p>
    </section>`;
  }
  function rulesHTML(p, f, P, meta) {
    const R = rules(p, f, P, meta).filter((r) => r.known >= 2);
    if (R.length < 3) return "";
    const ok = R.filter((r) => r.ok).length;
    return `<section class="card legends" aria-labelledby="lg-h">
      <h2 class="plain-h" id="lg-h">Kaip atrodo pagal garsių investuotojų taisykles</h2>
      <p class="muted small" style="margin:0 0 10px">Atitinka ${ok} iš ${R.length} stilių. Paspausk, kad pamatytum, kas tikrinama.</p>
      <div class="lg-list">${R.map((r) => `<details class="lg ${r.ok ? "lg-ok" : ""}"><summary><span class="lg-badge">${r.ok ? "✓" : `${r.pass}/${r.known}`}</span><span class="lg-who"><b>${esc(r.who)}</b><small>${esc(r.style)}</small></span></summary>
        <ul>${r.checks.map((c) => `<li class="lg-${c.r}"><span aria-hidden="true">${c.r === Y ? "✓" : c.r === N ? "✗" : "–"}</span><span class="lg-t">${esc(c.label)}${c.r === U ? " <small>(nėra duomenų)</small>" : ""}</span></li>`).join("")}</ul></details>`).join("")}</div>
      <p class="muted small plain-note">Taisyklės supaprastintos pagal viešai žinomus šių investuotojų principus. Jie patys šios akcijos nevertino. Tai mokomoji priemonė, ne rekomendacija.</p>
    </section>`;
  }

  window.PLAIN = { metrics, summary, rules, plainHTML, rulesHTML, marketPE, oneOff, coreProfit };
})();
