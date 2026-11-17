// InvestAI – statinė svetainė. Turinys skaitomas iš data/*.json.
const STATUS = {
  primary: { label: "Pirminis šaltinis", cls: "primary" },
  media: { label: "Žiniasklaida", cls: "media" },
  unverified: { label: "Reikia patikrinti", cls: "unverified" },
};
const MONTHS = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
const WEEKDAYS = ["sekmadienis", "pirmadienis", "antradienis", "trečiadienis", "ketvirtadienis", "penktadienis", "šeštadienis"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

function fmtDate(iso, withWeekday = false) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const base = `${y} m. ${MONTHS[m - 1]} ${d} d.`;
  return withWeekday ? `${base}, ${WEEKDAYS[dt.getUTCDay()]}` : base;
}
function fmtShort(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)}. ${d} d.`;
}
async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

function renderItem(it) {
  const st = STATUS[it.status] || STATUS.media;
  const tags = (it.tags || []).map((t) => `<span class="badge tag">${esc(t)}</span>`).join("");
  const srcs = (it.sources || [])
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`)
    .join(" · ");
  return `
    <article class="item">
      <div class="badges"><span class="badge ${st.cls}">${st.label}</span>${tags}</div>
      <h3>${esc(it.headline)}</h3>
      <p>${esc(it.text)}</p>
      ${it.note ? `<p class="item-note">⚠ ${esc(it.note)}</p>` : ""}
      ${it.why ? `<p class="why"><b>Kodėl svarbu:</b> ${esc(it.why)}</p>` : ""}
      ${srcs ? `<div class="sources">Šaltiniai: ${srcs}</div>` : ""}
    </article>`;
}

function renderDigest(d) {
  const sections = (d.sections || [])
    .map((s) => `<section id="${esc(s.id)}"><h2>${esc(s.title)}</h2>${s.items.map(renderItem).join("")}</section>`)
    .join("");
  const cal = (d.calendar || []).length
    ? `<section id="kalendorius"><h2>Artimiausios datos</h2><ul class="cal">${d.calendar
        .map((c) => `<li><time datetime="${esc(c.date)}">${fmtShort(c.date)}</time><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.text)}</a></li>`)
        .join("")}</ul></section>`
    : "";
  const noPrices = d.prices_available === false
    ? `<div class="notice">Šioje apžvalgoje dar nėra atskirų akcijų dienos kainų lentelės – ji bus pridėta artimiausiu metu.</div>`
    : "";
  document.title = `${d.title} – InvestAI`;
  return `
    <div class="dateline">${fmtDate(d.date, true)}</div>
    <h1>${esc(d.title)}</h1>
    <p class="lead">${esc(d.lead)}</p>
    <p class="ai-note">Apžvalgą parengė dirbtinis intelektas pagal nurodytus šaltinius. Tai ne investavimo rekomendacija.</p>
    ${noPrices}${sections}${cal}`;
}

async function pageHome(root) {
  const params = new URLSearchParams(location.search);
  const idx = await getJSON("data/index.json");
  const date = isDate(params.get("d")) ? params.get("d") : idx.latest;
  const d = await getJSON(`data/digests/${date}.json`);
  root.innerHTML = renderDigest(d);
}

async function pageArchive(root) {
  const idx = await getJSON("data/index.json");
  root.innerHTML = `
    <h1 style="margin-top:36px">Archyvas</h1>
    <ul class="archive">${idx.digests
      .map((x) => `<li><time datetime="${esc(x.date)}">${fmtDate(x.date, true)}</time><a href="./?d=${esc(x.date)}">${esc(x.title)}</a><p>${esc(x.lead)}</p></li>`)
      .join("")}</ul>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("app");
  if (!root) return;
  const page = document.body.dataset.page;
  try {
    if (page === "home") await pageHome(root);
    if (page === "archive") await pageArchive(root);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<p class="error">Nepavyko įkelti apžvalgos. Bandykite atnaujinti puslapį.</p>`;
  }
});
