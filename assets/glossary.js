// InvestAI – investavimo terminų žodynas pradedantiesiems ir paaiškinimai prie rodiklių.
"use strict";
const GLOSSARY = [
  // [id, terminas, grupė, paaiškinimas, pavyzdys]
  ["akcija", "Akcija", "Pagrindai", "Įmonės nuosavybės dalis. Turėdamas akciją, esi mažytė įmonės savininko dalis: uždirbi, jei kaina kyla arba įmonė moka dividendus, ir prarandi, jei kaina krenta.", "Nupirkęs 1 Apple akciją, turi mažą Apple dalį."],
  ["etf", "ETF (biržoje prekiaujamas fondas)", "Pagrindai", "Fondas, kuriuo prekiaujama biržoje kaip akcija. Vienas ETF dažnai turi šimtus ar tūkstančius įmonių, todėl rizika paskirstoma plačiau nei perkant vieną akciją.", "VWCE turi ~3 700 įmonių iš viso pasaulio."],
  ["indeksas", "Indeksas", "Pagrindai", "Taisyklėmis sudarytas įmonių sąrašas, rodantis rinkos dalies pokytį. Pats indeksas – tik skaičius; į jį investuojama per indeksų fondus (ETF).", "S&P 500 – 500 didelių JAV įmonių."],
  ["sp500", "S&P 500", "Pagrindai", "Indeksas, sudarytas iš ~500 didžiausių JAV biržose kotiruojamų įmonių. Dažniausiai naudojamas kaip „visos JAV rinkos“ matas.", ""],
  ["nasdaq100", "Nasdaq 100", "Pagrindai", "100 didžiausių ne finansų įmonių Nasdaq biržoje. Jame daug technologijų įmonių, todėl jis paprastai svyruoja labiau nei S&P 500.", ""],
  ["acwi", "MSCI ACWI / pasaulio indeksas", "Pagrindai", "Visų pasaulio išsivysčiusių ir besivystančių rinkų didelių ir vidutinių įmonių indeksas. InvestAI jį naudoja kaip atskaitos tašką, lygindamas tavo portfelį su „visu pasauliu“.", ""],
  ["kripto", "Kriptovaliuta", "Pagrindai", "Skaitmeninis turtas, veikiantis blokų grandinėje (pvz., Bitcoin). Neturi įmonės pelno ar dividendų už savęs, todėl kaina labai priklauso nuo paklausos ir svyruoja itin stipriai.", ""],
  ["obligacija", "Obligacija", "Pagrindai", "Paskola įmonei ar valstybei: tu skolini pinigus, o gauni palūkanas ir pabaigoje – pinigus atgal. Paprastai svyruoja mažiau nei akcijos, bet emitentas gali ir neatsiskaityti.", ""],
  ["brokeris", "Brokeris", "Pagrindai", "Įmonė ar programėlė, per kurią perki ir parduodi akcijas bei fondus (pvz., bankas, Revolut, Lightyear, Interactive Brokers).", ""],
  ["dividendai", "Dividendai", "Pajamos", "Pelno dalis, kurią įmonė išmoka akcininkams pinigais. Ne visos įmonės moka dividendus – augančios dažnai pelną investuoja atgal į verslą.", ""],
  ["dy", "Dividendų pajamingumas", "Pajamos", "Kiek procentų nuo dabartinės akcijos kainos per metus sumokama dividendais. Aukštas pajamingumas kartais reiškia, kad kaina smarkiai nukrito – verta pasižiūrėti kodėl.", "Akcija kainuoja 100 €, dividendai 4 € per metus → 4 %."],
  ["exdiv", "Ex-dividend data", "Pajamos", "Diena, nuo kurios nupirkus akciją artimiausių dividendų nebegausi. Norint gauti dividendus, akciją reikia turėti iki šios dienos.", ""],
  ["mokestis-saltinio", "Mokestis prie šaltinio", "Pajamos", "Mokestis, kurį užsienio šalis nuskaičiuoja nuo dividendų dar prieš juos gaunant. Pvz., JAV dividendams dažnai taikomas 15 % tarifas, jei pateikta W-8BEN forma.", ""],
  ["pe", "P/E (kainos ir pelno santykis)", "Vertinimas", "Akcijos kaina, padalyta iš metinio pelno vienai akcijai. Parodo, kiek metų pelno „kainuoja“ akcija. Aukštas P/E dažnai reiškia, kad investuotojai tikisi didelio augimo; žemas – mažesnių lūkesčių arba problemų.", "Kaina 100 €, pelnas 5 € akcijai → P/E 20."],
  ["fpe", "Prognozinis P/E", "Vertinimas", "Tas pats kaip P/E, tik skaičiuojamas pagal analitikų prognozuojamą ateinančių 12 mėnesių pelną. Tai prognozė, todėl gali smarkiai skirtis nuo to, kas įvyks.", ""],
  ["mcap", "Įmonės vertė (rinkos kapitalizacija)", "Vertinimas", "Visų įmonės akcijų vertė biržoje: kaina × akcijų skaičius. Rodo, kiek rinka šiandien „vertina“ visą įmonę.", ""],
  ["eps", "Pelnas vienai akcijai (EPS)", "Vertinimas", "Įmonės grynasis pelnas, padalytas iš akcijų skaičiaus. Iš jo skaičiuojamas P/E.", ""],
  ["pajamos", "Pajamos", "Įmonės rezultatai", "Visa suma, kurią įmonė gavo pardavusi prekes ar paslaugas, prieš atimant išlaidas. Didelės pajamos dar nereiškia pelno.", ""],
  ["pelnas", "Grynasis pelnas", "Įmonės rezultatai", "Kas lieka iš pajamų atėmus visas išlaidas, palūkanas ir mokesčius.", ""],
  ["marza", "Bendrasis pelningumas (marža)", "Įmonės rezultatai", "Kiek procentų pajamų lieka atėmus tiesiogines produkto savikainos išlaidas. Aukšta marža dažnai rodo stiprią įmonės poziciją rinkoje.", ""],
  ["skola", "Skola ir skolos santykis (D/E)", "Rodikliai", "Kiek įmonė skolinga, palyginti su akcininkų nuosavu kapitalu. 50 % reiškia, kad skolų yra pusė nuosavo kapitalo. Didelė skola didina riziką, kai pelnas sumažėja ar pakyla palūkanos.", "D/E 30 % – skola nedidelė; 200 % – skolų dvigubai daugiau nei nuosavo kapitalo."],
  ["roe", "ROE (grąža nuosavam kapitalui)", "Rodikliai", "Kiek pelno įmonė uždirba iš kiekvieno akcininkų įdėto euro per metus. Kuo didesnis, tuo efektyviau naudojami pinigai. Atsargiai: labai didelį ROE gali „pripūsti“ didelė skola.", "ROE 20 % – iš 100 € nuosavo kapitalo per metus uždirbama 20 € pelno."],
  ["beta", "Beta (svyravimai, palyginti su rinka)", "Rodikliai", "Rodo, kiek akcija paprastai svyruoja, palyginti su visa rinka. 1 – kaip rinka, 2 – dvigubai stipriau, 0,5 – perpus ramiau.", "Jei rinka krenta 10 %, akcija su beta 1,5 vidutiniškai krenta apie 15 %."],
  ["rezultatai", "Ketvirčio rezultatai", "Įmonės rezultatai", "Kas tris mėnesius įmonės skelbia pajamas, pelną ir dažnai prognozes. Tomis dienomis kaina gali smarkiai pajudėti į bet kurią pusę.", ""],
  ["ipo", "IPO (pirminis viešas siūlymas)", "Įmonės rezultatai", "Kai įmonė pirmą kartą pradeda prekiauti akcijomis biržoje. Pirmosiomis dienomis kaina dažnai labai svyruoja.", ""],
  ["vol", "Svyravimai (volatilumas)", "Rizika", "Kaip stipriai kaina kyla ir krenta per metus. 15–20 % – įprasta plačiam indeksui, 40–60 % – rizikingai akcijai, 60 % ir daugiau – kriptovaliutoms.", ""],
  ["drawdown", "Kritimas nuo piko", "Rizika", "Kiek kaina nukrito nuo aukščiausio taško per pasirinktą laikotarpį. Padeda suprasti, kokie nuostoliai buvo galimi praeityje.", ""],
  ["range52", "52 savaičių intervalas", "Rizika", "Žemiausia ir aukščiausia kaina per paskutinius metus. Parodo, kurioje šio intervalo vietoje kaina yra dabar.", ""],
  ["diversifikacija", "Diversifikacija", "Rizika", "Pinigų paskirstymas tarp skirtingų įmonių, sektorių, šalių ir turto rūšių, kad vienos investicijos nesėkmė nesugriautų viso portfelio.", ""],
  ["koncentracija", "Koncentracija", "Rizika", "Kai didelė portfelio dalis sudėta į vieną įmonę, sektorių ar šalį. Tai didina ir galimą pelną, ir galimus nuostolius.", ""],
  ["sektorius", "Sektorius", "Rizika", "Ekonomikos šaka, kuriai priklauso įmonė: technologijos, finansai, sveikatos apsauga, energetika ir t. t. To paties sektoriaus įmonės dažnai kyla ir krenta kartu.", ""],
  ["rizikos-balas", "Diversifikacijos balas", "Rizika", "InvestAI skaičiuojamas 0–100 balas, rodantis, kaip plačiai paskirstytas portfelis ir kiek jis svyruoja. Tai ne įvertinimas, ar investicijos geros – tik kiek jos priklauso nuo kelių pozicijų.", ""],
  ["analitikai", "Analitikų vertinimas", "Analitikai", "Bankų ir tyrimų įmonių analitikų nuomonių vidurkis: pirkti, laikyti ar parduoti. Tai trečiųjų šalių nuomonės, jos dažnai klysta ir keičiasi.", ""],
  ["tikslas", "Tikslinė kaina", "Analitikai", "Kainą, kurią analitikas tikisi po ~12 mėnesių. Tai prognozė, ne pažadas; skirtingų analitikų tikslai gali skirtis kelis kartus.", ""],
  ["palukanos", "Palūkanų norma", "Ekonomika", "Pinigų skolinimosi kaina. Kai centriniai bankai ją kelia, paskolos brangsta ir akcijų kainos dažnai spaudžiamos; kai mažina – atvirkščiai.", ""],
  ["fed", "FED", "Ekonomika", "JAV centrinis bankas (Federalinis rezervų bankas). Jo palūkanų sprendimai veikia viso pasaulio rinkas.", ""],
  ["ecb", "ECB", "Ekonomika", "Europos centrinis bankas – nustato palūkanas euro zonoje, taip pat ir Lietuvoje.", ""],
  ["infliacija", "Infliacija", "Ekonomika", "Kainų augimas. Jei infliacija 3 %, už tą pačią sumą po metų nuperki ~3 % mažiau. Dėl to pinigai, laikomi be palūkanų, pamažu nuvertėja.", ""],
  ["bvp", "BVP", "Ekonomika", "Bendrasis vidaus produktas – visų šalyje per laikotarpį sukurtų prekių ir paslaugų vertė. Rodo, ar ekonomika auga.", ""],
  ["sudetines", "Sudėtinės palūkanos", "Strategija", "Kai uždirbta grąža vėl investuojama ir pati pradeda uždirbti. Ilgainiui tai smarkiai padidina sumą – todėl svarbu pradėti anksčiau.", "1 000 € su 7 % per metus po 30 m. ≈ 7 600 €."],
  ["dca", "Periodinis investavimas", "Strategija", "Investuoti tą pačią sumą reguliariai (pvz., kas mėnesį), nepriklausomai nuo kainos. Taip nereikia spėlioti tinkamo momento.", ""],
  ["rebalansavimas", "Rebalansavimas", "Strategija", "Portfelio grąžinimas į pasirinktas proporcijas: pvz., jei akcijos paaugo ir jų dalis tapo per didelė, dalis perkeliama į kitus aktyvus arba nauji pinigai skiriami atsilikusiems.", ""],
  ["pasyvus", "Pasyvus investavimas", "Strategija", "Investavimas į plačius indeksų fondus ilgam laikui, nebandant atspėti, kuri akcija ar momentas bus geriausias.", ""],
  ["investicine-saskaita", "Investicinė sąskaita", "Strategija", "Lietuvoje gyventojams prieinama speciali sąskaita, kurioje investuojant pelno mokestis mokamas tik išsiimant daugiau pinigų, nei buvo įnešta. Sąlygas verta pasitikslinti VMI ar savo banke.", ""],
  ["uzdelsta", "Uždelsta kaina", "Duomenys", "Nemokami kainų duomenys dažniausiai vėluoja ~15 minučių. InvestAI tai visada pažymi, kad nepainiotum su tikslia realaus laiko kaina.", ""],
  ["spread", "Pirkimo ir pardavimo kainų skirtumas", "Duomenys", "Skirtumas tarp kainos, už kurią galima nupirkti, ir kainos, už kurią galima parduoti. Mažai prekiaujamų akcijų jis didesnis – tai paslėpta sandorio kaina.", ""],
  ["likvidumas", "Likvidumas", "Duomenys", "Kaip lengvai ir greitai galima parduoti aktyvą nenumušant kainos. Baltijos akcijos dažnai mažiau likvidžios nei didžiosios JAV įmonės.", ""],
];
const TERM = Object.fromEntries(GLOSSARY.map(([id, t, g, d, ex]) => [id, { id, t, g, d, ex }]));
const termHTML = (id, label) => (TERM[id] ? `<button type="button" class="term" data-term="${id}">${esc(label || TERM[id].t)}</button>` : esc(label || id));

// Paspaudus terminą – trumpas paaiškinimas šalia
let _termPop;
document.addEventListener("click", (e) => {
  const b = e.target.closest(".term[data-term]");
  if (!b) { if (_termPop && !e.target.closest(".term-pop")) { _termPop.remove(); _termPop = null; } return; }
  e.preventDefault(); e.stopPropagation();
  if (_termPop) { const same = _termPop.dataset.for === b.dataset.term; _termPop.remove(); _termPop = null; if (same) return; }
  const t = TERM[b.dataset.term];
  const pop = document.createElement("div");
  pop.className = "term-pop"; pop.dataset.for = t.id; pop.setAttribute("role", "dialog");
  pop.innerHTML = `<b>${esc(t.t)}</b><p>${esc(t.d)}</p>${t.ex ? `<p class="term-ex">${esc(t.ex)}</p>` : ""}<a href="zodynas.html#${t.id}">Visas žodynas</a>`;
  document.body.append(pop);
  const r = b.getBoundingClientRect(), pw = Math.min(320, innerWidth - 24);
  pop.style.width = `${pw}px`;
  pop.style.left = `${Math.max(12, Math.min(r.left + scrollX, scrollX + innerWidth - pw - 12))}px`;
  pop.style.top = `${r.bottom + scrollY + 8}px`;
  _termPop = pop;
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && _termPop) { _termPop.remove(); _termPop = null; } });

function pageGlossary() {
  const groups = [...new Set(GLOSSARY.map((g) => g[2]))];
  const q = $("#g-q");
  const draw = () => {
    const v = (q.value || "").trim().toLowerCase();
    $("#g-list").innerHTML = groups.map((g) => {
      const items = GLOSSARY.filter((x) => x[2] === g && (!v || (x[1] + " " + x[3]).toLowerCase().includes(v)));
      return items.length ? `<section class="g-group"><h2>${esc(g)}</h2><dl>${items.map(([id, t, , d, ex]) => `<div class="g-item" id="${id}"><dt>${esc(t)}</dt><dd>${esc(d)}${ex ? `<span class="term-ex">${esc(ex)}</span>` : ""}</dd></div>`).join("")}</dl></section>` : "";
    }).join("") || `<p class="muted">Nieko nerasta.</p>`;
  };
  q.addEventListener("input", draw);
  draw();
  $("#g-jump").innerHTML = groups.map((g) => `<a href="#g-${esc(g)}" data-g="${esc(g)}">${esc(g)}</a>`).join("");
  $("#g-jump").addEventListener("click", (e) => { const a = e.target.closest("[data-g]"); if (!a) return; e.preventDefault(); q.value = ""; draw(); [...document.querySelectorAll(".g-group h2")].find((h) => h.textContent === a.dataset.g)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) { t.classList.add("g-hit"); setTimeout(() => t.scrollIntoView({ block: "center" }), 60); } }
}
