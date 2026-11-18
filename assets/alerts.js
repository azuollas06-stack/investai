// InvestAI įspėjimai telefone: bendra logika portfeliui ir aktyvo puslapiui.
// Nustatymai laikomi naršyklėje ir kiekvieną kartą visi nusiunčiami serveriui (be sumų ir asmens duomenų).
"use strict";
const ALERTS = (() => {
  const KEY = "investai.alerts.v1"; // { symbols, names, th, earnings, weekly, levels }
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let CFG = null;
  const cfgUrl = async () => { if (!CFG) { try { CFG = await getJSON("data/ai.json"); } catch { CFG = {}; } } return CFG.url || ""; };
  const prem = () => { try { return localStorage.getItem("investai.premium.ai") || ""; } catch { return ""; } };
  const premHdr = () => (prem() ? { "X-Premium": prem() } : {});
  const u8 = (b) => { b = b.replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "="; return Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0)); };
  const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error("Programėlės dalis dar neįsikėlė – perkrauk puslapį ir bandyk dar kartą.")), 4000))]);
  function get() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
  function set(c) { try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY); } catch {} }
  const isOn = () => !!get() && supported && Notification.permission === "granted";
  const canUse = () => supported && !(ios && !standalone);
  const blockedText = () => (ios ? "iPhone pranešimus leidžia tik programėlėms: Safari spausk <b>Bendrinti</b> → <b>Į pradžios ekraną</b>, tada atidaryk InvestAI iš pradžios ekrano." : "Ši naršyklė pranešimų nepalaiko. Pabandyk Chrome, Edge ar Firefox.");
  async function api(path, data) {
    const r = await fetch((await cfgUrl()) + path, { method: "POST", headers: { "Content-Type": "application/json", ...premHdr() }, body: JSON.stringify(data) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Nepavyko");
    return d;
  }
  async function subscription(create) {
    const reg = await swReady();
    let s = await reg.pushManager.getSubscription();
    if (!s && create) {
      const { key } = await (await fetch((await cfgUrl()) + "/push/key")).json();
      s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
    }
    return s;
  }
  // Išsaugo visą konfigūraciją serveryje; pirmą kartą paprašo leidimo
  async function save(next) {
    if (!(await cfgUrl())) throw new Error("Įspėjimai šiuo metu neprieinami.");
    if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new Error("Pranešimai neleisti. Leisk juos naršyklės nustatymuose.");
    const first = !isOn();
    const s = await subscription(true);
    const c = { symbols: [], names: {}, th: 5, earnings: true, weekly: true, levels: {}, ...next };
    await api("/push/subscribe", { sub: s.toJSON(), ...c });
    set(c);
    if (first) api("/push/test", { sub: s.toJSON() }).catch(() => {});
    return c;
  }
  async function off() {
    try { const s = await subscription(false); if (s) { await api("/push/unsubscribe", { sub: s.toJSON() }).catch(() => {}); await s.unsubscribe(); } } catch {}
    set(null);
  }
  async function test() { const s = await subscription(false); if (!s) throw new Error("Įspėjimai neįjungti."); return api("/push/test", { sub: s.toJSON() }); }
  // Serveris išjungia suveikusius kainos lygius – susinchronizuojame
  async function sync() {
    const c = get();
    if (!c || !supported || Notification.permission !== "granted") return c;
    try {
      const s = await subscription(false);
      if (!s) return c;
      const st = await api("/push/status", { sub: s.toJSON() });
      if (st.on) { c.levels = st.levels || {}; set(c); }
    } catch {}
    return c;
  }
  return { supported, ios, standalone, canUse, blockedText, get, set, isOn, save, off, test, sync, isPremium: () => !!prem() };
})();
