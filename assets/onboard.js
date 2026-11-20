// InvestAI pradžios klausimynas: 3 klausimai → asmeninis kelias pradžios puslapyje.
// Atsakymai laikomi tik naršyklėje; jie keičia, ką rodome, bet nėra investavimo rekomendacija.
"use strict";
const ONBOARD = (() => {
  const KEY = "investai.profile.v1";
  const Q = [
    { id: "exp", q: "Kiek turi patirties investuojant?", a: [["new", "Tik pradedu", "Noriu suprasti pagrindus"], ["some", "Šiek tiek", "Turiu kelias akcijas ar fondą"], ["pro", "Investuoju reguliariai", "Seku rinkas ir savo portfelį"]] },
    { id: "goal", q: "Kas tau svarbiausia?", a: [["grow", "Kaupti ilgam", "10 ir daugiau metų – pvz., pensijai"], ["income", "Pasyvios pajamos", "Dividendai ir palūkanos"], ["follow", "Sekti rinkas", "Akcijos, naujienos, idėjos"], ["unsure", "Dar nežinau", "Pirmiausia noriu pasidomėti"]] },
    { id: "risk", q: "Tavo investicijos per mėnesį nukrito 20 %. Ką darytum?", a: [["low", "Parduočiau", "Kad neprarasčiau dar daugiau"], ["mid", "Nieko nedaryčiau", "Lauktum, kol atsigaus"], ["high", "Pirkčiau daugiau", "Pigiau – geras metas"]] },
  ];
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const set = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };
  const LABEL = {
    exp: { new: "pradedantysis", some: "šiek tiek patirties", pro: "patyręs" },
    goal: { grow: "kaupimas ilgam", income: "pasyvios pajamos", follow: "rinkų sekimas", unsure: "dar renkasi tikslą" },
    risk: { low: "vengia svyravimų", mid: "vidutinė rizika", high: "pakelia didelius svyravimus" },
  };
  const describe = (p) => (p && !p.skip ? `Vartotojo profilis (jo paties atsakymai): ${LABEL.exp[p.exp] || "–"}, tikslas – ${LABEL.goal[p.goal] || "–"}, požiūris į riziką – ${LABEL.risk[p.risk] || "–"}.` : "");

  // Asmeninis kelias: tik InvestAI funkcijos ir mokymasis, ne konkretūs aktyvai
  function steps(p) {
    const s = [];
    if (p.exp === "new") s.push(["glossary", "Išmok 10 pagrindinių terminų", "Akcija, ETF, dividendai, P/E – paprastai ir lietuviškai", "zodynas.html"], ["ai", "Paklausk AI: „Nuo ko pradėti investuoti?“", "Asistentas paaiškins žingsnius be „pirk“ ar „parduok“", "#ai:Nuo ko pradėti investuoti, jei niekada to nedariau?"]);
    if (p.exp !== "new") s.push(["upload", "Įkelk savo portfelį", "Nuotrauka arba brokerio CSV – pamatysi sudėtį, rizikas ir „Kas toliau“", "portfelis.html"]);
    if (p.goal === "grow" || p.goal === "unsure") s.push(["tools", "Kiek užaugtų tavo santaupos?", "Skaičiuoklė su infliacija – pamatysi sudėtinių palūkanų galią", "irankiai.html#taupymas"]);
    if (p.goal === "income") s.push(["tools", "Dividendų skaičiuoklė", "Kiek pajamų galėtų atnešti investicijos", "irankiai.html#dividendai"]);
    if (p.goal === "follow") s.push(["morning", "Šiandien", "Kas vyksta rinkose ir su tavo stebimomis akcijomis", "rytas.html"], ["screener", "Atranka", "Filtruok akcijas ir fondus pagal savo kriterijus", "atranka.html"]);
    if (p.risk === "low") s.push(["strategy", "Ramesnės strategijos pavyzdžiai", "Kaip obligacijos ir platūs fondai mažina svyravimus", "portfelis.html#strategija"]);
    else s.push(["strategy", "Pasirink strategiją", "Pamatysi, kaip paskirstyti sumą tarp akcijų, fondų ir obligacijų", "portfelis.html#strategija"]);
    if (p.exp === "pro") s.push(["bell", "Įjunk įspėjimus telefone", "Kai tavo akcija pajuda smarkiai ar pasiekia tavo kainą", "portfelis.html"]);
    return s.slice(0, 4);
  }
  function cardHTML(p) {
    const st = steps(p);
    return `<section class="ob-card" id="ob-card"><div class="ob-card-h"><div><h2>Tavo kelias</h2><p class="muted small">${[LABEL.exp[p.exp], LABEL.goal[p.goal]].filter(Boolean).join(" · ")}</p></div><button type="button" class="linkish ob-redo">Keisti</button><button type="button" class="icon-btn ob-x" aria-label="Paslėpti">${icon("close", 18)}</button></div>
      <ol class="ob-steps">${st.map(([ic, t, d, href], i) => `<li><a href="${href.startsWith("#ai:") ? "#" : href}" ${href.startsWith("#ai:") ? `data-ai-q="${esc(href.slice(4))}"` : ""}><span class="ob-n">${i + 1}</span><span class="ob-i">${icon(ic, 20)}</span><span class="ob-t"><b>${esc(t)}</b><small>${esc(d)}</small></span>${icon("chevron", 18)}</a></li>`).join("")}</ol></section>`;
  }
  function open(onDone) {
    const ans = {};
    let i = 0;
    const d = document.createElement("dialog");
    d.className = "ob-sheet";
    document.body.appendChild(d);
    const draw = () => {
      const q = Q[i];
      d.innerHTML = `<div class="ob-in"><div class="ob-top"><div class="ob-prog">${Q.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div><button type="button" class="linkish ob-skip">Praleisti</button></div>
        ${i === 0 ? `<p class="ob-hi">Sveikas! 3 trumpi klausimai – ir pritaikysime InvestAI tau.</p>` : ""}
        <h2>${esc(q.q)}</h2>
        <div class="ob-opts">${q.a.map(([v, t, s]) => `<button type="button" class="ob-opt" data-v="${v}"><b>${esc(t)}</b><small>${esc(s)}</small></button>`).join("")}</div>
        ${i > 0 ? `<button type="button" class="linkish ob-back">← Atgal</button>` : ""}
        <p class="muted small ob-note">Atsakymai lieka tik tavo naršyklėje.</p></div>`;
      d.querySelectorAll(".ob-opt").forEach((b) => b.addEventListener("click", () => {
        ans[q.id] = b.dataset.v;
        if (++i < Q.length) draw();
        else { const p = { ...ans, at: Date.now() }; set(p); d.close(); onDone && onDone(p); }
      }));
      const bk = d.querySelector(".ob-back"); if (bk) bk.addEventListener("click", () => { i--; draw(); });
      d.querySelector(".ob-skip").addEventListener("click", () => { set({ skip: true, at: Date.now() }); d.close(); });
    };
    d.addEventListener("close", () => d.remove());
    draw();
    d.showModal();
  }
  function mountHome() {
    const host = document.querySelector(".home-search") || document.querySelector("main");
    if (!host) return;
    const render = (p) => {
      const old = document.getElementById("ob-card"); if (old) old.remove();
      if (!p || p.skip || p.hidden) return;
      host.insertAdjacentHTML("afterend", cardHTML(p));
      const c = document.getElementById("ob-card");
      c.querySelector(".ob-x").addEventListener("click", () => { set({ ...p, hidden: true }); c.remove(); });
      c.querySelector(".ob-redo").addEventListener("click", () => open(render));
      c.querySelectorAll("[data-ai-q]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); if (window.openAI) window.openAI(a.dataset.aiQ); }));
    };
    const p = get();
    let returning = false;
    try { returning = !!localStorage.getItem("investai.portfolio.v1") || (JSON.parse(localStorage.getItem("investai.watch.v1") || "[]").length > 0); } catch {}
    if (!p && !returning) {
      const qa = document.querySelector("main .qa"); const at = qa || host;
      // Pirmą kartą: ne iššokantis langas, o kvietimas – žmogus pirma pamato, kas čia yra
      at.insertAdjacentHTML("afterend", `<section class="card ob-invite" id="ob-card"><div><b>Pritaikyk InvestAI sau</b><p class="muted small">3 klausimai, 20 sekundžių – ir matysi tau tinkamą kelią bei paaiškinimus.</p></div>
        <div class="ob-inv-btns"><button type="button" class="btn primary small" id="ob-go">Pradėti</button><button type="button" class="ob-x" aria-label="Nerodyti">×</button></div></section>`);
      const c = document.getElementById("ob-card");
      c.querySelector("#ob-go").addEventListener("click", () => open(render));
      c.querySelector(".ob-x").addEventListener("click", () => { set({ skip: true }); c.remove(); });
    } else render(p);
  }
  return { get, describe, open, mountHome };
})();
