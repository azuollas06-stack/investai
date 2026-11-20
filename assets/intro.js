/* InvestAI – animuotas pirmo apsilankymo pristatymas („istorijos“).
   Rodomas vieną kartą pradžios puslapyje; vėl atidaromas per index.html?intro=1 arba meniu „Trumpas turas“. */
(function () {
  const KEY = "investai.intro.v1";
  const DUR = 6500; // vienos skaidrės trukmė (ms)
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SLIDES = [
    {
      cls: "s-hi",
      title: "Sveikas atvykęs į InvestAI",
      text: "Per minutę parodysiu, ką čia gali padaryti. Viskas nemokama, lietuviškai ir be reklamų.",
      art: `<div class="ia-logo"><span></span><span></span><span></span></div>
        <div class="ia-float">${["Portfelio rentgenas", "Akcijos žodžiais", "AI asistentas", "Įspėjimai telefone", "Naujienos", "Mokesčiai"].map((t, i) => `<i style="--i:${i}">${t}</i>`).join("")}</div>`,
    },
    {
      cls: "s-pf",
      title: "Pamatyk, kur iš tikrųjų tavo pinigai",
      text: "Įkelk brokerio ekrano nuotrauką ar CSV – per kelias sekundes matysi šalis, sektorius ir didžiausias rizikas.",
      art: `<div class="ia-shot"><b></b><b></b><b></b><b></b></div>
        <svg class="ia-donut" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="44" pathLength="100" class="d0"/>
          <circle cx="60" cy="60" r="44" pathLength="100" class="d1" style="--len:58;--off:0"/>
          <circle cx="60" cy="60" r="44" pathLength="100" class="d2" style="--len:24;--off:-58"/>
          <circle cx="60" cy="60" r="44" pathLength="100" class="d3" style="--len:18;--off:-82"/>
        </svg>
        <ul class="ia-legend"><li><i class="c1"></i>JAV <b>58 %</b></li><li><i class="c2"></i>Europa <b>24 %</b></li><li><i class="c3"></i>Kita <b>18 %</b></li></ul>`,
    },
    {
      cls: "s-plain",
      title: "Kiekviena akcija – paprastais žodžiais",
      text: "Ne tik skaičiai: pelningumas, augimas, kaina ir skola paaiškinti žodžiais, plius patikra pagal Buffetto, Grahamo ir kitų taisykles.",
      art: `<div class="ia-card"><div class="ia-card-h"><span class="ia-av">A</span><b>Pavyzdys, Inc.</b></div>
        <p class="ia-type"><span>Labai pelninga ir sparčiai auganti įmonė be didelių skolų.</span></p>
        <ul>${[["good", "Pelningumas", "Labai pelninga"], ["good", "Augimas", "Sparčiai auga"], ["bad", "Kaina (P/E)", "Brangesnė nei dauguma"], ["good", "Buffetto taisyklės", "5 iš 5"]].map(([t, k, v], i) => `<li class="${t}" style="--i:${i}"><em>${t === "good" ? "✓" : "!"}</em><span>${k}</span><b>${v}</b></li>`).join("")}</ul></div>`,
    },
    {
      cls: "s-ai",
      title: "Klausk – AI atsako lietuviškai",
      text: "Kodėl krito akcija? Ką reiškia rodiklis? Asistentas pasidomi naujausiomis naujienomis ir nurodo šaltinius.",
      art: `<div class="ia-chat">
          <div class="ia-q"><span>Kodėl šiandien krito Nvidia?</span></div>
          <div class="ia-dots"><i></i><i></i><i></i></div>
          <div class="ia-a"><p>Akcija smuko po pranešimų apie naujus JAV lustų eksporto ribojimus…</p><span class="ia-src">Šaltinis: Reuters</span></div>
        </div>`,
    },
    {
      cls: "s-bell",
      title: "Svarbiausia – tiesiai į telefoną",
      text: "Pranešimas, kai tavo akcija stipriai pajuda ar pasiekia tavo nustatytą kainą, ir trumpa rytinė santrauka.",
      art: `<div class="ia-phone"><div class="ia-notch"></div>
          <div class="ia-note n1"><b>InvestAI</b><span>Nvidia šiandien −5,2 %</span></div>
          <div class="ia-note n2"><b>InvestAI</b><span>Rytas: tavo portfelis +0,8 %</span></div>
          <div class="ia-note n3"><b>InvestAI</b><span>Apple pasiekė tavo kainą 250 $</span></div>
        </div>`,
    },
    {
      cls: "s-go",
      title: "Nuo ko pradėsi?",
      text: "Pasirink – visada galėsi grįžti.",
      art: `<div class="ia-go">
          <a class="ia-btn primary" href="portfelis.html"><span>${typeof icon === "function" ? icon("upload", 22) : ""}</span><b>Įkelti savo portfelį</b><small>Nuotrauka, CSV ar ranka</small></a>
          <a class="ia-btn" href="portfelis.html?pavyzdys=1"><span>${typeof icon === "function" ? icon("portfolio", 22) : ""}</span><b>Pažiūrėti pavyzdį</b><small>Išgalvotas portfelis</small></a>
          <button type="button" class="ia-btn" data-act="ob"><span>${typeof icon === "function" ? icon("target", 22) : ""}</span><b>Pritaikyti sau</b><small>3 klausimai, 20 sekundžių</small></button>
          <button type="button" class="ia-btn ghost" data-act="close"><b>Tiesiog apsidairyti</b></button>
        </div>`,
      last: true,
    },
  ];

  function open() {
    if (document.querySelector(".ia")) return;
    const d = document.createElement("dialog");
    d.className = "ia";
    d.setAttribute("aria-label", "InvestAI pristatymas");
    d.innerHTML = `<div class="ia-bg" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="ia-top"><div class="ia-bars">${SLIDES.map(() => `<span><i></i></span>`).join("")}</div>
        <button type="button" class="ia-skip">Praleisti</button></div>
      <div class="ia-stage">${SLIDES.map((s, i) => `<section class="ia-slide ${s.cls}" data-i="${i}" aria-hidden="true">
          <div class="ia-art">${s.art}</div>
          <div class="ia-txt"><h2>${s.title}</h2><p>${s.text}</p></div></section>`).join("")}</div>
      <div class="ia-nav"><button type="button" class="ia-prev" aria-label="Atgal">‹</button><span class="ia-count"></span><button type="button" class="ia-next" autofocus>Toliau</button></div>`;
    document.body.appendChild(d);
    document.documentElement.classList.add("ia-lock");
    d.showModal();
    const slides = [...d.querySelectorAll(".ia-slide")], bars = [...d.querySelectorAll(".ia-bars i")];
    let cur = -1, timer = null, t0 = 0, left = DUR, paused = false;
    const done = () => { try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now() })); } catch {} };
    const close = () => { done(); clearTimeout(timer); d.classList.add("out"); setTimeout(() => { d.close(); d.remove(); document.documentElement.classList.remove("ia-lock"); }, reduce() ? 0 : 280); };
    function go(i) {
      if (i < 0) i = 0;
      if (i >= slides.length) return close();
      cur = i;
      slides.forEach((s, k) => { s.classList.toggle("on", k === i); s.classList.toggle("past", k < i); s.setAttribute("aria-hidden", String(k !== i)); });
      bars.forEach((b, k) => { b.style.transition = "none"; b.style.width = k < i ? "100%" : "0%"; });
      d.querySelector(".ia-count").textContent = `${i + 1} / ${slides.length}`;
      d.querySelector(".ia-prev").style.visibility = i ? "visible" : "hidden";
      const nx = d.querySelector(".ia-next");
      nx.textContent = SLIDES[i].last ? "Uždaryti" : i === 0 ? "Pradėti" : "Toliau";
      clearTimeout(timer);
      left = DUR;
      if (!SLIDES[i].last && !reduce()) run();
      else bars[i].style.width = "100%";
    }
    function run() {
      const b = bars[cur];
      t0 = performance.now();
      requestAnimationFrame(() => { b.style.transition = `width ${left}ms linear`; b.style.width = "100%"; });
      timer = setTimeout(() => go(cur + 1), left);
    }
    function pause() {
      if (paused || SLIDES[cur].last || reduce()) return;
      paused = true; clearTimeout(timer);
      left = Math.max(300, left - (performance.now() - t0));
      const b = bars[cur]; const w = getComputedStyle(b).width; b.style.transition = "none"; b.style.width = w;
      d.classList.add("paused");
    }
    function resume() { if (!paused) return; paused = false; d.classList.remove("paused"); run(); }
    d.querySelector(".ia-skip").addEventListener("click", close);
    d.querySelector(".ia-next").addEventListener("click", () => (SLIDES[cur].last ? close() : go(cur + 1)));
    d.querySelector(".ia-prev").addEventListener("click", () => go(cur - 1));
    d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    d.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") go(cur + 1); if (e.key === "ArrowLeft") go(cur - 1); });
    // Palietus kairę/dešinę ekrano pusę – kaip „istorijose“; laikant – pauzė
    const stage = d.querySelector(".ia-stage");
    let downAt = 0, sx = 0;
    stage.addEventListener("pointerdown", (e) => { if (e.target.closest("a,button")) return; downAt = Date.now(); sx = e.clientX; pause(); });
    stage.addEventListener("pointerup", (e) => {
      if (!downAt || e.target.closest("a,button")) return;
      const held = Date.now() - downAt, dx = e.clientX - sx; downAt = 0;
      if (Math.abs(dx) > 40) return go(cur + (dx < 0 ? 1 : -1));
      if (held < 250) return go(cur + (e.clientX > window.innerWidth / 3 ? 1 : -1));
      resume();
    });
    stage.addEventListener("pointercancel", () => { downAt = 0; resume(); });
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "close") close();
      if (b.dataset.act === "ob") { close(); setTimeout(() => { if (typeof ONBOARD !== "undefined") ONBOARD.open(() => location.reload()); }, 320); }
    });
    d.querySelectorAll(".ia-go a").forEach((a) => a.addEventListener("click", done));
    go(0);
  }

  function seen() { try { return !!localStorage.getItem(KEY); } catch { return true; } }
  function maybe() {
    const q = new URLSearchParams(location.search);
    if (q.has("intro")) { history.replaceState(null, "", location.pathname); return setTimeout(open, 200); }
    // Tik pirmą kartą ir tik naujam lankytojui (be portfelio)
    let hasPf = false;
    try { hasPf = ((JSON.parse(localStorage.getItem("investai.portfolio.v1") || "{}").holdings) || []).length > 0; } catch {}
    if (!seen() && !hasPf && !navigator.webdriver) setTimeout(open, 900);
  }
  window.INTRO = { open, maybe, seen };
})();
