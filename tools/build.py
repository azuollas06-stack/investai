"""Sugeneruoja HTML puslapius iš tools/head.html + tools/pages/*.body.html.
Paleisti iš repozitorijos šaknies: python3 tools/build.py"""
from pathlib import Path
import hashlib, re

ROOT = Path(__file__).resolve().parent.parent
HEAD = (ROOT / "tools/head.html").read_text(encoding="utf-8")
DESC = "Kasdienė rinkų apžvalga lietuvių kalba su pirminiais šaltiniais, S&P 500 ir Baltijos akcijos, aktyvų grafikai ir naujienos."
PAGES = {
    "index": "InvestAI – suprask, kas vyksta rinkose",
    "apzvalga": "Dienos apžvalga – InvestAI",
    "rinkos": "Rinkos – InvestAI",
    "aktyvas": "Aktyvai – InvestAI",
    "portfelis": "Mano portfelis – InvestAI",
    "archyvas": "Archyvas – InvestAI",
    "apie": "Apie – InvestAI",
}
def ver(rel):
    return hashlib.sha1((ROOT / rel).read_bytes()).hexdigest()[:8]

def bust(html):
    return re.sub(r'(src|href)="(assets/[^"?]+\.(?:js|css))"', lambda m: f'{m.group(1)}="{m.group(2)}?v={ver(m.group(2))}"', html)

for name, title in PAGES.items():
    body = (ROOT / f"tools/pages/{name}.body.html").read_text(encoding="utf-8")
    html = HEAD.replace("{{TITLE}}", title).replace("{{DESC}}", DESC) + body.rstrip() + "\n</body>\n</html>\n"
    (ROOT / f"{name}.html").write_text(bust(html), encoding="utf-8")
    print("built", name)
