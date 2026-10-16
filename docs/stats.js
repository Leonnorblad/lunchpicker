"use strict";

// Statistiksidan. Bygger på core.js.
//
// Bara siffror som går att räkna exakt: röster per restaurang och dag (Abacus via
// data/votes.json), hjulets vinnare (samma spinWheel som startsidan, så det blir
// exakt det hjulet visade), om en meny hittades, antal rätter och lunchpris. Rätterna
// är fritext och räknas aldrig som "samma rätt" mellan dagar.
//
// ?exempel fyller sidan med påhittad data för att visa graferna. Det står tydligt på sidan.

const DEMO = params.has("exempel");
const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre"];
const svgNS = "http://www.w3.org/2000/svg";

// Diagrammen ritas i panelens verkliga bredd, så att texten behåller sin storlek på mobilen.
const chartWidth = () => Math.round(Math.min(780, Math.max(280, $("stats").clientWidth - 50)));

// ---------- Hjälpare ----------

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
}

const fmtDay = (iso, opts = { day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("sv-SE", { ...opts, timeZone: "UTC" }).format(asDate(iso));
const fmtLong = (iso) => {
  const s = fmtDay(iso, { weekday: "long", day: "numeric", month: "long" });
  return s[0].toUpperCase() + s.slice(1);
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pct = (x) => `${Math.round(x * 100)} %`;
const weekdayIndex = (iso) => asDate(iso).getUTCDay() - 1;  // 0 = måndag

// Snygga axelsteg: 0, 1, 2, 5, 10, 20, 50 ... Alla värden här är heltal, så steget är minst 1.
function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw));
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

// ---------- Tooltip ----------

const tip = $("tip");
function showTip(event, title, rows = []) {
  tip.replaceChildren(
    el("strong", {}, title),
    ...rows.map(([color, label, value]) => el("div", { class: "tip-row" },
      color ? el("span", { class: "tip-key", style: `--c:${color}` }) : el("span"),
      el("span", { class: "tip-label" }, label),
      el("span", { class: "tip-value" }, value),
    )),
  );
  tip.hidden = false;
  moveTip(event);
}
function moveTip(event) {
  const pad = 14;
  const { innerWidth: w, innerHeight: h } = window;
  const r = tip.getBoundingClientRect();
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + r.width > w - 8) x = event.clientX - r.width - pad;
  if (y + r.height > h - 8) y = event.clientY - r.height - pad;
  tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}
const hideTip = () => { tip.hidden = true; };
document.addEventListener("scroll", hideTip, { passive: true });

// ---------- Data ----------

async function loadRealDays(progress) {
  const [restaurants, index] = await Promise.all([
    getJSON("data/restaurants.json"),
    getJSON("data/index.json").catch(() => ({ dates: [] })),
  ]);
  state.restaurants = restaurants;
  const today = stockholmNow().date;
  // Bara avslutade dagar: hjulet har snurrat och rösterna ändras inte längre.
  const dates = [...new Set([...index.dates, today])].filter(isWeekday).filter((d) => phaseFor(d) === "result").sort();
  const menus = await Promise.all(dates.map(loadMenu));
  const days = [];
  for (const [i, date] of dates.entries()) {
    progress(i, dates.length);
    const list = restaurantsFor(menus[i]);
    const counts = await loadCounts(date, list);  // Arkivet först, annars Abacus (en dag i taget, räknarna har en gräns)
    days.push(makeDay(date, list, counts, Boolean(menus[i])));
  }
  return days;
}

function makeDay(date, list, counts, hasMenu) {
  const spin = spinWheel(date, list, counts);
  return { date, restaurants: list, counts, hasMenu, total: spin.total, winner: spin.winner, slices: spin.slices };
}

// Påhittad data för ?exempel: åtta veckor bakåt, deterministisk så att sidan ser likadan ut varje gång.
async function loadDemoDays() {
  state.restaurants = await getJSON("data/restaurants.json");
  const rand = (...parts) => seededRandom(hash(parts.join("|")));
  const popularity = state.restaurants.map((r, i) => 0.6 + rand("pop", r.id) * 1.6 - i * 0.05);
  const basePrice = state.restaurants.map((r) => 125 + Math.round(rand("price", r.id) * 6) * 5);
  const days = [];
  const end = asDate(stockholmNow().date);
  for (let offset = 56; offset >= 1; offset--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - offset);
    const date = d.toISOString().slice(0, 10);
    if (!isWeekday(date)) continue;
    const list = restaurantsFor(null).map((r, i) => {
      const found = !r.link_only && rand("found", date, r.id) > 0.12;
      const dishes = found ? Array.from({ length: 2 + Math.floor(rand("n", date, r.id) * 4) }, (_, k) => ({ name: `Rätt ${k + 1}` })) : [];
      const price = found ? basePrice[i] + (offset < 20 ? 5 : 0) : null;
      return { ...r, found, dishes, price };
    });
    const voters = rand("office", date) < 0.18 ? 0 : 6 + Math.floor(rand("voters", date) * 14);  // Ibland är ingen på kontoret
    const counts = Object.fromEntries(list.map((r) => [r.id, 0]));
    for (let v = 0; v < voters; v++) {
      const weights = list.map((r, i) => popularity[i] * (r.found ? 1 : 0.4) * (0.5 + rand("w", date, v, r.id)));
      let pick = rand("pick", date, v) * weights.reduce((a, b) => a + b, 0);
      const idx = weights.findIndex((w) => (pick -= w) < 0);
      counts[list[idx < 0 ? 0 : idx].id]++;
    }
    days.push(makeDay(date, list, counts, true));
  }
  return days;
}

// ---------- Beräkningar ----------

// Dagar då ingen röstade (t.ex. när ingen är på kontoret) valde hjulet helt slumpmässigt.
// De räknas inte som vinster om man inte själv slår på det i filtret.
const filter = { includeEmpty: store.get("stats:includeEmpty") === true };
const isCounted = (day) => filter.includeEmpty || day.total > 0;

function summarize(days) {
  const byId = new Map();
  const entity = (r) => {
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        id: r.id, name: r.name, color: r.color, logo: r.logo,
        wins: 0, votes: 0, listed: 0, withMenu: 0, dishes: 0, prices: [], winDates: [],
        weekdayWins: [0, 0, 0, 0, 0], bestDay: null, longest: 0,
      });
    }
    return byId.get(r.id);
  };
  // Restauranger i nuvarande ordning först, så färg och ordning följer restaurants.json.
  restaurantsFor(null).forEach(entity);

  let run = { id: null, length: 0 };
  for (const day of days) {
    for (const r of day.restaurants) {
      const e = entity(r);
      const votes = day.counts[r.id] || 0;
      e.listed++;
      e.votes += votes;
      if (r.found) { e.withMenu++; e.dishes += r.dishes?.length ?? 0; }
      if (r.found && r.price) e.prices.push({ date: day.date, price: r.price });
      if (votes > 0 && (!e.bestDay || votes > e.bestDay.votes)) e.bestDay = { date: day.date, votes };
    }
    if (!isCounted(day)) continue;  // Menyerna ovan räknas alla dagar, vinsterna bara de som räknas
    const w = entity(day.winner);
    w.wins++;
    w.winDates.push(day.date);
    w.weekdayWins[weekdayIndex(day.date)]++;
    run = run.id === w.id ? { id: w.id, length: run.length + 1 } : { id: w.id, length: 1 };
    w.longest = Math.max(w.longest, run.length);
  }

  const entities = [...byId.values()];
  const totalVotes = days.reduce((s, d) => s + d.total, 0);
  const votedDays = days.filter((d) => d.total > 0);
  // Skräll: hjulet valde en restaurang som inte hade flest röster.
  const upsets = votedDays.filter((d) => d.winner.votes < Math.max(...d.slices.map((s) => s.votes)));
  const luckiest = votedDays.reduce((best, d) => (!best || d.winner.share < best.winner.share ? d : best), null);
  const busiest = days.reduce((best, d) => (!best || d.total > best.total ? d : best), null);
  const counted = days.filter(isCounted);
  return { days, counted, entities, totalVotes, votedDays, upsets, luckiest, busiest, current: run };
}

// ---------- Rendering ----------

function section(title, subtitle, ...body) {
  return el("section", { class: "panel" },
    el("header", { class: "panel-head" }, el("h2", {}, title), subtitle && el("p", {}, subtitle)),
    ...body,
  );
}

const logo = (e) => el("span", { class: "logo", style: `--c:${e.color}` },
  e.logo ? el("img", { src: e.logo, alt: "" }) : e.name[0]);

function tiles(s) {
  const maxWins = Math.max(0, ...s.entities.map((e) => e.wins));
  const leaders = s.entities.filter((e) => maxWins > 0 && e.wins === maxWins);
  const tile = (label, value, note) => el("div", { class: "tile" },
    el("p", { class: "tile-label" }, label),
    el("p", { class: "tile-value" }, value),
    note && el("p", { class: "tile-note" }, note));
  return el("div", { class: "tiles" },
    tile(filter.includeEmpty ? "Dagar med hjul" : "Dagar med röster", String(s.counted.length),
      filter.includeEmpty ? `varav ${s.votedDays.length} med röster` : `av ${plural(s.days.length, "dag", "dagar")} med hjul`),
    tile("Röster totalt", String(s.totalVotes), s.votedDays.length ? null : "Ingen har röstat än"),
    tile("Röster per dag", s.votedDays.length ? (s.totalVotes / s.votedDays.length).toFixed(1).replace(".", ",") : "–", "de dagar någon röstade"),
    tile(leaders.length > 1 ? "Delad etta" : "Mest vald",
      leaders.length === 0 ? "–" : leaders.length <= 2 ? leaders.map((e) => e.name).join(" & ") : `${leaders.length} ställen`,
      leaders.length ? `${plural(maxWins, "gång", "gånger")}${leaders.length > 1 ? " var" : ""}` : null),
  );
}

function leaderboard(s) {
  const ranked = [...s.entities].filter((e) => e.listed > 0).sort((a, b) => b.wins - a.wins || b.votes - a.votes || a.name.localeCompare(b.name, "sv"));
  const maxWins = Math.max(1, ...ranked.map((e) => e.wins));
  let rank = 0, prev = null;
  const rows = ranked.map((e, i) => {
    if (!prev || e.wins !== prev.wins || e.votes !== prev.votes) rank = i + 1;
    prev = e;
    return el("li", { class: `lb-row${rank === 1 && e.wins > 0 ? " first" : ""}`, style: `--c:${e.color}` },
      el("span", { class: "lb-rank" }, String(rank)),
      logo(e),
      el("div", { class: "lb-main" },
        el("div", { class: "lb-name" }, e.name),
        el("div", { class: "lb-bar" }, el("span", { style: `width:${(e.wins / maxWins) * 100}%` })),
      ),
      el("div", { class: "lb-num" }, el("strong", {}, String(e.wins)), el("span", {}, e.wins === 1 ? "vinst" : "vinster")),
      el("div", { class: "lb-num muted" }, el("strong", {}, s.counted.length ? pct(e.wins / s.counted.length) : "–"), el("span", {}, "av dagarna")),
      el("div", { class: "lb-num muted" }, el("strong", {}, String(e.votes)), el("span", {}, e.votes === 1 ? "röst" : "röster")),
    );
  });
  return section("Topplista", filter.includeEmpty
    ? "Hur ofta hjulet har landat på varje ställe, alla dagar."
    : "Hur ofta hjulet har landat på varje ställe, de dagar någon röstade.", el("ol", { class: "leaderboard" }, rows));
}

function calendar(s) {
  if (!s.days.length) return null;
  // En rad per vecka, en kolumn per veckodag.
  const weeks = new Map();
  for (const d of s.days) {
    const key = `${asDate(d.date).getUTCFullYear()}-${isoWeek(asDate(d.date))}`;
    if (!weeks.has(key)) weeks.set(key, { week: isoWeek(asDate(d.date)), days: Array(5).fill(null) });
    weeks.get(key).days[weekdayIndex(d.date)] = d;
  }
  const grid = el("div", { class: "cal" },
    el("span", {}), WEEKDAYS.map((w) => el("span", { class: "cal-head" }, w)),
    [...weeks.values()].map((w) => [
      el("span", { class: "cal-week" }, `v. ${w.week}`),
      w.days.map((d) => {
        if (!d) return el("span", { class: "cal-cell empty" });
        if (!isCounted(d)) {
          return el("span", {
            class: "cal-cell skipped", tabindex: "0", "aria-label": `${fmtLong(d.date)}: ingen röstade`,
            onpointerenter: (ev) => showTip(ev, fmtLong(d.date), [[null, "Ingen röstade", "räknas inte"]]),
            onpointermove: moveTip, onpointerleave: hideTip,
          }, "–");
        }
        const e = s.entities.find((x) => x.id === d.winner.id);
        return el("span", {
          class: "cal-cell", style: `--c:${d.winner.color}`, tabindex: "0",
          "aria-label": `${fmtLong(d.date)}: ${d.winner.name}`,
          onpointerenter: (ev) => showTip(ev, fmtLong(d.date), [
            [d.winner.color, d.winner.name, d.total ? `${plural(d.winner.votes, "röst", "röster")} av ${d.total}` : "ingen röstade"],
          ]),
          onpointermove: moveTip, onpointerleave: hideTip,
        }, e?.logo ? el("img", { src: e.logo, alt: "" }) : d.winner.name[0]);
      }),
    ]),
  );
  return section("Hjulets val, dag för dag", "Varje ruta är en dag. Färgen är restaurangen hjulet landade på, grått betyder att ingen röstade.", grid);
}

// Staplade staplar: röster per dag och restaurang.
function votesPerDay(s) {
  if (!s.totalVotes) {
    return section("Röster per dag", null, el("p", { class: "empty-state" }, "Ingen har röstat än. Grafen fylls på när rösterna kommer in."));
  }
  const W = chartWidth(), H = 240, m = { t: 12, r: 8, b: 26, l: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ticks = niceTicks(Math.max(...s.days.map((d) => d.total)));
  const yMax = ticks.at(-1);
  const y = (v) => m.t + ih - (v / yMax) * ih;
  const band = iw / s.days.length;
  const bw = Math.max(3, Math.min(28, band * 0.7));
  const labelEvery = Math.ceil(s.days.length / Math.max(3, Math.floor(W / 80)));

  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Röster per dag, staplade per restaurang" },
    ticks.map((t) => svg("g", {},
      svg("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === 0 ? "axis" : "grid" }),
      svg("text", { x: m.l - 8, y: y(t), class: "tick", "text-anchor": "end", "dominant-baseline": "central" }, String(t)),
    )),
    s.days.map((d, i) => {
      const x = m.l + band * i + (band - bw) / 2;
      let acc = 0;
      const segs = d.restaurants.filter((r) => d.counts[r.id] > 0).map((r) => {
        const v = d.counts[r.id];
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        // 2 px glapp mellan segmenten (ytfärgad kant)
        return svg("rect", { x, y: y1, width: bw, height: Math.max(0, y0 - y1), fill: r.color, class: "seg" });
      });
      return svg("g", {
        class: "col",
        onpointerenter: (ev) => showTip(ev, fmtLong(d.date), [
          ...d.restaurants.filter((r) => d.counts[r.id] > 0).sort((a, b) => d.counts[b.id] - d.counts[a.id])
            .map((r) => [r.color, r.name, String(d.counts[r.id])]),
          [null, "Totalt", String(d.total)],
        ]),
        onpointermove: moveTip, onpointerleave: hideTip,
      },
        svg("rect", { x: m.l + band * i, y: m.t, width: band, height: ih, class: "hit" }),
        segs,
        i % labelEvery === 0 && svg("text", { x: x + bw / 2, y: H - 8, class: "tick", "text-anchor": "middle" }, fmtDay(d.date)),
      );
    }),
  );
  return section("Röster per dag", "Staplarna är dagens röster, uppdelade per restaurang.", legend(s), chart);
}

function legend(s) {
  return el("ul", { class: "legend" }, s.entities.filter((e) => e.listed > 0).map((e) =>
    el("li", { style: `--c:${e.color}` }, el("span", { class: "key" }), e.name)));
}

// Linjediagram med hårkors. series: [{ entity, points: [{ date, value }] }]
function lineChart({ series, dates, label, yFormat = String, yMin = 0, step = false }) {
  const W = chartWidth(), H = 260, m = { t: 14, r: W < 420 ? 84 : 96, b: 26, l: 36 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = yMin === "auto" ? Math.floor((Math.min(...values) - 5) / 10) * 10 : yMin;
  const ticks = niceTicks(Math.max(...values) - lo).map((t) => t + lo);
  const yMax = ticks.at(-1);
  const x = (date) => m.l + (dates.length < 2 ? iw / 2 : (dates.indexOf(date) / (dates.length - 1)) * iw);
  const y = (v) => m.t + ih - ((v - lo) / (yMax - lo || 1)) * ih;
  const labelEvery = Math.ceil(dates.length / Math.max(3, Math.floor(W / 90)));

  const pathFor = (pts) => pts.map((p, i) => {
    const px = x(p.date), py = y(p.value);
    if (i === 0) return `M${px} ${py}`;
    return step ? `H${px}V${py}` : `L${px} ${py}`;
  }).join("");

  // Direktetiketter för de fyra högsta slutvärdena; resten finns i förklaringen.
  const ends = series.map((s) => ({ s, last: s.points.at(-1) })).filter((e) => e.last)
    .sort((a, b) => b.last.value - a.last.value).slice(0, 4).sort((a, b) => y(a.last.value) - y(b.last.value));
  let lastY = -Infinity;
  const labels = ends.map(({ s, last }) => {
    const ly = Math.max(y(last.value), lastY + 13);
    lastY = ly;
    return svg("text", { x: W - m.r + 8, y: ly, class: "end-label", "dominant-baseline": "central" }, `${s.entity.name} ${yFormat(last.value)}`);
  });

  const cross = svg("line", { y1: m.t, y2: m.t + ih, class: "cross", visibility: "hidden" });
  const dots = svg("g", {});
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": label },
    ticks.map((t) => svg("g", {},
      svg("line", { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), class: t === lo ? "axis" : "grid" }),
      svg("text", { x: m.l - 8, y: y(t), class: "tick", "text-anchor": "end", "dominant-baseline": "central" }, yFormat(t)),
    )),
    dates.map((d, i) => i % labelEvery === 0 && svg("text", { x: x(d), y: H - 8, class: "tick", "text-anchor": "middle" }, fmtDay(d))),
    cross,
    series.map((s) => svg("path", { d: pathFor(s.points), stroke: s.entity.color, class: "line" })),
    dots,
    labels,
    svg("rect", {
      x: m.l, y: m.t, width: iw, height: ih, class: "hit",
      onpointermove: (ev) => {
        const box = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
        const px = ((ev.clientX - box.left) / box.width) * W;
        const i = dates.length < 2 ? 0 : Math.round(((px - m.l) / iw) * (dates.length - 1));
        const date = dates[Math.max(0, Math.min(dates.length - 1, i))];
        cross.setAttribute("x1", x(date)); cross.setAttribute("x2", x(date)); cross.setAttribute("visibility", "visible");
        const rows = series.map((s) => ({ s, p: [...s.points].reverse().find((p) => p.date <= date) }))
          .filter((r) => r.p).sort((a, b) => b.p.value - a.p.value);
        dots.replaceChildren(...rows.filter((r) => r.p.date === date || step).map((r) =>
          svg("circle", { cx: x(date), cy: y(r.p.value), r: 4.5, fill: r.s.entity.color, class: "dot" })));
        showTip(ev, fmtLong(date), rows.map((r) => [r.s.entity.color, r.s.entity.name, yFormat(r.p.value)]));
      },
      onpointerleave: () => { cross.setAttribute("visibility", "hidden"); dots.replaceChildren(); hideTip(); },
    }),
  );
  return chart;
}

function cumulativeVotes(s) {
  if (!s.totalVotes) return null;
  const dates = s.days.map((d) => d.date);
  const series = s.entities.filter((e) => e.listed > 0).map((e) => {
    let acc = 0;
    return { entity: e, points: s.days.map((d) => ({ date: d.date, value: (acc += d.counts[e.id] || 0) })) };
  });
  return section("Röster över tid", "Summan av alla röster hittills, per restaurang.",
    legend(s), lineChart({ series, dates, label: "Ackumulerade röster per restaurang" }));
}

function cumulativeWins(s) {
  if (s.counted.length < 2) return null;
  const dates = s.counted.map((d) => d.date);
  const series = s.entities.filter((e) => e.listed > 0).map((e) => {
    let acc = 0;
    return { entity: e, points: s.counted.map((d) => ({ date: d.date, value: (acc += d.winner.id === e.id ? 1 : 0) })) };
  });
  return section("Kapplöpningen", "Antal gånger varje ställe har valts, dag för dag.",
    legend(s), lineChart({ series, dates, label: "Ackumulerade vinster per restaurang", step: true }));
}

// Värmekarta: vinster per restaurang och veckodag. En nyans, ljus till mörk.
function weekdayHeatmap(s) {
  if (!s.counted.length) return null;
  const list = s.entities.filter((e) => e.listed > 0);
  const max = Math.max(1, ...list.flatMap((e) => e.weekdayWins));
  const daysPerWeekday = WEEKDAYS.map((_, i) => s.counted.filter((d) => weekdayIndex(d.date) === i).length);
  return section("Vinster per veckodag", "Mörkare ruta, fler vinster den veckodagen.",
    el("div", { class: "heat" },
      el("span", {}), WEEKDAYS.map((w, i) => el("span", { class: "heat-head" }, w, el("small", {}, ` ${daysPerWeekday[i]}`))),
      list.map((e) => [
        el("span", { class: "heat-name" }, e.name),
        e.weekdayWins.map((n, i) => el("span", {
          class: `heat-cell${n ? "" : " zero"}${n / max > 0.6 ? " dark" : ""}`,
          style: `--a:${n / max}`,
          onpointerenter: (ev) => showTip(ev, `${e.name} · ${WEEKDAYS[i].toLowerCase()}`, [[e.color, "Vinster", `${n} av ${daysPerWeekday[i]}`]]),
          onpointermove: moveTip, onpointerleave: hideTip,
        }, String(n))),
      ]),
    ));
}

function records(s) {
  const streak = [...s.entities].sort((a, b) => b.longest - a.longest)[0];
  const current = s.entities.find((e) => e.id === s.current.id);
  const bestDay = [...s.entities].filter((e) => e.bestDay).sort((a, b) => b.bestDay.votes - a.bestDay.votes)[0];
  const card = (label, value, note, color) => el("div", { class: "record", style: color ? `--c:${color}` : null },
    el("p", { class: "tile-label" }, label), el("p", { class: "record-value" }, value), note && el("p", { class: "tile-note" }, note));
  return section("Rekord och skrällar", null, el("div", { class: "records" },
    streak && streak.longest > 0 && card("Längsta svit", `${streak.name}`, `${plural(streak.longest, "dag", "dagar")} i rad`, streak.color),
    current && card("Pågående svit", current.name, plural(s.current.length, "dag", "dagar"), current.color),
    card("Skrällar", String(s.upsets.length), s.votedDays.length
      ? `av ${plural(s.votedDays.length, "dag", "dagar")} med röster vann någon som inte ledde`
      : "Räknas när folk har röstat"),
    s.luckiest && card("Största turen", s.luckiest.winner.name, `vann ${fmtLong(s.luckiest.date).toLowerCase()} med ${pct(s.luckiest.winner.share)} av rösterna`, s.luckiest.winner.color),
    s.busiest && s.busiest.total > 0 && card("Flest röster", fmtLong(s.busiest.date), plural(s.busiest.total, "röst", "röster")),
    bestDay && card("Mest röster en dag", bestDay.name, `${plural(bestDay.bestDay.votes, "röst", "röster")} ${fmtLong(bestDay.bestDay.date).toLowerCase()}`, bestDay.color),
  ));
}

function menus(s) {
  const list = s.entities.filter((e) => e.listed > 0);
  const rows = list.map((e) => {
    const share = e.listed ? e.withMenu / e.listed : 0;
    return el("li", { class: "bar-row", style: `--c:${e.color}` },
      el("span", { class: "bar-name" }, e.name),
      el("span", { class: "bar-track" }, el("span", { style: `width:${share * 100}%` })),
      el("span", { class: "bar-value" }, `${e.withMenu}/${e.listed}`),
      el("span", { class: "bar-value muted" }, e.withMenu ? `${(e.dishes / e.withMenu).toFixed(1).replace(".", ",")} rätter` : "–"),
    );
  });
  return section("Menyerna", "Hur många dagar menyn gick att hämta, och hur många rätter den hade i snitt.",
    el("ul", { class: "bars" }, rows));
}

function prices(s) {
  const withPrices = s.entities.filter((e) => e.prices.length);
  if (!withPrices.length) return null;
  const dates = [...new Set(withPrices.flatMap((e) => e.prices.map((p) => p.date)))].sort();
  const series = withPrices.map((e) => ({ entity: e, points: e.prices.map((p) => ({ date: p.date, value: p.price })) }));
  const latest = withPrices.map((e) => ({ e, p: e.prices.at(-1).price })).sort((a, b) => a.p - b.p);
  return section("Lunchpris", "Ordinarie lunchpris i kronor, som det stod på menyn.",
    el("ul", { class: "price-list" }, latest.map(({ e, p }) =>
      el("li", { style: `--c:${e.color}` }, el("span", { class: "key" }), e.name, el("strong", {}, `${p} kr`)))),
    dates.length > 1 && lineChart({ series, dates, label: "Lunchpris per restaurang", yFormat: (v) => `${v}`, yMin: "auto", step: true }));
}

function table(s) {
  const list = s.entities.filter((e) => e.listed > 0);
  return el("details", { class: "panel table-view" },
    el("summary", {}, "Visa alla siffror som tabell"),
    el("div", { class: "table-wrap" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Dag"), el("th", {}, "Hjulet valde"), list.map((e) => el("th", {}, e.name)), el("th", {}, "Totalt"))),
      el("tbody", {}, [...s.days].reverse().map((d) => el("tr", {},
        el("td", {}, fmtDay(d.date, { weekday: "short", day: "numeric", month: "short" })),
        el("td", {}, d.winner.name),
        list.map((e) => el("td", { class: "num" }, d.restaurants.some((r) => r.id === e.id) ? String(d.counts[e.id] || 0) : "–")),
        el("td", { class: "num" }, String(d.total)),
      ))),
    )));
}

function filterBar(days) {
  const empty = days.filter((d) => d.total === 0).length;
  return el("div", { class: "filters" },
    el("label", { class: "switch" },
      el("input", {
        type: "checkbox", checked: filter.includeEmpty,
        onchange: (e) => { filter.includeEmpty = e.target.checked; store.set("stats:includeEmpty", filter.includeEmpty); render(summarize(days)); },
      }),
      el("span", { class: "switch-track" }),
      "Räkna även dagar utan röster",
    ),
    el("span", { class: "filters-note" }, empty ? `${plural(empty, "dag", "dagar")} utan röster` : "Alla dagar har röster"),
  );
}

function render(s) {
  const first = s.days[0], last = s.days.at(-1);
  $("range").textContent = s.days.length
    ? `${plural(s.days.length, "dag", "dagar")} · ${fmtDay(first.date, { day: "numeric", month: "long" })} – ${fmtDay(last.date, { day: "numeric", month: "long" })}`
    : "Inga avslutade dagar än";
  $("stats").replaceChildren(...[
    DEMO && el("p", { class: "demo-banner" }, "Exempeldata – inte riktiga siffror. ", el("a", { href: "statistik.html" }, "Visa de riktiga")),
    s.days.length && filterBar(s.days),
    tiles(s),
    leaderboard(s),
    calendar(s),
    votesPerDay(s),
    cumulativeWins(s),
    cumulativeVotes(s),
    weekdayHeatmap(s),
    records(s),
    menus(s),
    prices(s),
    s.days.length && table(s),
    el("p", { class: "footnote" },
      "Röster räknas per webbläsare och dag. Vinnaren räknas fram med samma hjul som på startsidan, så den stämmer med det hjulet visade. ",
      "Dagar då ingen röstade räknas inte som vinster om du inte slår på det ovan, eftersom hjulet då valde helt slumpmässigt. ",
      "Rätterna är fritext och jämförs inte mellan dagar."),
  ].filter(Boolean));
}

async function init() {
  const main = $("stats");
  main.replaceChildren(el("p", { class: "status" }, "Hämtar statistik…"));
  try {
    const days = DEMO ? await loadDemoDays() : await loadRealDays((i, n) => {
      if (n > 3) main.replaceChildren(el("p", { class: "status" }, `Hämtar röster … ${i + 1} av ${n} dagar`));
    });
    render(summarize(days));
    // Rita om diagrammen när bredden ändras (t.ex. när telefonen vrids)
    let lastWidth = chartWidth(), timer;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (chartWidth() !== lastWidth) { lastWidth = chartWidth(); render(summarize(days)); } }, 150);
    });
  } catch (error) {
    main.replaceChildren(el("p", { class: "status error" }, "Kunde inte hämta statistiken. Ladda om sidan."));
    console.error(error);
  }
}

// Avstängd i config.js: sidan går inte att nå, man skickas till startsidan.
if (CFG.showStats) init();
else location.replace("./");
