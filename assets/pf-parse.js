// InvestAI – pozicijų atpažinimas iš OCR teksto (brokerio ekrano nuotraukos).
// Veikia naršyklėje (window.pfParse) ir Node (module.exports) – testams.
(function (root) {
  "use strict";

  const GENERIC = new Set(["the", "inc", "corp", "group", "grupė", "grupe", "bank", "bankas", "core", "class", "ishares", "vanguard", "spdr", "invesco", "invl", "total", "stock", "market", "world", "fund", "etf", "ucits", "acc", "dist", "usd", "eur", "trust", "holdings", "company", "platforms", "tehnika", "akcija", "akcijos"]);
  // Papildomi pavadinimai, kuriais aktyvai dažnai rodomi brokerių programėlėse
  const EXTRA = {
    "NASDAQ:GOOGL": ["alphabet", "google"],
    "NYSE:BRK.B": ["berkshire"],
    "XETR:EUNL": ["msci world", "iwda", "eunl"],
    "XETR:SXR8": ["core s&p 500", "cspx", "sxr8"],
    "XETR:VWCE": ["ftse all-world", "all-world", "vwce", "vwrl"],
    "AMEX:SPY": ["spdr s&p 500"],
    "NASDAQ:QQQ": ["nasdaq 100", "qqq"],
    "AMEX:VT": ["total world"],
    "AMEX:VTI": ["total stock market"],
    "BITSTAMP:BTCUSD": ["bitcoin", "btc"],
    "BITSTAMP:ETHUSD": ["ethereum", "eth"],
    "BINANCE:SOLUSDT": ["solana", "sol"],
    "BINANCE:XRPUSDT": ["xrp", "ripple"],
    "OMXVSE:SAB1L": ["šiaulių bankas", "siauliu bankas", "artea"],
    "OMXVSE:KNF1L": ["kn energies", "klaipėdos nafta", "klaipedos nafta"],
    "OMXVSE:AKO1L": ["akola", "linas agro"],
    "OMXVSE:TEL1L": ["telia lietuva"],
    "OMXVSE:IGN1L": ["ignitis"],
    "OMXTSE:LHV1T": ["lhv"],
    "NYSE:KO": ["coca-cola", "coca cola"],
    "NYSE:JNJ": ["johnson & johnson", "johnson"],
    "NYSE:PG": ["procter"],
    "NYSE:MCD": ["mcdonald"],
  };
  const SKIP_LINE = /\b(total|iš viso|is viso|viso|balance|balansas|portfolio value|portfelio vertė|account value|cash available|buying power|invested|investuota|grąža|graza|return|profit|pelnas|today|šiandien)\b/i;

  function strip(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  // OCR be lietuvių kalbos modelio dažnai „ų“ atpažįsta kaip „y“
  const ocrVariants = (n) => (/u\b/.test(n) ? [n, n.replace(/u\b/g, "y")] : [n]);
  function buildAliases(assets) {
    const out = [];
    for (const a of assets) {
      const t = a.s.split(":")[1];
      const names = new Set();
      const base = a.n.replace(/\s*\(.*?\)\s*/g, " ").trim();
      names.add(strip(base));
      const first = strip(base.split(/[\s,.]+/)[0] || "");
      if (first.length >= 4 && !GENERIC.has(first)) names.add(first);
      (EXTRA[a.s] || []).forEach((x) => names.add(strip(x)));
      out.push({ a, names: [...names].flatMap(ocrVariants).filter((n, i, arr) => n.length >= 3 && arr.indexOf(n) === i), ticker: t });
    }
    return out;
  }

  // Skaičiai: "1 234,56 €", "$1,234.56", "1.234,56", "€ 980"
  const NUM_RE = /([€$]|eur|usd)?\s?(-?\d{1,3}(?:[  .,’']\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)\s?(%|€|\$|eur|usd)?/gi;
  function parseNumber(raw) {
    let s = raw.replace(/[\s ’']/g, "");
    const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
    if (lastDot > -1 && lastComma > -1) {
      const dec = lastDot > lastComma ? "." : ",";
      s = s.replace(dec === "." ? /,/g : /\./g, "").replace(",", ".");
    } else if (lastComma > -1 || lastDot > -1) {
      const sep = lastComma > -1 ? "," : ".";
      const parts = s.split(sep);
      const tail = parts[parts.length - 1];
      if (parts.length === 2 && tail.length <= 2) s = parts[0] + "." + tail;
      else s = parts.join("");
    }
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }
  function numbersIn(line) {
    const out = [];
    for (const seg of line.split("|")) {
      NUM_RE.lastIndex = 0;
      let m;
      while ((m = NUM_RE.exec(seg))) {
        const pre = (m[1] || "").toLowerCase(), post = (m[3] || "").toLowerCase();
        if (post === "%") continue;
        const before = seg.slice(Math.max(0, m.index - 3), m.index);
        if (/[+\-−–]\s*$/.test(before) || m[2].startsWith("-")) continue; // pokyčiai, pvz. +12,30, + $55,30 ar -$1.20
        const v = parseNumber(m[2]);
        if (v === null || v <= 0) continue;
        const cur = pre === "$" || pre === "usd" || post === "$" || post === "usd" ? "USD" : pre || post ? "EUR" : null;
        out.push({ v, cur, hasDec: /[.,]\d{1,2}$/.test(m[2]) });
      }
    }
    return out;
  }
  // OCR eilutės iš Tesseract „blocks“: plačius tarpus tarp žodžių paverčiame stulpelių skirtuku „|“
  function linesFromBlocks(blocks) {
    const out = [];
    for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      const ws = (l.words || []).filter((w) => w.text && w.text.trim());
      if (!ws.length) continue;
      const hs = ws.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
      const h = hs[Math.floor(hs.length / 2)] || 10;
      let s = ws[0].text;
      for (let i = 1; i < ws.length; i++) {
        const gap = ws[i].bbox.x0 - ws[i - 1].bbox.x1;
        s += gap > h * 1.4 ? " | " : " ";
        s += ws[i].text;
      }
      out.push(s);
    }
    return out;
  }
  function pickValue(nums) {
    if (!nums.length) return null;
    const withCur = nums.filter((n) => n.cur);
    const pool = withCur.length ? withCur : nums.filter((n) => n.hasDec).length ? nums.filter((n) => n.hasDec) : nums;
    return pool.reduce((a, b) => (b.v > a.v ? b : a));
  }

  function findAsset(line, aliases) {
    const low = strip(line);
    let best = null;
    for (const al of aliases) {
      // Simbolis – tik kaip atskiras žodis didžiosiomis raidėmis (trumpi simboliai ≥ 3 raidžių)
      if (al.ticker.length < 3 && new RegExp(`^${al.ticker}(\\s|\\||$)`).test(line) && numbersIn(line).some((x) => x.cur)) {
        if (!best || 40 > best.score) best = { a: al.a, score: 40 };
      }
      if (al.ticker.length >= 3 && new RegExp(`(^|[^A-Z])${al.ticker.replace(/[.]/g, "\\.")}([^A-Z0-9]|$)`).test(line)) {
        const score = 50 + al.ticker.length;
        if (!best || score > best.score) best = { a: al.a, score };
      }
      for (const n of al.names) {
        const re = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}([^a-z0-9]|$)`);
        if (re.test(low)) {
          const score = n.length;
          if (!best || score > best.score) best = { a: al.a, score };
        }
      }
    }
    return best && best.a;
  }

  const STOP_TICKERS = new Set(["EUR", "USD", "ETF", "UCITS", "ACC", "DIST", "AB", "AS", "SA", "AG", "PLC", "INC", "NV"]);
  // Pavadinimas – tekstas iki pirmos sumos; pašaliname logotipų „šiukšles“ (1–2 raidžių žodžius pradžioje)
  function guessName(line) {
    let s = line.split("|")[0];
    s = s.replace(/([€$]|eur|usd)?\s?-?\d[\d\s.,]*\s?(€|\$|eur|usd)?.*$/i, "").trim();
    const words = s.split(/\s+/);
    while (words.length > 1 && words[0].length <= 2 && !/^[A-Z]{2}$/.test(words[0]) && /[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]{3,}/.test(words[1])) words.shift();
    return words.join(" ").replace(/[|•·]+$/, "").trim();
  }
  function parse(input, assets) {
    const aliases = buildAliases(assets);
    const raw = Array.isArray(input) ? input : String(input).split(/\r?\n/);
    const lines = raw.map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
    const found = new Map();
    const unknown = [];
    const used = new Set();
    const lastSeen = new Map();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (SKIP_LINE.test(line)) continue;
      const asset = findAsset(line, aliases);
      if (!asset) continue;
      // Tas pats aktyvas per kelias eilutes (pavadinimas + simbolis) – viena pozicija
      if (lastSeen.has(asset.s) && i - lastSeen.get(asset.s) <= 3) {
        used.add(i);
        const prev = found.get(asset.s);
        if (prev && !prev.ok) {
          const v = pickValue(numbersIn(line));
          if (v) Object.assign(prev, { value: v.v, cur: v.cur, ok: true });
        }
        lastSeen.set(asset.s, i);
        continue;
      }
      lastSeen.set(asset.s, i);
      // Vertė: ta pati eilutė, tada 1–2 kitos, tada ankstesnė (kai simbolis ir suma – eilute aukščiau)
      let best = pickValue(numbersIn(line));
      let from = i;
      let srcLine = line;
      if ((!best || !best.cur) && i > 0 && !used.has(i - 1) && !findAsset(lines[i - 1], aliases) && !SKIP_LINE.test(lines[i - 1])) {
        const prevVal = pickValue(numbersIn(lines[i - 1]));
        if (prevVal && prevVal.cur) { best = prevVal; used.add(i - 1); srcLine = lines[i - 1]; }
      }
      for (let k = 1; k <= 2 && i + k < lines.length && !(best && best.cur); k++) {
        const nxt = lines[i + k];
        const other = findAsset(nxt, aliases);
        if ((other && other.s !== asset.s) || SKIP_LINE.test(nxt)) break;
        const cand = pickValue(numbersIn(nxt));
        if (cand && (!best || (cand.cur && !best.cur))) { best = cand; from = i + k; }
      }
      if ((!best || !best.cur) && i > 0 && !used.has(i - 1) && !findAsset(lines[i - 1], aliases)) {
        const cand = pickValue(numbersIn(lines[i - 1]));
        if (cand && cand.cur) { best = cand; used.add(i - 1); }
      }
      for (let k = i; k <= from; k++) used.add(k);
      const prev = found.get(asset.s);
      found.set(asset.s, { s: asset.s, n: asset.n, value: (prev ? prev.value : 0) + (best ? best.v : 0), dec: best ? best.hasDec : true, cur: best ? best.cur : null, src: srcLine.replace(/ \| /g, "  "), ok: !!best || !!(prev && prev.ok) });
    }
    // Eilutės su pinigų suma, bet be atpažinto aktyvo
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i) || SKIP_LINE.test(lines[i])) continue;
      const nums = numbersIn(lines[i]).filter((n) => n.cur);
      const letters = (lines[i].match(/[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]{3,}/g) || []).join(" ");
      if (nums.length && letters.length >= 3) {
        const next = lines[i + 1] || "";
        const tk = (next.match(/(?:^|[^A-Z])([A-Z][A-Z0-9.]{1,5})(?=[^A-Za-z0-9]|$)/g) || [])
          .map((x) => x.replace(/^[^A-Z]/, "")).find((x) => !STOP_TICKERS.has(x)) || "";
        unknown.push({ text: lines[i].replace(/ \| /g, "  "), name: guessName(lines[i]), ticker: tk, value: pickValue(nums).v, dec: pickValue(nums).hasDec, cur: pickValue(nums).cur });
        if (tk && !findAsset(next, aliases)) used.add(i + 1);
      }
    }
    const rows = [...found.values()];
    // OCR kartais praranda kablelį („1 742,10“ → „174210“). Jei beveik visos sumos su centais, o ši – ne, atkuriame centus.
    const all = rows.concat(unknown).filter((r) => r.value > 0);
    if (all.length >= 3 && all.filter((r) => r.dec).length / all.length >= 0.6) {
      all.forEach((r) => { if (!r.dec && r.value >= 1000) { r.value = r.value / 100; r.fixed = true; } });
    }
    const curs = rows.concat(unknown).map((r) => r.cur).filter(Boolean);
    const usd = curs.filter((c) => c === "USD").length;
    return { rows, unknown: unknown.slice(0, 12), currency: usd > curs.length / 2 ? "USD" : "EUR", lines: lines.length };
  }

  const api = { parse, parseNumber, numbersIn, linesFromBlocks };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.pfParse = api;
})(typeof window !== "undefined" ? window : globalThis);
