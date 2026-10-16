"use strict";

const CFG = window.LUNCH;
const TZ = "Europe/Stockholm";
const COLORS = ["#c2603e", "#c8963a", "#6a9270", "#557796", "#86688e", "#b5687a", "#4a8480", "#8a867e"];
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

async function loadCounts(date, restaurants) {
  if (state.counts[date]) return state.counts[date];
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
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));  // Torsdagen samma vecka avgör året
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

function renderHeader(date) {
  const d = asDate(date);
  const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "UTC" }).format(d);
  const sameYear = date.slice(0, 4) === stockholmNow().date.slice(0, 4);
  const day = new Intl.DateTimeFormat("sv-SE", {
    day: "numeric", month: "long", year: sameYear ? undefined : "numeric", timeZone: "UTC",
  }).format(d);
  $("weekday").textContent = weekday[0].toUpperCase() + weekday.slice(1);
  $("date").textContent = `${day} · vecka ${isoWeek(d)}`;
  const i = state.dates.indexOf(date);
  $("prev").disabled = i <= 0;
  $("next").disabled = i < 0 || i >= state.dates.length - 1;
  document.title = `Lunch · ${weekday} ${day}`;
}

function dishList(r) {
  if (!r.dishes?.length) {
    const link = r.source_url && el("a", {
      class: "menu-link", href: r.source_url, target: "_blank", rel: "noopener",
      onclick: (e) => e.stopPropagation(),  // Klick på länken ska inte räknas som röst
    }, "Se menyn ↗");
    return el("p", { class: "empty" }, r.note, r.note && link && " · ", link || (!r.note && "Ingen meny hittad"));
  }
  return el("ul", { class: "dishes" },
    r.dishes.map((d) => el("li", { class: "dish" },
      d.label && el("span", { class: "dish-label" }, d.label),
      el("div", { class: "dish-line" },
        el("span", { class: "dish-name" }, d.name),
        d.price && el("span", { class: "dish-price" }, `${d.price} kr`),
      ),
      d.description && el("p", { class: "dish-desc" }, d.description),
    )),
    r.note && el("li", { class: "note" }, r.note),
  );
}

// Rubrikrad och rätter för ett menykort. `extra` hamnar till höger om namnet.
function cardContent(r, { extra, source }) {
  return [
    el("div", { class: "card-head" },
      el("span", { class: "logo" }, r.logo ? el("img", { src: r.logo, alt: "", loading: "lazy" }) : r.name[0]),
      el("h2", {}, r.name),
      el("div", { class: "meta" },
        extra,
        source && r.dishes?.length > 0 && r.source_url && el("a", { class: "source", href: r.source_url, target: "_blank", rel: "noopener", "aria-label": "Källa" }, "Källa ↗"),
      ),
    ),
    dishList(r),
  ];
}

const priceTag = (r) => r.price && el("span", { class: "price" }, `${r.price} kr`);

function renderMenus(date, restaurants, phase) {
  const main = $("main");
  const voting = phase === "voting";
  const myVote = store.get(`vote:${date}`);
  const isToday = date === stockholmNow().date;

  const mine = myVote && restaurants.find((r) => r.id === myVote);
  let status = null;
  if (voting) status = mine
    ? `Du har röstat på ${mine.name}. Du kan byta fram till ${clock(CFG.spinAt)}.`
    : `Välj en restaurang och bekräfta. Röstningen stänger ${clock(CFG.spinAt)}.`;
  else if (isToday) status = `Röstningen öppnar ${clock(CFG.voteOpens)}`;

  // Klick väljer, knappen i listen längst ned bekräftar. Klick på det valda avmarkerar.
  const select = (id) => {
    if (state.sending) return;
    state.pending = state.pending === id || id === myVote ? null : id;
    show(date);
  };

  const cards = restaurants.map((r) => {
    const content = cardContent(r, {
      extra: myVote === r.id ? el("span", { class: "check" }, "Din röst") : priceTag(r),
      source: !voting,
    });
    const classes = ["card", myVote === r.id && "picked", state.pending === r.id && "selected"].filter(Boolean).join(" ");
    const attrs = { class: classes, style: `--c:${r.color}` };
    return el("li", {}, voting
      ? el("div", {
          ...attrs,
          class: `${classes} votable`,
          role: "button",
          tabindex: "0",
          "aria-pressed": state.pending === r.id ? "true" : "false",
          onclick: () => select(r.id),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(r.id); } },
        }, content)
      : el("div", attrs, content));
  });

  const pending = voting && state.pending && restaurants.find((r) => r.id === state.pending);
  const confirm = pending && el("div", { class: "confirm", style: `--c:${pending.color}` },
    el("span", { class: "confirm-text" }, mine ? `Byt till ${pending.name}?` : `Rösta på ${pending.name}?`),
    el("button", { class: "button ghost", disabled: state.sending, onclick: () => select(pending.id) }, "Avbryt"),
    el("button", { class: "button primary", disabled: state.sending, onclick: () => vote(date, pending.id) }, state.sending ? "Skickar…" : "Bekräfta"),
  );

  main.replaceChildren(...[
    status && el("p", { class: "status", id: "status" }, status),
    el("ul", { class: "cards" }, cards),
    confirm,
  ].filter(Boolean));
}

function wheelSvg(slices) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-102 -102 204 204");
  const point = (deg, r) => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)];

  for (const s of slices) {
    let shape;
    if (slices.length === 1) {
      shape = document.createElementNS(ns, "circle");
      shape.setAttribute("r", "100");
    } else {
      const [x0, y0] = point(s.start, 100);
      const [x1, y1] = point(s.end, 100);
      shape = document.createElementNS(ns, "path");
      shape.setAttribute("d", `M0 0L${x0} ${y0}A100 100 0 ${s.end - s.start > 180 ? 1 : 0} 1 ${x1} ${y1}Z`);
    }
    shape.setAttribute("fill", s.color);
    shape.setAttribute("stroke", "var(--bg)");
    shape.setAttribute("stroke-width", "1.2");
    svg.append(shape);

    if (s.end - s.start >= 20) {
      const mid = (s.start + s.end) / 2;
      const label = document.createElementNS(ns, "text");
      label.setAttribute("transform", `rotate(${mid - 90}) translate(62 0)${mid > 180 ? " rotate(180)" : ""}`);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      label.textContent = s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name;
      svg.append(label);
    }
  }
  return svg;
}

async function renderResult(date, restaurants, { live, renderId }) {
  const main = $("main");

  if (live) {
    // Låt sena röster landa och sprid ut anropen så räknartjänsten inte överbelastas.
    main.replaceChildren(el("p", { class: "status" }, "Räknar röster…"));
    await sleep(4000 + Math.random() * 8000);
  }

  let counts;
  try {
    counts = await loadCounts(date, restaurants);
  } catch {
    if (renderId !== state.renderId) return;
    main.replaceChildren(el("p", { class: "status error" }, "Kunde inte hämta rösterna. Ladda om sidan."));
    return;
  }
  if (renderId !== state.renderId) return;

  const { slices, winner, total, rotation } = spinWheel(date, restaurants, counts);
  const svg = wheelSvg(slices);
  // Alla menyer under hjulet: vinnaren först, sedan flest röster, annars samma ordning som förut.
  const order = (r) => restaurants.indexOf(r);
  const ranked = [...restaurants].sort((a, b) =>
    (b.id === winner.id) - (a.id === winner.id) || (counts[b.id] || 0) - (counts[a.id] || 0) || order(a) - order(b));
  const cards = el("ul", { class: "cards" }, ranked.map((r) => {
    const won = r.id === winner.id;
    const votes = counts[r.id] || 0;
    return el("li", {}, el("div", { class: `card${won ? " picked" : ""}`, style: `--c:${r.color}` },
      cardContent(r, {
        extra: [
          won && el("span", { class: "badge" }, "Valt"),
          total > 0 && el("span", { class: "votes" }, `${votes} ${votes === 1 ? "röst" : "röster"}`),
          priceTag(r),
        ],
        source: true,
      }),
    ));
  }));

  // Under en direktsänd snurr visas namnet och listan först när hjulet stannat, så att ordningen inte avslöjar vinnaren.
  const reveal = el("div", { class: `reveal${live ? " hidden" : ""}` },
    el("p", { class: "eyebrow" }, "Hjulet valde"),
    el("h2", { class: "winner" }, winner.name),
    !total && el("p", { class: "status" }, "Inga röster – alla hade lika chans"),
    cards,
  );

  main.replaceChildren(el("section", { class: "result" },
    el("div", { class: "wheel" }, svg, el("div", { class: "hub" }), el("div", { class: "pointer" })),
    reveal,
  ));

  if (!live) {
    svg.style.transform = `rotate(${rotation}deg)`;
    return;
  }
  svg.style.transform = "rotate(0deg)";
  svg.getBoundingClientRect();  // Tvinga fram startläget innan animationen
  svg.classList.add("spinning");
  svg.style.transform = `rotate(${rotation}deg)`;
  svg.addEventListener("transitionend", () => reveal.classList.remove("hidden"), { once: true });
}

async function show(date, { live = false } = {}) {
  const renderId = ++state.renderId;
  const phase = phaseFor(date);
  if (state.date !== date || phase !== "voting") state.pending = null;
  state.date = date;
  state.phase = phase;
  renderHeader(date);
  const menu = await loadMenu(date);
  if (renderId !== state.renderId) return;

  const restaurants = restaurantsFor(menu);
  if (phase === "result") await renderResult(date, restaurants, { live, renderId });
  else renderMenus(date, restaurants, phase);
}

// ---------- Röstning ----------

async function hit(date, id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(counterUrl("hit", date, id), { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await sleep(800 * (attempt + 1));
  }
  throw new Error("Räknaren svarade inte");
}

// Ett byte som inte hann räknas av för den gamla restaurangen sparas och skickas nästa gång.
async function settleOwed(date) {
  const owed = store.get(`owed:${date}`) ?? [];
  // Efter 11.30 får inget ändras, då skulle olika besökare få olika hjul.
  if (!owed.length || phaseFor(date) !== "voting") return;
  const left = [];
  for (const id of owed) await hit(date, minusKey(id)).catch(() => left.push(id));
  if (left.length) store.set(`owed:${date}`, left);
  else store.remove(`owed:${date}`);
}

async function vote(date, id) {
  const previous = store.get(`vote:${date}`);
  if (state.sending || previous === id || phaseFor(date) !== "voting") return;
  state.sending = true;
  show(date);
  try {
    await hit(date, id);
  } catch {
    state.sending = false;
    await show(date);
    const status = $("status");
    if (status) { status.textContent = "Rösten gick inte fram, försök igen."; status.classList.add("error"); }
    return;
  }
  store.set(`vote:${date}`, id);
  if (previous) store.set(`owed:${date}`, [...(store.get(`owed:${date}`) ?? []), previous]);
  state.pending = null;
  state.sending = false;
  show(date);
  await settleOwed(date);
}

// ---------- Navigering ----------

function go(step) {
  const i = state.dates.indexOf(state.date) + step;
  if (i >= 0 && i < state.dates.length) location.hash = state.dates[i];
}

function tick() {
  const today = stockholmNow().date;
  if (state.date !== today) return;
  const phase = phaseFor(today);
  if (phase !== state.phase) show(today, { live: state.phase === "voting" && phase === "result" });
}

async function init() {
  const [restaurants, index] = await Promise.all([
    getJSON("data/restaurants.json"),
    getJSON("data/index.json").catch(() => ({ dates: [] })),
  ]);
  state.restaurants = restaurants;

  const today = stockholmNow().date;
  const dates = new Set(index.dates.filter(isWeekday));
  if (isWeekday(today) || dates.size === 0) dates.add(today);
  state.dates = [...dates].sort();

  const fromHash = location.hash.slice(1);
  const start = state.dates.includes(fromHash) ? fromHash : state.dates.filter((d) => d <= today).pop() ?? state.dates[0];

  $("prev").addEventListener("click", () => go(-1));
  $("next").addEventListener("click", () => go(1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });
  window.addEventListener("hashchange", () => {
    const date = location.hash.slice(1);
    if (state.dates.includes(date) && date !== state.date) show(date);
  });
  setInterval(tick, 1000);

  if (TEST) {
    const banner = el("div", { class: "test-banner" });
    document.body.prepend(banner);
    const pad = (n) => String(n).padStart(2, "0");
    const update = () => {
      const s = stockholmNow().seconds;
      banner.textContent = `Testläge · klockan ${pad(Math.floor(s / 3600) % 24)}.${pad(Math.floor(s / 60) % 60)}.${pad(s % 60)} · rösterna räknas inte`;
    };
    update();
    setInterval(update, 1000);
  }

  await show(start);
  settleOwed(today);
}

init();
