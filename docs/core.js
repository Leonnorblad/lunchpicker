"use strict";

// Gemensamt för startsidan (app.js) och statistiken (stats.js): tid, data, röster och hjulet.

const CFG = window.LUNCH;
const TZ = "Europe/Stockholm";
// Fast färg per restaurang, i restaurants.json-ordning. Ordningen är kontrollerad för färgblindhet
// (skillen dataviz, validate_palette.js) i ljust och mörkt läge. Fler än sex restauranger blir grå.
const COLORS = ["#c4532f", "#2f6fb3", "#b9800f", "#c84a7a", "#7a52b8", "#3f8f4a", "#8a867e"];
const SPIN_TURNS = 6;

const $ = (id) => document.getElementById(id);
const state = { restaurants: [], dates: [], date: null, phase: null, menus: {}, counts: {}, renderId: 0, pending: null, sending: false };

// ---------- Testläge ----------
// ?tid=11.29 låtsas att klockan är 11.29 idag och låter den gå vidare därifrån (?datum=2026-10-16 byter dag).
// Röster hamnar i ett eget namnområde per sidladdning, så de riktiga rösterna påverkas inte.

const params = new URLSearchParams(location.search);
const TEST = /^\d{1,2}[.:]\d{2}([.:]\d{2})?$/.test(params.get("tid") ?? "") && {
  start: (([h, m, s = 0]) => h * 3600 + m * 60 + s)(params.get("tid").split(/[.:]/).map(Number)),
  date: /^\d{4}-\d{2}-\d{2}$/.test(params.get("datum") ?? "") ? params.get("datum") : null,
  loadedAt: Date.now(),
};
const NAMESPACE = TEST ? `${CFG.namespace}-test-${Math.random().toString(36).slice(2, 8)}` : CFG.namespace;

// ---------- Tid ----------

function stockholmNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  if (TEST) {
    return { date: TEST.date ?? `${p.year}-${p.month}-${p.day}`, seconds: TEST.start + Math.floor((Date.now() - TEST.loadedAt) / 1000) };
  }
  return { date: `${p.year}-${p.month}-${p.day}`, seconds: +p.hour * 3600 + +p.minute * 60 + +p.second };
}

const toSeconds = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 3600 + m * 60; };
const asDate = (iso) => new Date(`${iso}T12:00:00Z`);
const isWeekday = (iso) => { const d = asDate(iso).getUTCDay(); return d >= 1 && d <= 5; };
const clock = (hhmm) => hhmm.replace(":", ".");

function phaseFor(date) {
  const now = stockholmNow();
  if (date < now.date) return "result";
  if (date > now.date) return "upcoming";
  if (now.seconds < toSeconds(CFG.voteOpens)) return "upcoming";
  if (now.seconds < toSeconds(CFG.spinAt)) return "voting";
  return "result";
}

// ---------- Lagring i webbläsaren ----------

// I testläget sparas inget mellan laddningar, så varje test börjar från noll.
const memory = new Map();
const store = TEST
  ? { get: (key) => memory.get(key) ?? null, set: (key, value) => memory.set(key, value), remove: (key) => memory.delete(key) }
  : {
      get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
      set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
      remove(key) { try { localStorage.removeItem(key); } catch {} },
    };

// ---------- Data ----------

async function getJSON(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function loadMenu(date) {
  state.menus[date] ??= getJSON(`data/menus/${date}.json`).catch(() => null);
  return state.menus[date];
}

// Restaurangerna för en dag, med fast färg per restaurang.
function restaurantsFor(menu) {
  const list = menu?.restaurants ?? state.restaurants;
  return list.map((r) => {
    const index = state.restaurants.findIndex((x) => x.id === r.id);
    const conf = state.restaurants[index] ?? {};
    return { ...r, logo: conf.logo, source_url: r.source_url ?? r.menu_url, color: COLORS[index >= 0 ? index : COLORS.length - 1] };
  });
}

const counterUrl = (action, date, id) => `${CFG.counterApi}/${action}/${NAMESPACE}/${date}_${id}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Läser en räknare. 404 betyder att ingen har röstat; vid 429/nätverksfel försöker vi igen.
async function getCount(date, id) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(counterUrl("get", date, id), { cache: "no-store" });
      if (response.status === 404) return 0;
      if (response.ok) return (await response.json()).value ?? 0;
    } catch {}
    await sleep(1500 + Math.random() * 2500 * (attempt + 1));
  }
  throw new Error("Kunde inte hämta röster");
}

// En röst som byts räknas som +1 på nya restaurangen och +1 på den gamlas "_minus"-räknare.
// Abacus kan bara räkna ned med en hemlig nyckel, så så här klarar sidan sig utan.
const minusKey = (id) => `${id}_minus`;

// Avslutade dagar sparas i data/votes.json av scripts/archive_votes.py. Arkivet går före
// Abacus, så gamla dagar blir rätt även om namespace byts och sidan slipper fråga om dem.
let archive = null;
function loadArchive() {
  archive ??= TEST ? Promise.resolve({}) : getJSON("data/votes.json").then((a) => a.days ?? {}).catch(() => ({}));
  return archive;
}

async function loadCounts(date, restaurants) {
  if (state.counts[date]) return state.counts[date];
  const archived = (await loadArchive())[date];
  if (archived) return (state.counts[date] = archived);
  const cached = store.get(`counts:${date}`);
  if (cached) return (state.counts[date] = cached);

  const ids = restaurants.flatMap((r) => [r.id, minusKey(r.id)]);
  const values = await Promise.all(ids.map((id) => getCount(date, id)));
  const value = Object.fromEntries(ids.map((id, i) => [id, values[i]]));
  const counts = Object.fromEntries(restaurants.map((r) => [r.id, Math.max(0, value[r.id] - value[minusKey(r.id)])]));
  state.counts[date] = counts;
  store.set(`counts:${date}`, counts);  // Rösterna är stängda, resultatet ändras inte
  return counts;
}

// ---------- Slumpen: samma resultat för alla ----------

function hash(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

function seededRandom(seed) {
  let a = seed;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Bygger hjulets tårtbitar och väljer var pilen landar.
function spinWheel(date, restaurants, counts) {
  const total = restaurants.reduce((sum, r) => sum + (counts[r.id] || 0), 0);
  const entries = restaurants
    .map((r) => ({ ...r, votes: counts[r.id] || 0, weight: total ? counts[r.id] || 0 : 1 }))
    .filter((r) => r.weight > 0);
  const weightSum = entries.reduce((sum, r) => sum + r.weight, 0);

  let angle = 0;
  const slices = entries.map((r) => {
    const sweep = (r.weight / weightSum) * 360;
    const slice = { ...r, start: angle, end: angle + sweep, share: r.weight / weightSum };
    angle += sweep;
    return slice;
  });

  const seed = `${date}|${slices.map((s) => `${s.id}:${s.weight}`).join(",")}`;
  const landing = seededRandom(hash(seed)) * 360;
  const winner = slices.find((s) => landing >= s.start && landing < s.end) ?? slices[slices.length - 1];
  return { slices, winner, total, rotation: SPIN_TURNS * 360 - landing };
}

// ---------- Rendering ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "style") node.style.cssText = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));  // Torsdagen samma vecka avgör året
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}
