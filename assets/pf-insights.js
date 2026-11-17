// InvestAI – portfelio įžvalgos: fondų išskaidymas, palyginimas su pasaulio rinka, scenarijai, rezultatas.
// Visi rinkos svoriai – APYTIKSLIAI (2025–2026 m. viešai skelbiamos indeksų struktūros, suapvalinta).
"use strict";

const PFI = (() => {
  const SECTORS = ["Technologijos", "Finansai", "Pramonė", "Nebūtinos vartojimo prekės", "Komunikacijos", "Sveikatos apsauga", "Būtinos vartojimo prekės", "Energetika", "Žaliavos", "Komunalinės paslaugos", "Nekilnojamasis turtas"];
  const norm = (o) => { const s = Object.values(o).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / s])); };
  const W = (arr) => norm(Object.fromEntries(SECTORS.map((k, i) => [k, arr[i] || 0])));
  // Sektorių svoriai: Tech, Fin, Pram, Nebūt, Kom, Sveik, Būt, Energ, Žal, Komun, NT
  const FUND_SECTORS = {
    "Pasaulio indeksas": W([26, 17, 11, 10, 9, 9, 6, 3.5, 3.5, 2.5, 2]),
    "Platus JAV indeksas": W([33, 13, 8, 10, 10, 9, 5, 3, 2, 2.5, 2]),
    "JAV technologijų indeksas": W([60, 0, 2, 14, 16, 5, 3, 0, 0, 0, 0]),
    "Europos indeksas": W([8, 22, 18, 9, 4, 13, 8, 5, 5, 5, 1]),
    "Besivystančių rinkų indeksas": W([26, 23, 6, 13, 10, 3, 4, 4, 6, 3, 2]),
  };
  const REGIONS_ACWI = { "JAV": 0.64, "Europa": 0.15, "Japonija": 0.05, "Azija ir besivystančios": 0.11, "Kitos išsivysčiusios": 0.05 };
  const FUND_REGIONS = {
    "Pasaulio indeksas": REGIONS_ACWI,
    "Platus JAV indeksas": { "JAV": 1 },
    "JAV technologijų indeksas": { "JAV": 1 },
    "Europos indeksas": { "Europa": 1 },
    "Besivystančių rinkų indeksas": { "Azija ir besivystančios": 1 },
  };
  const COUNTRY_REGION = {
    "JAV": "JAV", "Lietuva": "Baltija", "Estija": "Baltija", "Latvija": "Baltija", "Japonija": "Japonija",
    "Kinija": "Azija ir besivystančios", "Taivanas": "Azija ir besivystančios", "Pietų Korėja": "Azija ir besivystančios",
    "Besivystančios rinkos": "Azija ir besivystančios", "Argentina": "Azija ir besivystančios",
    "Kanada": "Kitos išsivysčiusios", "Singapūras": "Kitos išsivysčiusios",
    "Vokietija": "Europa", "Prancūzija": "Europa", "Nyderlandai": "Europa", "Italija": "Europa", "Švedija": "Europa", "Norvegija": "Europa",
    "Danija": "Europa", "Suomija": "Europa", "Didžioji Britanija": "Europa", "Šveicarija": "Europa", "Europa": "Europa",
  };
  const NON_EQUITY = { "Kriptovaliuta": "Kriptovaliutos", "Grynieji": "Grynieji pinigai", "Auksas": "Auksas", "Obligacijos": "Obligacijos ir pinigų rinka" };
  const MARKET = { sectors: FUND_SECTORS["Pasaulio indeksas"], regions: REGIONS_ACWI };

  // Istoriniai nuosmukiai (apytiksliai, nuo piko iki dugno). Kriptovaliutos 2008 m. neegzistavo – naudojama prielaida.
  const SCENARIOS = [
    { id: "corr", name: "Įprasta korekcija", note: "Tokie kritimai akcijų rinkose pasitaiko beveik kas kelerius metus.", shock: { stocks: -10, crypto: -25, gold: -3, bonds: -2 } },
    { id: "y2022", name: "Kaip 2022 m.", note: "Palūkanų kilimo metai: krito ir akcijos, ir obligacijos, kriptovaliutos – apie du trečdalius.", shock: { stocks: -25, crypto: -65, gold: -15, bonds: -15 } },
    { id: "y2020", name: "Kaip 2020 m. kovą", note: "Pandemijos pradžia: staigus kritimas per kelias savaites, vėliau – greitas atsigavimas.", shock: { stocks: -34, crypto: -50, gold: -12, bonds: -5 } },
    { id: "y2008", name: "Kaip 2008 m.", note: "Finansų krizė: pasaulio akcijos krito daugiau nei per pusę, atsigavimas užtruko kelerius metus. Kriptovaliutų tuomet nebuvo – jų kritimas čia tik prielaida.", shock: { stocks: -55, crypto: -75, gold: -25, bonds: 0 } },
  ];
  const bucket = (r) => (r.type === "Kriptovaliuta" ? "crypto" : r.type === "Auksas" ? "gold" : r.type === "Obligacijos" ? "bonds" : r.type === "Grynieji" ? "cash" : "stocks");

  function addTo(map, k, v) { map.set(k, (map.get(k) || 0) + v); }
  // Išskaidymas: ETF paskirstomi pagal indekso struktūrą
  function exposures(rows) {
    const sec = new Map(), reg = new Map(), secEq = new Map(), regEq = new Map();
    let equity = 0;
    for (const r of rows) {
      if (NON_EQUITY[r.type] || r.sector === "Pinigų rinka" || r.sector === "Obligacijos" || r.sector === "Auksas" || r.sector === "Kriptovaliutos") {
        const k = NON_EQUITY[r.type] || (r.sector === "Pinigų rinka" ? "Obligacijos ir pinigų rinka" : r.sector);
        addTo(sec, k, r.value); addTo(reg, "Be šalies (kripto, grynieji ir pan.)", r.value);
        continue;
      }
      equity += r.value;
      const fs = FUND_SECTORS[r.sector];
      if (fs) Object.entries(fs).forEach(([k, w]) => { addTo(sec, k, r.value * w); addTo(secEq, k, r.value * w); });
      else {
        const k = r.sector === "Kita" ? "Nežinomas sektorius" : r.sector;
        addTo(sec, k, r.value);
        addTo(secEq, k === "Gynyba ir aviacija" ? "Pramonė" : k, r.value);
      }
      const fr = FUND_REGIONS[r.sector] || (r.country === "Pasaulis" ? REGIONS_ACWI : null);
      if (fr) Object.entries(fr).forEach(([k, w]) => { addTo(reg, k, r.value * w); addTo(regEq, k, r.value * w); });
      else { const k = COUNTRY_REGION[r.country] || "Nežinoma"; addTo(reg, k, r.value); addTo(regEq, k, r.value); }
    }
    const total = rows.reduce((t, r) => t + r.value, 0);
    const list = (m, base) => [...m].map(([k, v]) => ({ k, v, p: base ? v / base : 0 })).filter((x) => x.v > 0.005).sort((a, b) => b.v - a.v);
    return { sectors: list(sec, total), regions: list(reg, total), eqSectors: list(secEq, equity), eqRegions: list(regEq, equity), equity, total };
  }

  // Palyginimas su pasaulio akcijų rinka (tik akcijų dalis)
  function compare(ex) {
    const mk = (mine, market) => {
      const keys = new Set([...Object.keys(market), ...mine.map((x) => x.k)]);
      return [...keys].map((k) => {
        const m = (mine.find((x) => x.k === k) || { p: 0 }).p;
        return { k, mine: m, market: market[k] || 0, diff: m - (market[k] || 0) };
      }).filter((x) => x.mine > 0.001 || x.market > 0.015).sort((a, b) => Math.max(b.mine, b.market) - Math.max(a.mine, a.market));
    };
    return { sectors: mk(ex.eqSectors, MARKET.sectors), regions: mk(ex.eqRegions, MARKET.regions) };
  }

  function scenario(rows, shock) {
    let loss = 0;
    const by = {};
    for (const r of rows) {
      const b = bucket(r);
      const s = b === "cash" ? 0 : (shock[b] || 0) / 100;
      loss += r.value * s;
      by[b] = (by[b] || 0) + r.value * s;
    }
    return { loss, by };
  }

  function pnlSummary(rows) {
    const known = rows.filter((r) => typeof r.pnl === "number" && isFinite(r.pnl) && r.type !== "Grynieji");
    const pnl = known.reduce((t, r) => t + r.pnl, 0);
    const cost = known.reduce((t, r) => t + (r.value - r.pnl), 0);
    const withPct = known.map((r) => ({ ...r, pp: typeof r.pnlPct === "number" ? r.pnlPct : cost ? (r.pnl / (r.value - r.pnl)) * 100 : 0 }));
    const sorted = withPct.slice().sort((a, b) => b.pp - a.pp);
    return {
      known: known.length, total: rows.filter((r) => r.type !== "Grynieji").length, pnl, cost, pct: cost > 0 ? (pnl / cost) * 100 : null,
      up: known.filter((r) => r.pnl > 0).length, down: known.filter((r) => r.pnl < 0).length,
      best: sorted.filter((r) => r.pp > 0).slice(0, 3), worst: sorted.filter((r) => r.pp < 0).reverse().slice(0, 3),
    };
  }

  return { exposures, compare, scenario, pnlSummary, SCENARIOS, bucket };
})();
