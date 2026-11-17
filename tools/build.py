"""Sugeneruoja HTML puslapius iš tools/head.html + tools/pages/*.body.html.
Paleisti iš repozitorijos šaknies: python3 tools/build.py"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEAD = (ROOT / "tools/head.html").read_text(encoding="utf-8")
DESC = "Kasdienė rinkų apžvalga lietuvių kalba su pirminiais šaltiniais, S&P 500 ir Baltijos akcijos, aktyvų grafikai ir naujienos."
PAGES = {
    "index": "InvestAI – suprask, kas vyksta rinkose",
    "apzvalga": "Dienos apžvalga – InvestAI",
    "rinkos": "Rinkos – InvestAI",
    "aktyvas": "Aktyvai – InvestAI",
    "archyvas": "Archyvas – InvestAI",
    "apie": "Apie – InvestAI",
}
for name, title in PAGES.items():
    body = (ROOT / f"tools/pages/{name}.body.html").read_text(encoding="utf-8")
    html = HEAD.replace("{{TITLE}}", title).replace("{{DESC}}", DESC) + body.rstrip() + "\n</body>\n</html>\n"
    (ROOT / f"{name}.html").write_text(html, encoding="utf-8")
    print("built", name)
