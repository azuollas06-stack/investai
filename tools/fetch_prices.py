"""Kasdien surenka visų data/assets.json aktyvų kainas ir apskaičiuoja rodiklius → data/prices.json.

Paleidžiama GitHub Actions (žr. .github/workflows/prices.yml). Duomenys – Yahoo Finance per `yfinance`
(neoficialus nemokamas šaltinis; tinka prototipui, komerciniam produktui reikės licencijuoto tiekėjo).

Kiekvienam aktyvui: paskutinė kaina, valiuta, pokyčiai (1 d., 1 sav., 1 mėn., 3 mėn., nuo metų pradžios, 1 m.),
52 savaičių aukščiausia/žemiausia kaina, kritimas nuo 52 sav. aukščiausios, metinis svyravimas (volatility),
ir mini grafikas (~60 taškų per 1 metus).
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# TradingView birža → Yahoo priesaga
SUFFIX = {
    "XETR": ".DE", "EURONEXT": None, "MIL": ".MI", "OMXSTO": ".ST", "OSL": ".OL", "OMXCOP": ".CO",
    "OMXHEX": ".HE", "LSE": ".L", "SIX": ".SW", "TSE": ".T", "KRX": ".KS",
    "OMXVSE": ".VS", "OMXTSE": ".TL", "OMXRSE": ".RG",
}
# Euronext: kurioje biržoje kotiruojama
EURONEXT = {
    "ASML": "ASML.AS", "AIR": "AIR.PA", "SAF": "SAF.PA", "HO": "HO.PA", "MC": "MC.PA", "OR": "OR.PA",
    "TTE": "TTE.PA", "SAN": "SAN.PA", "RMS": "RMS.PA", "BNP": "BNP.PA", "AD": "AD.AS", "INGA": "INGA.AS",
    "ADYEN": "ADYEN.AS", "PRX": "PRX.AS",
}
OVERRIDES = {
    "BITSTAMP:BTCUSD": "BTC-USD", "BITSTAMP:ETHUSD": "ETH-USD", "BINANCE:SOLUSDT": "SOL-USD",
    "BINANCE:XRPUSDT": "XRP-USD", "BINANCE:BNBUSDT": "BNB-USD", "BINANCE:ADAUSDT": "ADA-USD",
    "BINANCE:DOGEUSDT": "DOGE-USD", "BINANCE:DOTUSDT": "DOT-USD", "BINANCE:LINKUSDT": "LINK-USD",
    "BINANCE:AVAXUSDT": "AVAX-USD", "BINANCE:TRXUSDT": "TRX-USD", "BINANCE:SUIUSDT": "SUI20947-USD",
    "XETR:IS3N": "IS3N.DE", "XETR:VUAA": "VUAA.DE", "XETR:CSPX": "SXR8.DE",
}


def yahoo_symbol(tv: str) -> str | None:
    if tv.startswith("X:"):
        return None
    if tv in OVERRIDES:
        return OVERRIDES[tv]
    ex, t = tv.split(":", 1)
    if ex in ("NASDAQ", "NYSE", "AMEX"):
        return t.replace(".", "-")
    if ex == "EURONEXT":
        return EURONEXT.get(t)
    if ex in SUFFIX and SUFFIX[ex]:
        t = t.replace("_", "-")
        if ex == "LSE":
            t = t.rstrip(".")
        return t + SUFFIX[ex]
    return None


def pct(a: float, b: float) -> float | None:
    if a is None or b is None or b == 0 or math.isnan(a) or math.isnan(b):
        return None
    return round((a / b - 1) * 100, 2)


def metrics(closes: list[tuple[str, float]]) -> dict | None:
    """closes – [(YYYY-MM-DD, kaina)], seniausia pirmoji."""
    closes = [(d, c) for d, c in closes if c is not None and not math.isnan(c) and c > 0]
    if len(closes) < 5:
        return None
    recent = [[d, round(c, 4)] for d, c in closes[-10:]]
    cut = (date.fromisoformat(closes[-1][0]) - timedelta(days=366)).isoformat()
    closes = [(d, c) for d, c in closes if d >= cut]
    dates = [d for d, _ in closes]
    px = [c for _, c in closes]
    last = px[-1]

    def back(n: int):
        return px[-1 - n] if len(px) > n else None

    year = dates[-1][:4]
    ytd_base = next((c for d, c in reversed(closes) if d[:4] < year), None)
    hi, lo = max(px), min(px)
    rets = [math.log(px[i] / px[i - 1]) for i in range(1, len(px)) if px[i - 1] > 0]
    vol = None
    if len(rets) > 20:
        m = sum(rets) / len(rets)
        vol = round(math.sqrt(sum((r - m) ** 2 for r in rets) / (len(rets) - 1)) * math.sqrt(252) * 100, 1)
    step = max(1, len(px) // 60)
    spark = [round(c, 4) for c in px[::step]]
    if spark[-1] != round(last, 4):
        spark.append(round(last, 4))
    return {
        "price": round(last, 4), "date": dates[-1],
        "d1": pct(last, back(1)), "w1": pct(last, back(5)), "m1": pct(last, back(21)), "m3": pct(last, back(63)),
        "ytd": pct(last, ytd_base), "y1": pct(last, px[0]) if len(px) > 200 else None,
        "hi52": round(hi, 4), "lo52": round(lo, 4), "fromHigh": pct(last, hi), "vol": vol, "spark": spark,
        "recent": recent,
    }


def hist_name(tv: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", tv.replace(":", "_"))


def sig(v: float) -> float:
    """Apvalinimas iki ~5 reikšminių skaitmenų (mažesni failai)."""
    if v == 0:
        return 0
    d = max(0, 4 - int(math.floor(math.log10(abs(v)))))
    return round(v, d)


def write_hist(tv: str, cur, daily: list[tuple[str, float]], weekly: list[tuple[str, float]]) -> None:
    """data/hist/<simbolis>.json – 2 metų dienos ir 5 metų savaitės uždarymo kainos.
    Datos saugomos kaip dienų skaičius nuo d0 (kompaktiškiau)."""
    def pack(rows):
        rows = [(d, c) for d, c in rows if c and not math.isnan(c) and c > 0]
        if not rows:
            return None
        d0 = date.fromisoformat(rows[0][0])
        return {"d0": rows[0][0], "t": [(date.fromisoformat(d) - d0).days for d, _ in rows], "c": [sig(c) for _, c in rows]}
    obj = {"s": tv, "cur": cur, "d": pack(daily), "w": pack(weekly)}
    (ROOT / "data/hist").mkdir(exist_ok=True)
    (ROOT / f"data/hist/{hist_name(tv)}.json").write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def live(yf, mapping: dict) -> int:
    """Greitas atnaujinimas biržų darbo metu: tik kaina ir dienos pokytis → data/live.json (mažas failas)."""
    ysyms = sorted({y for y in mapping.values() if y})
    data = yf.download(ysyms, period="5d", interval="1d", auto_adjust=True, group_by="ticker", progress=False, threads=True)
    out = {}
    for tv, y in mapping.items():
        if not y:
            continue
        try:
            series = data[y]["Close"].dropna()
            if len(series) < 2:
                continue
            last, prev = float(series.iloc[-1]), float(series.iloc[-2])
            out[tv] = [sig(last), pct(last, prev), series.index[-1].strftime("%Y-%m-%d")]
        except Exception:  # noqa: BLE001
            continue
    result = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "delay": "~15 min", "items": out}
    (ROOT / "data/live.json").write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(f"live.json: {len(out)} aktyvų")
    return 0 if out else 1


def main() -> int:
    import yfinance as yf  # importuojama tik paleidžiant Actions

    assets = json.loads((ROOT / "data/assets.json").read_text(encoding="utf-8"))
    items = [a for g in assets["groups"] for a in g["items"]]
    mapping = {a["s"]: yahoo_symbol(a["s"]) for a in items}
    if "--live" in sys.argv:
        return live(yf, mapping)
    ysyms = sorted({y for y in mapping.values() if y})
    print(f"Aktyvų: {len(items)}, Yahoo simbolių: {len(ysyms)}")
    # Istorija grafikams rašoma vakare penktadieniais (arba jei failo dar nėra), kad repozitorija neaugtų per greitai
    want_hist = "--hist" in sys.argv or datetime.now(timezone.utc).weekday() == 4

    data = yf.download(ysyms, period="2y", interval="1d", auto_adjust=True, actions=True, group_by="ticker", progress=False, threads=True)
    wdata = None
    year_ago = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")
    currency = {}
    out, missing = {}, []
    for tv, y in mapping.items():
        if not y:
            continue
        try:
            series = data[y]["Close"].dropna()
            closes = [(idx.strftime("%Y-%m-%d"), float(v)) for idx, v in series.items()]
            m = metrics(closes)
        except Exception as e:  # noqa: BLE001
            m = None
            print(f"  ! {tv} ({y}): {e}", file=sys.stderr)
        if not m:
            missing.append(tv)
            continue
        if y not in currency:
            try:
                currency[y] = yf.Ticker(y).fast_info.get("currency")
            except Exception:  # noqa: BLE001
                currency[y] = None
        m["cur"] = currency[y]
        m["y"] = y
        # Dividendai per paskutinius 12 mėn.: [nukirpimo data, suma vienai akcijai kainos valiuta]
        try:
            dvs = data[y]["Dividends"].dropna()
            dv = [[idx.strftime("%Y-%m-%d"), round(float(v), 4)] for idx, v in dvs.items() if v and float(v) > 0 and idx.strftime("%Y-%m-%d") >= year_ago]
            if dv and m.get("price"):
                dy12 = sum(x[1] for x in dv) / m["price"] * 100
                if 0 < dy12 < 25:  # kitokiu atveju tikėtina valiutų (pvz., GBp/GBP) painiava
                    m["dv"] = dv
                    m["dy12"] = round(dy12, 2)
        except Exception:  # noqa: BLE001
            pass
        out[tv] = m
        hp = ROOT / f"data/hist/{hist_name(tv)}.json"
        if want_hist or not hp.exists():
            try:
                if wdata is None:
                    wdata = yf.download(ysyms, period="5y", interval="1wk", auto_adjust=True, group_by="ticker", progress=False, threads=True)
                wser = wdata[y]["Close"].dropna()
                weekly = [(idx.strftime("%Y-%m-%d"), float(v)) for idx, v in wser.items()]
            except Exception:  # noqa: BLE001
                weekly = []
            write_hist(tv, currency[y], closes, weekly)

    # Analitikų vertinimai ir pagrindiniai rodikliai – tik akcijoms (ne ETF ir ne kriptovaliutoms)
    stock_types = {a["s"]: a.get("type") for a in items}
    fund_fail = 0
    for tv, m in out.items():
        if stock_types.get(tv) != "Akcija":
            continue
        y = m["y"]
        info = {}
        for attempt in range(3):
            try:
                info = yf.Ticker(y).info or {}
                break
            except Exception as e:  # noqa: BLE001
                info = {}
                time.sleep(2 + attempt * 3)
        if not info:
            fund_fail += 1
            continue
        an = {}
        n = info.get("numberOfAnalystOpinions")
        if n:
            an = {
                "n": int(n),
                "key": info.get("recommendationKey"),          # strong_buy, buy, hold, underperform, sell
                "mean": info.get("recommendationMean"),        # 1 (stiprus pirk) … 5 (parduok)
                "tMean": info.get("targetMeanPrice"), "tLow": info.get("targetLowPrice"),
                "tHigh": info.get("targetHighPrice"), "tMed": info.get("targetMedianPrice"),
            }
            try:
                rs = yf.Ticker(y).recommendations_summary
                if rs is not None and len(rs):
                    row = rs.iloc[0]
                    an["c"] = [int(row.get(k, 0) or 0) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")]
            except Exception:  # noqa: BLE001
                pass
            an = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in an.items() if v is not None}
            if an.get("tMean") and m.get("price"):
                an["up"] = pct(an["tMean"], m["price"])
            m["an"] = an
        for src, dst in (("marketCap", "mcap"), ("trailingPE", "pe"), ("forwardPE", "fpe"), ("dividendYield", "dy"), ("dividendRate", "dr"),
                         ("profitMargins", "pm"), ("operatingMargins", "om"), ("revenueGrowth", "rg"), ("earningsGrowth", "eg"),
                         ("debtToEquity", "de"), ("returnOnEquity", "roe"), ("trailingEps", "eps"), ("beta", "beta"),
                         ("freeCashflow", "fcf"), ("totalCash", "cash"), ("totalDebt", "debt"), ("totalRevenue", "rev")):
            v = info.get(src)
            if isinstance(v, (int, float)) and math.isfinite(v):
                m[dst] = round(float(v), 4)
        # Kalendorius: artimiausia rezultatų data ir dividendų nukirpimo (ex) data
        for src, dst in (("earningsTimestampStart", "ed"), ("earningsTimestamp", "ed"), ("exDividendDate", "xd")):
            v = info.get(src)
            if dst in m or not isinstance(v, (int, float)) or v <= 0:
                continue
            m[dst] = datetime.fromtimestamp(v, timezone.utc).strftime("%Y-%m-%d")
        time.sleep(0.25)
    print(f"Rodiklių nepavyko gauti: {fund_fail}")

    # Kartą per savaitę: kelerių metų finansiniai rezultatai (grynasis pelnas, pajamos, akcijų skaičius)
    fund_path = ROOT / "data" / "fund.json"
    try:
        fund_old = json.loads(fund_path.read_text()) if fund_path.exists() else {}
    except Exception:  # noqa: BLE001
        fund_old = {}
    age_days = 999
    if fund_old.get("updated"):
        try:
            age_days = (datetime.now(timezone.utc) - datetime.strptime(fund_old["updated"], "%Y-%m-%d").replace(tzinfo=timezone.utc)).days
        except Exception:  # noqa: BLE001
            pass
    if age_days >= 6:
        fund = {}
        def row(df, *names):
            for n in names:
                if df is not None and n in df.index:
                    vals = [(str(c)[:4], float(v)) for c, v in df.loc[n].items() if v == v]
                    return sorted(vals)[-5:]
            return []
        for tv, m in out.items():
            if stock_types.get(tv) != "Akcija":
                continue
            try:
                t = yf.Ticker(m["y"])
                inc = t.income_stmt
                bs = t.balance_sheet
                f = {
                    "ni": row(inc, "Net Income", "Net Income Common Stockholders"),
                    "rev": row(inc, "Total Revenue", "Operating Revenue"),
                    "sh": row(bs, "Ordinary Shares Number", "Share Issued"),
                }
                f = {k: [[y, round(v)] for y, v in vals] for k, vals in f.items() if vals}
                if f:
                    fund[tv] = f
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.3)
        if fund:
            fund_path.write_text(json.dumps({"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "note": "Metiniai duomenys (Yahoo Finance): ni – grynasis pelnas, rev – pajamos, sh – akcijų skaičius. Valiuta – įmonės ataskaitų valiuta.", "items": fund}, ensure_ascii=False, separators=(",", ":")))
            print(f"Finansiniai rezultatai: {len(fund)} įmonių")

    # Valiutų kursai: kiek eurų už vieną valiutos vienetą (portfelio vertėms)
    fx = {"EUR": 1}
    pairs = {"USD": "EURUSD=X", "GBP": "EURGBP=X", "SEK": "EURSEK=X", "NOK": "EURNOK=X", "DKK": "EURDKK=X", "CHF": "EURCHF=X", "JPY": "EURJPY=X", "KRW": "EURKRW=X", "PLN": "EURPLN=X", "CAD": "EURCAD=X"}
    try:
        fxd = yf.download(list(pairs.values()), period="5d", interval="1d", auto_adjust=True, group_by="ticker", progress=False, threads=True)
        for cur, sym in pairs.items():
            try:
                rate = float(fxd[sym]["Close"].dropna().iloc[-1])
                if rate > 0:
                    fx[cur] = round(1 / rate, 6)
            except Exception:  # noqa: BLE001
                pass
        if "GBP" in fx:
            fx["GBp"] = round(fx["GBP"] / 100, 8)
    except Exception as e:  # noqa: BLE001
        print(f"Valiutų kursų gauti nepavyko: {e}", file=sys.stderr)

    result = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "fx": fx,
        "source": "Yahoo Finance (yfinance): dienos uždarymo kainos, analitikų vertinimai ir rodikliai",
        "count": len(out),
        "missing": missing,
        "items": out,
    }
    (ROOT / "data/prices.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Įrašyta: {len(out)}, trūksta: {len(missing)} {missing[:20]}")
    return 0 if len(out) > len(items) * 0.5 else 1


if __name__ == "__main__":
    sys.exit(main())
