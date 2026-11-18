"""Atsisiunčia aktyvų logotipus į assets/logos/ (savame serveryje – greita ir patikima).

Šaltiniai (pirmas tinkamas laimi):
  akcijos  – Financial Modeling Prep paveikslėliai, Parqet logotipai, įmonės svetainės ikona
  ETF      – fondų valdytojo (Vanguard, iShares…) svetainės ikona
  Baltija  – įmonės svetainės ikona
  kripto   – CoinCap ikonos
Rezultatas: assets/logos/<simbolis>.png (96×96) ir data/logos.json – kurie logotipai yra.
Paleidžiama GitHub Actions (logos.yml) rankiniu būdu arba pakeitus šį failą / assets.json.
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
from pathlib import Path

import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from fetch_prices import yahoo_symbol  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/logos"
UA = {"User-Agent": "Mozilla/5.0 (InvestAI logo fetcher; +https://azuollas06-stack.github.io/investai/)"}

# Fondų valdytojai, kurių patronuojančios įmonės kotiruojamos biržoje – jų logotipas
ISSUER_STOCK = {"iShares": "BLK", "SPDR": "STT", "Invesco": "IVZ", "Xtrackers": "DWS.DE", "Amundi": "AMUN.PA", "WisdomTree": "WT", "Schwab": "SCHW"}
ISSUERS = [
    ("Vanguard", "vanguard.com"), ("iShares", "ishares.com"), ("SPDR", "ssga.com"), ("Invesco", "invesco.com"),
    ("Xtrackers", "dws.com"), ("Amundi", "amundietf.com"), ("VanEck", "vaneck.com"), ("WisdomTree", "wisdomtree.com"),
    ("Schwab", "schwab.com"), ("ARK", "ark-funds.com"), ("Future of Defence", "hanetf.com"), ("Xetra-Gold", "xetra-gold.com"),
]
DOMAINS = {
    "OMXVSE:IGN1L": "ignitisgrupe.lt", "OMXVSE:TEL1L": "telia.lt", "OMXVSE:SAB1L": "artea.lt", "OMXVSE:APG1L": "apranga.lt",
    "OMXVSE:KNF1L": "kn-energies.com", "OMXVSE:AKO1L": "akolagroup.lt", "OMXVSE:IVL1L": "invl.com", "OMXVSE:ROE1L": "rokiskio.com",
    "OMXVSE:VBL1L": "vilkyskiu.lt", "OMXVSE:INC1L": "invltechnology.lt", "OMXVSE:AMG1L": "ambergrid.lt",
    "OMXTSE:LHV1T": "lhv.ee", "OMXTSE:TAL1T": "tallink.com", "OMXTSE:TSM1T": "ts.ee", "OMXTSE:MRK1T": "merko.ee",
    "OMXTSE:TKM1T": "kaubamaja.ee", "OMXTSE:HAE1T": "harjuelekter.com", "OMXTSE:TVE1T": "tallinnavesi.ee",
    "OMXTSE:CPA1T": "cooppank.ee", "OMXTSE:INF1T": "infortar.ee", "OMXTSE:EFT1T": "eften.ee",
    "OMXRSE:GRD1R": "grindeks.lv", "OMXRSE:SAF1R": "saftehnika.com", "OMXRSE:DGR1R": "delfingroup.lv",
    "NASDAQ:ANT": "anthropic.com", "NYSE:OKLO": "oklo.com", "NASDAQ:MRVL": "marvell.com", "OMXSTO:VOLV_B": "volvogroup.com",
    "AMEX:ARKK": "ark-funds.com",
}
# Vikipedijos straipsniai, kurių pagrindinis paveikslėlis – įmonės logotipas (atsarginis šaltinis)
WIKI = {
    "NASDAQ:MRVL": "en/Marvell_Technology", "OMXSTO:VOLV_B": "en/Volvo_Group", "AMEX:ARKK": "en/Ark_Invest",
    "OMXTSE:MRK1T": "et/Merko_Ehitus", "OMXTSE:HAE1T": "et/Harju_Elekter", "OMXRSE:GRD1R": "en/Grindeks",
}
# Šiuos perrašyti net jei logotipas jau yra (buvo neteisingas)
REFRESH = {"NYSE:OKLO"}


def name_of(tv: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", tv.replace(":", "_"))


def get(url: str) -> bytes | None:
    try:
        r = requests.get(url, headers=UA, timeout=15)
        if r.status_code == 200 and len(r.content) > 200:
            return r.content
    except Exception:  # noqa: BLE001
        pass
    return None


def good(img: Image.Image, min_side: int) -> bool:
    if min(img.size) < min_side:
        return False
    small = img.convert("RGBA").resize((16, 16))
    px = [p for p in small.getdata() if p[3] > 30]
    if len(px) < 12:
        return False
    return len({(r // 24, g // 24, b // 24) for r, g, b, _ in px}) > 1 or len(px) > 200  # ne vientisas pilkas kvadratas


def save(data: bytes, dest: Path, min_side: int = 40) -> bool:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        if getattr(img, "n_frames", 1) > 1:
            img.seek(0)
        img = img.convert("RGBA")
    except Exception:  # noqa: BLE001
        return False
    if not good(img, min_side):
        return False
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    img.thumbnail((88, 88), Image.LANCZOS)
    canvas = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    canvas.paste(img, ((96 - img.width) // 2, (96 - img.height) // 2), img)
    canvas.save(dest, "PNG", optimize=True)
    return True


def favicon(domain: str, min_side: int = 48) -> bytes | None:
    # Pirmiausia didelės „apple-touch-icon“ ikonos (180×180), tada paieškos sistemų ikonos
    for url in (f"https://{domain}/apple-touch-icon.png", f"https://www.{domain}/apple-touch-icon.png", f"https://{domain}/apple-touch-icon-precomposed.png", f"https://icon.horse/icon/{domain}",
                f"https://www.google.com/s2/favicons?domain={domain}&sz=128", f"https://icons.duckduckgo.com/ip3/{domain}.ico",
                f"https://unavatar.io/{domain}?fallback=false", f"https://favicone.com/{domain}?s=256"):
        data = get(url)
        if data:
            try:
                im = Image.open(io.BytesIO(data))
                if min(im.size) >= min_side:
                    return data
            except Exception:  # noqa: BLE001
                pass
    return None


def wiki_logo(page: str) -> bytes | None:
    lang, title = page.split("/", 1)
    try:
        r = requests.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}", headers=UA, timeout=15)
        src = (r.json().get("thumbnail") or {}).get("source") if r.status_code == 200 else None
    except Exception:  # noqa: BLE001
        src = None
    if not src:
        return None
    src = re.sub(r"/(\d+)px-", "/240px-", src)  # didesnė miniatiūra
    return get(src)


def main() -> int:
    groups = json.loads((ROOT / "data/assets.json").read_text(encoding="utf-8"))["groups"]
    OUT.mkdir(parents=True, exist_ok=True)
    force = "--force" in sys.argv
    found: dict[str, str] = {}
    websites = {}
    try:
        import yfinance as yf  # noqa: F401
    except Exception:  # noqa: BLE001
        yf = None
    for g in groups:
        for a in g["items"]:
            tv = a["s"]
            if tv.startswith("X:"):
                continue
            dest = OUT / f"{name_of(tv)}.png"
            rel = f"assets/logos/{dest.name}"
            if dest.exists() and not force and tv not in REFRESH:
                found[tv] = rel
                continue
            y = yahoo_symbol(tv)
            ok = False
            if g["id"] == "crypto":
                base = re.sub(r"(USDT|USD)$", "", tv.split(":")[1]).lower()
                for url in (f"https://assets.coincap.io/assets/icons/{base}@2x.png",):
                    data = get(url)
                    if data and save(data, dest):
                        ok = True
                        break
            elif g["id"] == "etf":
                key = next((k for k, _ in ISSUERS if a["n"].startswith(k) or k in a["n"]), None)
                urls = [f"https://financialmodelingprep.com/image-stock/{y}.png"] if y else []
                if key in ISSUER_STOCK:
                    urls.append(f"https://financialmodelingprep.com/image-stock/{ISSUER_STOCK[key]}.png")
                for url in urls:
                    data = get(url)
                    if data and save(data, dest):
                        ok = True
                        break
                if not ok and (tv in DOMAINS or key):
                    data = favicon(DOMAINS.get(tv) or dict(ISSUERS)[key], 32)
                    ok = bool(data and save(data, dest, 32))
            else:
                if tv in DOMAINS:
                    data = favicon(DOMAINS[tv], 48) or favicon(DOMAINS[tv], 32)
                    ok = bool(data and save(data, dest, 32))
                if not ok and y:
                    for url in (f"https://financialmodelingprep.com/image-stock/{y}.png", f"https://assets.parqet.com/logos/symbol/{y.split('.')[0]}?format=png"):
                        data = get(url)
                        if data and save(data, dest):
                            ok = True
                            break
                if not ok and y and yf is not None:
                    try:
                        site = yf.Ticker(y).info.get("website") or ""
                        websites[tv] = site
                        dom = re.sub(r"^https?://(www\.)?", "", site).split("/")[0]
                        data = favicon(dom, 32) if dom else None
                        ok = bool(data and save(data, dest, 32))
                    except Exception:  # noqa: BLE001
                        pass
            if not ok and tv in WIKI:
                data = wiki_logo(WIKI[tv])
                ok = bool(data and save(data, dest, 32))
            if not ok and g["id"] == "etf":
                # To paties valdytojo fondai – tas pats logotipas
                key = next((k for k, _ in ISSUERS if a["n"].startswith(k) or k in a["n"]), None)
                sib = next((x for x in g["items"] if x["s"] != tv and key and (x["n"].startswith(key) or key in x["n"]) and (OUT / f"{name_of(x['s'])}.png").exists()), None)
                if sib:
                    dest.write_bytes((OUT / f"{name_of(sib['s'])}.png").read_bytes())
                    ok = True
            if ok:
                found[tv] = rel
            print(("✓" if ok else "✗"), tv, a["n"])
            time.sleep(0.15)
    (ROOT / "data/logos.json").write_text(json.dumps(found, ensure_ascii=False, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    total = sum(1 for g in groups for a in g["items"] if not a["s"].startswith("X:"))
    print(f"Logotipų: {len(found)} iš {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
