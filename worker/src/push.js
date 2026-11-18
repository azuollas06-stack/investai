// Web Push pranešimai (RFC 8291 šifravimas + VAPID), tik su naršyklės WebCrypto.
// Raktai sugeneruojami pirmą kartą ir laikomi Durable Object saugykloje (ne repozitorijoje).
import { DurableObject } from "cloudflare:workers";

const SITE = "https://azuollas06-stack.github.io/investai/";
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const concat = (...arrs) => { const n = arrs.reduce((t, a) => t + a.length, 0), out = new Uint8Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
const hkdf = async (salt, ikm, info, len) => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
};
const hash = async (s) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 22);

async function encrypt(sub, payload) {
  const uaPub = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

export class Push extends DurableObject {
  async vapid() {
    let v = await this.ctx.storage.get("vapid");
    if (!v) {
      const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      v = { priv: await crypto.subtle.exportKey("jwk", kp.privateKey), pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)) };
      await this.ctx.storage.put("vapid", v);
    }
    return v;
  }
  async publicKey() { return (await this.vapid()).pub; }

  async jwt(aud) {
    const v = await this.vapid();
    const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
    const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })));
    const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
    return { token: `${head}.${body}.${b64u(sig)}`, pub: v.pub };
  }

  async send(sub, msg) {
    const url = new URL(sub.endpoint);
    const { token, pub } = await this.jwt(url.origin);
    const body = await encrypt(sub, JSON.stringify(msg));
    const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: `vapid t=${token}, k=${pub}`, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "43200", Urgency: "normal" }, body });
    return r.status;
  }

  async subscribe(data) {
    const id = await hash(data.sub.endpoint);
    const prev = (await this.ctx.storage.get("s:" + id)) || {};
    await this.ctx.storage.put("s:" + id, { sub: data.sub, symbols: data.symbols, names: data.names || {}, th: data.th, earnings: !!data.earnings, weekly: data.weekly !== false, levels: data.levels || {}, premium: !!data.premium, sent: prev.sent || {}, at: Date.now() });
    return { ok: true, id };
  }
  async unsubscribe(endpoint) { await this.ctx.storage.delete("s:" + (await hash(endpoint))); return { ok: true }; }
  async status(endpoint) { const s = await this.ctx.storage.get("s:" + (await hash(endpoint))); return s ? { on: true, symbols: s.symbols, th: s.th, earnings: s.earnings, weekly: s.weekly !== false, levels: s.levels || {} } : { on: false }; }
  async test(endpoint) {
    const s = await this.ctx.storage.get("s:" + (await hash(endpoint)));
    if (!s) return { ok: false };
    const st = await this.send(s.sub, { title: "InvestAI įspėjimai įjungti", body: `Pranešime, kai ${s.symbols.length === 1 ? "tavo akcija" : "kuri nors iš tavo akcijų"} per dieną pajudės daugiau nei ${s.th} %.`, url: "portfelis.html" });
    return { ok: st < 300, status: st };
  }

  // Kas 15 min. prekybos metu: patikriname kainas ir išsiunčiame įspėjimus
  async check() {
    const get = async (p) => { try { const r = await fetch(SITE + p + "?t=" + Date.now(), { cf: { cacheTtl: 60 } }); return r.ok ? await r.json() : null; } catch { return null; } };
    const [P, L] = await Promise.all([get("data/prices.json"), get("data/live.json")]);
    if (!P) return { ok: false };
    const items = P.items || {}, live = (L && L.items) || {};
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const all = await this.ctx.storage.list({ prefix: "s:" });
    let sent = 0, removed = 0;
    for (const [k, s] of all) {
      let changed = false;
      for (const sym of s.symbols) {
        const p = items[sym]; if (!p) continue;
        const lv = live[sym];
        const d1 = lv && lv[2] === today ? lv[1] : p.date === today ? p.d1 : null;
        const name = s.names[sym] || sym.split(":")[1];
        if (d1 !== null && d1 !== undefined && Math.abs(d1) >= s.th && s.sent[sym] !== today) {
          const pct = `${d1 > 0 ? "+" : "−"}${Math.abs(d1).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %`;
          const st = await this.send(s.sub, { title: `${name} ${pct} šiandien`, body: `${d1 > 0 ? "Pakilo" : "Nukrito"} daugiau nei ${s.th} %. Paspausk ir pažiūrėk, kas vyksta.`, url: `aktyvas.html?s=${encodeURIComponent(sym)}` });
          if (st === 404 || st === 410) { await this.ctx.storage.delete(k); removed++; changed = false; break; }
          s.sent[sym] = today; changed = true; sent++;
        }
        if (s.earnings && p.ed === tomorrow && s.sent["ed:" + sym] !== today) {
          const st = await this.send(s.sub, { title: `Rytoj ${name} ataskaita`, body: "Ataskaitų dieną akcijos kaina dažnai svyruoja smarkiau nei įprastai.", url: `aktyvas.html?s=${encodeURIComponent(sym)}` });
          if (st === 404 || st === 410) { await this.ctx.storage.delete(k); removed++; changed = false; break; }
          s.sent["ed:" + sym] = today; changed = true; sent++;
        }
      }
      // Kainos lygio įspėjimai (vienkartiniai): { sym: { lo, hi } }
      for (const [sym, lv] of Object.entries(s.levels || {})) {
        const p = items[sym]; if (!p || !lv) continue;
        const lvp = live[sym];
        const price = lvp && lvp[0] ? lvp[0] : p.price;
        const name = s.names[sym] || sym.split(":")[1];
        const hitLo = typeof lv.lo === "number" && price <= lv.lo, hitHi = typeof lv.hi === "number" && price >= lv.hi;
        if (!hitLo && !hitHi) continue;
        const fmt = (v) => v.toLocaleString("lt-LT", { maximumFractionDigits: v < 10 ? 2 : 1 });
        const st = await this.send(s.sub, { title: `${name}: kaina ${hitLo ? "nukrito iki" : "pakilo iki"} ${fmt(price)} ${p.cur || ""}`, body: `Tavo nustatytas lygis – ${fmt(hitLo ? lv.lo : lv.hi)} ${p.cur || ""}. Įspėjimas išjungtas; jei reikia, nustatyk naują.`, url: `aktyvas.html?s=${encodeURIComponent(sym)}` });
        if (st === 404 || st === 410) { await this.ctx.storage.delete(k); removed++; changed = false; break; }
        if (hitLo) delete lv.lo; if (hitHi) delete lv.hi;
        if (lv.lo === undefined && lv.hi === undefined) delete s.levels[sym];
        changed = true; sent++;
      }
      if (changed && (await this.ctx.storage.get(k))) await this.ctx.storage.put(k, s);
    }
    return { ok: true, subs: all.size, sent, removed };
  }

  // Sekmadienio vakaro santrauka: kaip per savaitę pajudėjo pasirinktos akcijos ir kas laukia
  async weekly() {
    const r = await fetch(SITE + "data/prices.json?t=" + Date.now()).catch(() => null);
    if (!r || !r.ok) return { ok: false };
    const items = (await r.json()).items || {};
    const today = new Date().toISOString().slice(0, 10), wk = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const all = await this.ctx.storage.list({ prefix: "s:" });
    let sent = 0;
    for (const [k, s] of all) {
      if (s.weekly === false || s.sent.week === today) continue;
      const rows = s.symbols.map((sym) => ({ sym, p: items[sym], n: s.names[sym] || sym.split(":")[1] })).filter((x) => x.p && typeof x.p.w1 === "number");
      if (!rows.length) continue;
      const pc = (v) => `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %`;
      const top = rows.sort((x, y) => Math.abs(y.p.w1) - Math.abs(x.p.w1)).slice(0, 3).map((x) => `${x.n} ${pc(x.p.w1)}`).join(", ");
      const ev = rows.filter((x) => x.p.ed && x.p.ed > today && x.p.ed <= wk).map((x) => x.n);
      const up = rows.filter((x) => x.p.w1 > 0).length;
      const st = await this.send(s.sub, { title: `Tavo savaitė: ${up} iš ${rows.length} akcijų pakilo`, body: `${top}.${ev.length ? ` Kitą savaitę ataskaitas skelbia: ${ev.slice(0, 3).join(", ")}.` : ""}`, url: "portfelis.html" });
      if (st === 404 || st === 410) { await this.ctx.storage.delete(k); continue; }
      s.sent.week = today; await this.ctx.storage.put(k, s); sent++;
    }
    return { ok: true, sent };
  }
}
