"use strict";

// Startsidan: dagens menyer, röstning och hjulet. Bygger på core.js.

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

// Ikoner för rättens typ (fältet "type"). Tunna linjer i textens färg: färg betyder alltid en restaurang.
const DISH_TYPES = {
  kott: { label: "Kött", paths: [
    "M4 12.5C4 8 7.6 4.5 12.6 4.5c4.6 0 7.9 2.7 7.9 6.4 0 3-2.1 4.6-4.4 5.1-1.5.3-2.4 1-3.1 2.2-.9 1.6-2.4 2.8-4.6 2.8C5.6 21 4 18.6 4 15.6z",
    "M7 12.6c0-3 2.5-5.3 5.6-5.3",
    "M14.6 11.2a1.6 1.6 0 1 0-3.2 0 1.6 1.6 0 1 0 3.2 0",
  ] },
  fagel: { label: "Fågel", paths: [
    "M8.8 15.2C8 11 9 6 13.5 4.2c4-1.6 8 1.3 7.1 5.4-.8 3.8-6.1 6-11.8 5.6z",
    "M8.8 15.2 5.4 18.6",
    "M5.4 18.6c-.8-.9-2.3-.8-2.8.3-.5 1.1.4 2.3 1.5 2.1-.2 1.1 1 2 2.1 1.5 1.1-.5 1.2-2 .3-2.8",
  ] },
  fisk: { label: "Fisk", paths: [
    "M2.5 12c2.6-3.6 6-5.2 9.5-5.2 3.1 0 5.4 1.6 7 3.2l2.5-2.2v8.4L19 14c-1.6 1.6-3.9 3.2-7 3.2-3.5 0-6.9-1.6-9.5-5.2z",
    "M7.2 11.2h.01",
  ] },
  vegetarisk: { label: "Vegetarisk", paths: [
    "M20 4C10.5 4 4.5 8.8 4.5 15.6c0 1.6.3 3 .9 4.4",
    "M20 4c0 9.4-5.4 15-12.6 15-1 0-2-.1-2.9-.4",
    "M5.4 20C7.6 14.4 11.2 10.6 16 8.2",
  ] },
  vegansk: { label: "Vegansk", paths: [
    "M12 21v-9",
    "M12 12c0-3.6-2.5-6-7-6 0 4 2.5 6 7 6z",
    "M12 10c0-3.6 2.5-6 7-6 0 4-2.5 6-7 6z",
  ] },
};

function dishIcon(type) {
  const icon = DISH_TYPES[type];
  if (!icon) return null;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "dish-icon");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", icon.label);
  const title = document.createElementNS(ns, "title");
  title.textContent = icon.label;
  svg.append(title, ...icon.paths.map((d) => {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    return path;
  }));
  return svg;
}

// Teckenförklaring för de ikoner som syns den dagen.
function iconLegend(restaurants) {
  const used = new Set(restaurants.flatMap((r) => (r.dishes ?? []).map((d) => d.type)));
  const types = Object.keys(DISH_TYPES).filter((t) => used.has(t));
  if (!types.length) return null;
  return el("ul", { class: "icon-legend" }, types.map((t) => el("li", {}, dishIcon(t), DISH_TYPES[t].label)));
}

function dishList(r) {
  if (!r.dishes?.length) {
    const link = r.source_url && el("a", {
      class: "menu-link", href: r.source_url, target: "_blank", rel: "noopener",
      onclick: (e) => e.stopPropagation(),  // Klick på länken ska inte räknas som röst
    }, r.link_only ? "Se dagens meny ↗" : "Se menyn ↗");
    const text = r.note ?? (r.link_only ? "Menyn finns på restaurangens sida." : "Ingen meny hittad idag.");
    return el("p", { class: "empty" }, el("span", {}, text), link);
  }
  return el("ul", { class: "dishes" },
    r.dishes.map((d) => el("li", { class: "dish" },
      el("div", { class: "dish-line" },
        el("span", { class: "dish-name" }, d.name),
        dishIcon(d.type),
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
        source && r.dishes?.length > 0 && r.source_url && el("a", { class: "source", href: r.source_url, target: "_blank", rel: "noopener", "aria-label": `Menyn hos ${r.name}` }, "Meny ↗"),
      ),
    ),
    dishList(r),
  ];
}

// Restaurangens pris, annars spannet av rätternas egna priser (t.ex. Matronan: 125–139 kr).
function priceTag(r) {
  const dishPrices = (r.dishes ?? []).map((d) => d.price).filter(Boolean);
  if (r.price) return el("span", { class: "price" }, `${r.price} kr`);
  if (!dishPrices.length) return null;
  const lo = Math.min(...dishPrices), hi = Math.max(...dishPrices);
  return el("span", { class: "price" }, lo === hi ? `${lo} kr` : `${lo}–${hi} kr`);
}

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

  const withMenuFirst = [...restaurants].sort((a, b) => !a.dishes?.length - !b.dishes?.length);
  const cards = withMenuFirst.map((r) => {
    const content = cardContent(r, {
      extra: myVote === r.id ? el("span", { class: "check" }, "Din röst") : priceTag(r),
      source: !voting,
    });
    const classes = ["card", myVote === r.id && "picked", state.pending === r.id && "selected"].filter(Boolean).join(" ");
    const attrs = { class: classes, style: `--c:${r.color}` };
    return el("li", { class: r.dishes?.length ? null : "compact" }, voting
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
    iconLegend(restaurants),
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
    shape.dataset.id = s.id;
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
      label.dataset.id = s.id;
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
    (b.id === winner.id) - (a.id === winner.id) || !a.dishes?.length - !b.dishes?.length ||
    (counts[b.id] || 0) - (counts[a.id] || 0) || order(a) - order(b));
  const cards = el("ul", { class: "cards" }, ranked.map((r) => {
    const won = r.id === winner.id;
    const votes = counts[r.id] || 0;
    return el("li", { class: [won && "won", !r.dishes?.length && "compact"].filter(Boolean).join(" ") || null }, el("div", { class: `card${won ? " won" : ""}`, style: `--c:${r.color}` },
      cardContent(r, {
        extra: [
          won && el("span", { class: "badge" }, "Dagens val"),
          total > 0 && el("span", { class: "votes" }, `${votes} ${votes === 1 ? "röst" : "röster"}`),
          priceTag(r),
        ],
        source: true,
      }),
    ));
  }));

  // Under en direktsänd snurr visas namnet och listan först när hjulet stannat, så att ordningen inte avslöjar vinnaren.
  const reveal = el("div", { class: `reveal${live ? " hidden" : ""}` },
    el("div", { class: "winner-head", style: `--c:${winner.color}` },
      el("span", { class: "logo big" }, winner.logo ? el("img", { src: winner.logo, alt: "" }) : winner.name[0]),
      el("p", { class: "eyebrow" }, "Dagens lunch"),
      el("h2", { class: "winner" }, winner.name),
      el("p", { class: "winner-note" }, total
        ? `${winner.votes} av ${total} röster · hade ${Math.round(winner.share * 100)} % chans`
        : "Inga röster – alla hade lika chans"),
    ),
    cards,
    iconLegend(restaurants),
  );

  main.replaceChildren(el("section", { class: "result" },
    el("div", { class: "wheel" }, svg, el("div", { class: "hub" }), el("div", { class: "pointer" })),
    reveal,
  ));

  const settle = () => {
    svg.querySelectorAll("[data-id]").forEach((n) => n.classList.toggle("win", n.dataset.id === winner.id));
    svg.classList.add("settled");
  };
  if (!live) {
    svg.style.transform = `rotate(${rotation}deg)`;
    settle();
    return;
  }
  svg.style.transform = "rotate(0deg)";
  svg.getBoundingClientRect();  // Tvinga fram startläget innan animationen
  svg.classList.add("spinning");
  svg.style.transform = `rotate(${rotation}deg)`;
  svg.addEventListener("transitionend", () => { settle(); reveal.classList.remove("hidden"); }, { once: true });
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

  document.querySelector(".stats-link").hidden = !CFG.showStats;
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
