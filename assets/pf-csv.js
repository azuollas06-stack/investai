// InvestAI – brokerių CSV failų skaitymas (Trading 212, Revolut, Lightyear, Interactive Brokers ir bendras CSV).
// Viskas vyksta naršyklėje: failas niekur nesiunčiamas.
// Rezultatas: pozicijos (kiekis, vidutinė kaina, valiuta) ir gauti dividendai.
"use strict";
(function () {
  /* ---------- CSV ---------- */
  function sniffDelim(text) {
    const line = text.split(/\r?\n/).find((l) => l.trim()) || "";
    let best = ",", max = -1;
    for (const d of [",", ";", "\t", "|"]) {
      let n = 0, q = false;
      for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
      if (n > max) { max = n; best = d; }
    }
    return best;
  }
  function parseCSV(text, delim) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
    return rows;
  }

  /* ---------- Skaičiai, datos, valiutos ---------- */
  let decimalComma = false;
  function num(v) {
    if (v === undefined || v === null) return null;
    let s = String(v).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[A-Za-z$€£¥\s  ']/g, "");
    if (s.startsWith("-") || s.startsWith("−")) { neg = !neg; s = s.slice(1); }
    if (!s) return null;
    const hasC = s.includes(","), hasD = s.includes(".");
    if (hasC && hasD) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (hasC) s = !decimalComma && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }
  const CUR_RE = /\b(USD|EUR|GBP|GBX|GBp|SEK|NOK|DKK|CHF|JPY|PLN|CAD|AUD|HKD)\b/;
  const curOf = (v) => {
    const s = String(v || "");
    const m = s.match(CUR_RE);
    if (m) return m[1] === "GBX" ? "GBp" : m[1];
    if (s.includes("$")) return "USD";
    if (s.includes("€")) return "EUR";
    if (s.includes("£")) return "GBP";
    return null;
  };
  function day(v) {
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }
  const norm = (h) => String(h || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  function finder(headers) {
    const H = headers.map(norm);
    return (...res) => {
      for (const re of res) { const i = H.findIndex((h) => re.test(h)); if (i >= 0) return i; }
      return -1;
    };
  }

  /* ---------- Sandorio tipas ---------- */
  function kindOf(t, qty) {
    const s = norm(t);
    if (/split/.test(s)) return /close|out|isem/.test(s) || qty < 0 ? "split-" : "split+";
    if (/dividend|distribution|dividendai|pajamos is vp/.test(s) && !/tax|mokest|adjust/.test(s)) return "div";
    if (/\bsell\b|\bsold\b|pardav|\bsale\b|\bsell /.test(s)) return "sell";
    if (/\bbuy\b|\bbought\b|pirk|purchase|isigij/.test(s)) return "buy";
    return "other";
  }

  /* ---------- Formatai ---------- */
  // Trading 212: Action, Time, ISIN, Ticker, Name, No. of shares, Price / share, Currency (Price / share), Total, Currency (Total)…
  function t212(rows) {
    const f = finder(rows[0]);
    const c = { act: f(/^action$/), time: f(/^time$/), isin: f(/^isin$/), tic: f(/^ticker$/), name: f(/^name$/), qty: f(/no of shares/), price: f(/^price share$/), pcur: f(/currency price share/), total: f(/^total( [a-z]{3})?$/), tcur: f(/currency total/), fx: f(/^exchange rate$/), wht: f(/^withholding tax$/), whtc: f(/currency withholding tax/) };
    const totHdr = norm(rows[0][c.total] || "");
    const totCur = (totHdr.match(/total ([a-z]{3})$/) || [])[1];
    return rows.slice(1).map((r) => ({
      date: day(r[c.time]), kind: kindOf(r[c.act]), ticker: r[c.tic], isin: r[c.isin], name: r[c.name],
      qty: Math.abs(num(r[c.qty]) || 0), price: num(r[c.price]), pcur: r[c.pcur] || null,
      total: Math.abs(num(r[c.total]) || 0), tcur: (c.tcur >= 0 && r[c.tcur]) || (totCur ? totCur.toUpperCase() : "EUR"),
      fx: c.fx >= 0 ? num(r[c.fx]) : null, wht: c.wht >= 0 ? Math.abs(num(r[c.wht]) || 0) : 0, whtCur: c.whtc >= 0 ? r[c.whtc] : null,
    }));
  }
  // Revolut: Date, Ticker, Type, Quantity, Price per share, Total Amount, Currency, FX Rate
  function revolut(rows) {
    const f = finder(rows[0]);
    const c = { date: f(/^date$/), tic: f(/^ticker$/, /^symbol$/), type: f(/^type$/), qty: f(/^quantity$/), price: f(/price per share/), total: f(/total amount/), cur: f(/^currency$/), fx: f(/^fx rate$/) };
    return rows.slice(1).map((r) => {
      const q = num(r[c.qty]);
      const cur = (c.cur >= 0 && curOf(r[c.cur])) || curOf(r[c.price]) || curOf(r[c.total]) || "USD";
      return { date: day(r[c.date]), kind: kindOf(r[c.type], q), ticker: r[c.tic], qty: Math.abs(q || 0), price: num(r[c.price]), pcur: cur, total: Math.abs(num(r[c.total]) || 0), tcur: cur, fx: c.fx >= 0 ? num(r[c.fx]) : null };
    });
  }
  // Lightyear: Date, Reference, Ticker, ISIN, Type, Quantity, CCY, Price/share, Gross Amount, FX Rate, Fee, Net Amt., Tax Amt.
  function lightyear(rows) {
    const f = finder(rows[0]);
    const c = { date: f(/^date$/), tic: f(/^ticker$/), isin: f(/^isin$/), type: f(/^type$/), qty: f(/^quantity$/), cur: f(/^ccy$/, /^currency$/), price: f(/price share/), gross: f(/gross amount/), net: f(/^net amt/, /^net amount/), fx: f(/^fx rate$/), tax: f(/^tax amt/) };
    return rows.slice(1).map((r) => {
      const q = num(r[c.qty]);
      return { date: day(r[c.date]), kind: kindOf(r[c.type], q), ticker: r[c.tic], isin: r[c.isin], qty: Math.abs(q || 0), price: num(r[c.price]), pcur: r[c.cur] || null, total: Math.abs(num(r[c.net >= 0 ? c.net : c.gross]) || 0), tcur: r[c.cur] || "EUR", fx: c.fx >= 0 ? num(r[c.fx]) : null, wht: c.tax >= 0 ? Math.abs(num(r[c.tax]) || 0) : 0, whtCur: r[c.cur] || null };
    });
  }
  // Bendras sandorių failas: tipas + kiekis + (simbolis | ISIN | pavadinimas)
  function genericTx(rows, f) {
    const c = { date: f(/^(date|data|time|trade date|data ir laikas|sandorio data|operacijos data)$/, /date|data/), type: f(/^(type|action|tipas|operacija|operacijos tipas|transaction type|veiksmas|side)$/), tic: f(/^(ticker|symbol|simbolis|kodas|tickeris)$/), isin: f(/isin/), name: f(/^(name|pavadinimas|instrument|instrumentas|security|vertybinis popierius|description|aprasymas)$/), qty: f(/^(quantity|qty|shares|kiekis|vnt|units|no of shares)$/, /quantity|kiekis|shares/), price: f(/^(price|kaina|price per share|unit price|vieneto kaina)$/, /price|kaina/), cur: f(/^(currency|valiuta|ccy|cur)$/), total: f(/^(total|amount|suma|total amount|net amount|bendra suma|verte)$/, /total|amount|suma/) };
    return rows.slice(1).map((r) => {
      const q = num(r[c.qty]);
      const cur = (c.cur >= 0 && (curOf(r[c.cur]) || r[c.cur])) || curOf(r[c.price]) || null;
      return { date: day(r[c.date]), kind: kindOf(r[c.type], q), ticker: c.tic >= 0 ? r[c.tic] : "", isin: c.isin >= 0 ? r[c.isin] : "", name: c.name >= 0 ? r[c.name] : "", qty: Math.abs(q || 0), price: num(r[c.price]), pcur: cur, total: Math.abs(num(r[c.total]) || 0), tcur: cur || "EUR" };
    });
  }
  // Interactive Brokers „Activity Statement“: skyriai „Open Positions“ ir „Dividends“
  function ibkr(rows) {
    const positions = [], divs = [];
    let ph = null, dh = null;
    for (const r of rows) {
      if (r[0] === "Open Positions" && r[1] === "Header") ph = finder(r);
      else if (r[0] === "Open Positions" && r[1] === "Data" && ph) {
        const g = (re) => r[ph(re)];
        if (!/summary/i.test(g(/^datadiscriminator$/) || "Summary")) continue;
        if (/forex|cash/i.test(g(/^asset category$/) || "")) continue;
        const qty = num(g(/^quantity$/)), cur = g(/^currency$/);
        if (!qty) continue;
        positions.push({ ticker: g(/^symbol$/), qty, avg: num(g(/^cost price$/)), pcur: cur, lastPrice: num(g(/^close price$/)), value: num(g(/^value$/)), valueCur: cur });
      } else if (r[0] === "Dividends" && r[1] === "Header") dh = finder(r);
      else if (r[0] === "Dividends" && r[1] === "Data" && dh) {
        const cur = r[dh(/^currency$/)], desc = r[dh(/^description$/)] || "", amt = num(r[dh(/^amount$/)]);
        if (!amt || /^total/i.test(cur || "")) continue;
        divs.push({ date: day(r[dh(/^date$/)]), ticker: desc.split(/[ (]/)[0], amt, cur });
      }
    }
    return { positions, divs };
  }
  // Bendras likučių failas: pavadinimas/simbolis + vertė arba kiekis
  function genericSnapshot(rows, f) {
    const c = { tic: f(/^(ticker|symbol|simbolis|kodas|tickeris)$/), isin: f(/isin/), name: f(/^(name|pavadinimas|instrument|instrumentas|security|vertybinis popierius|company|aktyvas|asset|imone)$/, /pavadinimas|name|instrument/), qty: f(/^(quantity|qty|shares|kiekis|vnt|units|no of shares)$/, /quantity|kiekis|shares/), avg: f(/average|avg|vidutin|cost price|purchase price|isigijimo kaina|pirkimo kaina/), price: f(/^(price|kaina|last price|current price|rinkos kaina|dabartine kaina|close price)$/), value: f(/^(market value|value|verte|rinkos verte|total value|current value|dabartine verte)$/, /market value|rinkos verte|verte eur|value eur/), cur: f(/^(currency|valiuta|ccy|cur)$/), pnl: f(/unrealized|^(p l|pnl|pelnas|pelnas nuostolis|rezultatas|profit|profit loss|gain loss)$/) };
    if (c.tic < 0 && c.name < 0 && c.isin < 0) return null;
    if (c.qty < 0 && c.value < 0) return null;
    const positions = [];
    for (const r of rows.slice(1)) {
      const label = (c.tic >= 0 && r[c.tic]) || (c.name >= 0 && r[c.name]) || (c.isin >= 0 && r[c.isin]);
      if (!label || /^(total|viso|is viso|iš viso|suma)$/i.test(label)) continue;
      const qty = c.qty >= 0 ? num(r[c.qty]) : null, value = c.value >= 0 ? num(r[c.value]) : null;
      if (!(qty > 0) && !(value > 0)) continue;
      const cur = (c.cur >= 0 && (curOf(r[c.cur]) || r[c.cur])) || curOf(r[c.value]) || curOf(r[c.price]) || null;
      positions.push({ ticker: c.tic >= 0 ? r[c.tic] : "", isin: c.isin >= 0 ? r[c.isin] : "", name: c.name >= 0 ? r[c.name] : "", qty, avg: c.avg >= 0 ? num(r[c.avg]) : null, pcur: cur, lastPrice: c.price >= 0 ? num(r[c.price]) : null, value, valueCur: cur, pnl: c.pnl >= 0 ? num(r[c.pnl]) : null });
    }
    return positions;
  }

  /* ---------- Sandoriai → pozicijos ---------- */
  function aggregate(txs) {
    const ok = txs.filter((t) => t && t.kind !== "other" && (t.ticker || t.isin || t.name));
    const dated = ok.every((t) => t.date);
    if (dated) ok.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stabilus rūšiavimas: tos pačios dienos tvarka išlieka
    const pos = new Map(), divs = [];
    for (const t of ok) {
      const key = (t.isin || t.ticker || t.name).toUpperCase();
      if (t.kind === "div") { if (t.total) divs.push({ date: t.date, ticker: t.ticker, isin: t.isin, name: t.name, amt: t.total, cur: t.tcur }); continue; }
      let p = pos.get(key);
      if (!p) { p = { ticker: t.ticker, isin: t.isin, name: t.name, qty: 0, cost: 0, pcur: t.pcur || t.tcur, lastPrice: null, lastDate: null }; pos.set(key, p); }
      if (t.ticker) p.ticker = t.ticker;
      if (t.name) p.name = t.name;
      if (t.kind === "buy" && t.qty) {
        const unit = t.price || (t.total && t.qty ? t.total / t.qty : 0);
        if (t.price && t.pcur && !p.pcur) p.pcur = t.pcur;
        p.qty += t.qty; p.cost += t.qty * unit;
      } else if (t.kind === "sell" && t.qty) {
        const avg = p.qty > 0 ? p.cost / p.qty : 0, q = Math.min(t.qty, p.qty);
        p.cost -= avg * q; p.qty -= t.qty;
        if (p.qty <= 1e-7) { p.qty = 0; p.cost = 0; }
      } else if (t.kind === "split+") p.qty += t.qty;
      else if (t.kind === "split-") p.qty = Math.max(0, p.qty - t.qty);
      if (t.price && t.kind !== "div") { p.lastPrice = t.price; p.lastDate = t.date; }
    }
    const positions = [...pos.values()].filter((p) => p.qty > 1e-6).map((p) => ({ ...p, avg: p.cost > 0 ? p.cost / p.qty : null }));
    const txOut = ok.filter((t) => t.date && t.kind !== "other").map((t) => ({ d: t.date, k: t.kind, t: t.ticker || "", i: t.isin || "", n: t.name || "", q: t.qty || 0, p: t.price || null, pc: t.pcur || null, a: t.total || 0, c: t.tcur || null, fx: t.fx || null, w: t.wht || 0, wc: t.whtCur || null }));
    return { positions, divs, txs: txOut };
  }

  /* ---------- Įėjimas ---------- */
  function parse(text) {
    text = String(text || "").replace(/^﻿/, "");
    const delim = sniffDelim(text);
    decimalComma = delim === ";";
    const rows = parseCSV(text, delim);
    if (rows.length < 2) throw new Error("Faile neradome eilučių");
    if (rows.some((r) => r[0] === "Open Positions" && r[1] === "Header")) return { broker: "Interactive Brokers", ...ibkr(rows) };
    // Antraštė gali būti ne pirmoje eilutėje (kai kurie bankai prideda aprašymą)
    const hi = rows.findIndex((r) => r.filter(Boolean).length >= 3 && r.some((c) => /[a-ząčęėįšųūž]/i.test(c)) && !r.some((c) => num(c) !== null && !/^\d{4}$/.test(c)));
    const body = hi > 0 ? rows.slice(hi) : rows;
    const H = body[0].map(norm), has = (re) => H.some((h) => re.test(h));
    if (has(/^action$/) && has(/no of shares/)) return { broker: "Trading 212", ...aggregate(t212(body)) };
    if (has(/^ticker$/) && has(/^type$/) && has(/price per share/) && has(/total amount/)) return { broker: "Revolut", ...aggregate(revolut(body)) };
    if (has(/^reference$/) && has(/^ticker$/) && has(/^type$/) && has(/^quantity$/)) return { broker: "Lightyear", ...aggregate(lightyear(body)) };
    const f = finder(body[0]);
    if (f(/^(type|action|tipas|operacija|operacijos tipas|transaction type|veiksmas|side)$/) >= 0 && f(/quantity|kiekis|shares|qty|vnt/) >= 0) {
      const r = aggregate(genericTx(body, f));
      if (r.positions.length) return { broker: "", ...r };
    }
    const positions = genericSnapshot(body, f);
    if (positions && positions.length) return { broker: "", positions, divs: [] };
    throw new Error("Neatpažinome failo formato");
  }

  window.pfCSV = { parse, _num: num, _parseCSV: parseCSV };
})();
