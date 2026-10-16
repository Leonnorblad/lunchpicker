---
name: maintain-lunch
description: Hur lunchsidan är byggd och hur den underhålls. Läs ALLTID innan du ändrar kod, konfiguration, design, data eller rutinen i det här repot. Beskriver filer, konfiguration, dataformat, röster och hjulet, vanliga ändringar, test och publicering.
---

# Underhåll av lunchsidan

Läs hela filen innan du ändrar något. Allt som behövs står här, så du ska inte behöva leta.
**Ändrar du något som beskrivs här, uppdatera den här filen i samma commit.** README:n är för människor
och ska bara beskriva vad appen gör, inte hur den är byggd.

Sidan: https://leonnorblad.github.io/lunchpicker/ · Repo: `Leonnorblad/lunchpicker` · Gren: `main`

## Översikt

```
vardagar 06.10 UTC  Claude Code-rutin (molnet) ─► skill fetch-lunch-menus
                      ├─ scripts/archive_votes.py   avslutade dagars röster → docs/data/votes.json
                      ├─ scripts/page_text.py       hämtar varje menysida som text
                      ├─ Claude läser och skriver ett utkast
                      ├─ scripts/save_menu.py       kontrollerar, slår ihop, skriver docs/data/menus/<datum>.json
                      └─ git push origin HEAD:main  ─► GitHub Pages publicerar docs/ (~1 min)

webbläsaren          docs/index.html   menyer · röstning 09.00–11.30 · hjulet 11.30
                     docs/statistik.html  statistik (avstängd med showStats)
                     röster ─► Abacus-räknare (ingen server, ingen nyckel)
```

Ingen byggprocess, inga beroenden: statiska filer i `docs/`, vanlig JavaScript och Python med bara standardbiblioteket.

## Filer

| Fil | Vad den gör |
|---|---|
| `docs/index.html` | Startsidan. Laddar `config.js`, `core.js`, `app.js` i den ordningen. Litet inline-skript i `<head>` sätter sparat ljust/mörkt läge före första ritningen. |
| `docs/statistik.html` | Statistiksidan. Laddar `config.js`, `core.js`, `stats.js` och `style.css` + `stats.css`. |
| `docs/config.js` | All konfiguration för sidan, se nedan. |
| `docs/core.js` | Gemensamt: tid och faser, testläge, lagring, data, röster, arkiv, hjulet (`spinWheel`), `el()`, ljust/mörkt-knappen, `isoWeek`. |
| `docs/app.js` | Startsidan: rubrik, menykort, röstning med bekräftelse och byte, hjulet och resultatet, navigering mellan dagar. |
| `docs/stats.js` | Statistiken: laddar dagar (arkiv eller Abacus), `summarize()`, alla paneler och SVG-diagram, `?exempel`. |
| `docs/style.css` | Designtokens (`:root`), mörkt läge, sidhuvud, menykort, loggor, hjulet, bekräftelseraden, testremsan. |
| `docs/stats.css` | Bara statistiksidan. |
| `docs/data/restaurants.json` | Restaurangerna, se nedan. Ordningen styr färg och ordning på sidan. |
| `docs/data/index.json` | `{"dates": [...]}` alla dagar som har en menyfil. Skrivs av `save_menu.py`. |
| `docs/data/menus/<datum>.json` | En dags menyer. Skrivs bara av `save_menu.py`. |
| `docs/data/votes.json` | Arkiv med avslutade dagars röster. Skrivs bara av `archive_votes.py`. |
| `docs/logos/<id>.png` | Restaurangloggor, ca 128 px, kvadratiska. |
| `scripts/page_text.py` | Hämtar en URL: HTML blir text, PDF/bild sparas som fil. Skriver ut slutlig `URL:` (efter omdirigering) och menylänkar. |
| `scripts/save_menu.py` | Kontrollerar ett utkast, fyller i namn/länk från `restaurants.json`, behåller tidigare hittade menyer, skriver menyfilen och `index.json`. `--check <fil>` kontrollerar bara formatet. |
| `scripts/stamp_assets.py` | Sätter `?v=<hash av innehållet>` på CSS/JS i `docs/*.html`, så att webbläsare inte kör gammal kod. `--check` kontrollerar. |
| `scripts/archive_votes.py` | Läser Abacus för avslutade dagar som saknas i `votes.json` och sparar dem. `--dry-run` skriver inget. |
| `.claude/skills/fetch-lunch-menus/SKILL.md` | Instruktionerna rutinen följer för att hämta menyer. |
| `.claude/routines/fetch-lunch-menus.md` | Rutinens inställningar, domänlista och prompt. |
| `.claude/launch.json` | Lokala servrar för förhandsvisning (port 8000 och 8001). |
| `README.md` | För människor: vad appen är, skärmbilder, länk. Inga tekniska detaljer. |
| `screenshots/` | Bilderna i README:n. |

## Konfiguration

### `docs/config.js` (`window.LUNCH`, läses som `CFG`)

| Nyckel | Värde nu | Betydelse |
|---|---|---|
| `counterApi` | `https://abacus.jasoncameron.dev` | Räknartjänsten för röster. |
| `namespace` | `ulriksdal-lunch-3n17fuma` | Prefix för alla räknare. **Byt för att nollställa alla röster.** Arkiverade dagar i `votes.json` påverkas inte. |
| `voteOpens` | `"09:00"` | När röstningen öppnar (Stockholmstid). |
| `spinAt` | `"11:30"` | När röstningen stänger och hjulet snurrar. Läses också av `archive_votes.py`. |
| `showStats` | `false` | Statistiken av/på. Av: knappen döljs och `statistik.html` skickar till startsidan. Rösterna arkiveras ändå. |

`archive_votes.py` läser `counterApi`, `namespace` och `spinAt` ur filen med ett regex: behåll formatet `nyckel: "värde",`.

### `docs/data/restaurants.json`

```json
{ "id": "reimers", "name": "Reimers", "menu_url": "https://www.reimers.se/lunch/", "logo": "logos/reimers.png" }
```

| Fält | Krav |
|---|---|
| `id` | Krävs. Slug, ändras **aldrig**: den kopplar ihop menyer, röster (räknarnamn) och arkivet. |
| `name` | Krävs. Visas på sidan. |
| `menu_url` | Restaurangens egen menysida. Tom = Claude söker på webben (sämre). |
| `logo` | Valfri. `logos/<id>.png`. Utan logga visas initialen. |
| `link_only` | Valfri `true`: menyn hämtas inte, sidan visar "Se menyn ↗" och restaurangen finns kvar i omröstningen. För källor vars villkor inte tillåter återgivning. |

Restaurangernas källor och villkor just nu:

| id | Källa | Notering |
|---|---|---|
| `reimers` | reimers.se/lunch | Veckomeny, pris i rubriken. |
| `matronan` | matronan.se | Egen Wix-sida. Inget dagspris, "Hela veckan"-listan är fast sortiment. |
| `lilla-angel` | lillaangel.com/frosunda/lunch | "Alltid på Lilla Ängel" är fast sortiment. |
| `bra-mat-no8` | bramat8.se/lunch | Visar både denna och nästa vecka. "Från 140 kr". |
| `sabis` | sabis.se (Sabis Ulriksdal) | Pris per rätt i texten, vissa rätter dyrare. |
| `bruket` | Compass Group/Mashie | `link_only`: Compass villkor tillåter bara länkar. restaurangbruket.se går till fel företag. |

**Använd aldrig kvartersmenyn.se**: den blockerar robotar och ber att man hör av sig innan man återanvänder innehållet.

### Konstanter i koden

| Var | Konstant | Betydelse |
|---|---|---|
| `core.js` | `COLORS` | En färg per restaurang i `restaurants.json`-ordning, plats 7 (grå) för resten. Ordningen är kontrollerad för färgblindhet i ljust och mörkt läge med skillen `dataviz` (`validate_palette.js`). Byter du färger: kör valideringen igen. |
| `core.js` | `TZ` | `Europe/Stockholm`. |
| `core.js` | `SPIN_TURNS` | Varv hjulet snurrar i animationen. Påverkar inte vem som vinner. |
| `style.css` | `:root`-variablerna | Designtokens. Mörkt läge finns i **två** block (systemets mörka läge och `data-theme="dark"`), ändra båda. |
| `stats.js` | `WEEKDAYS` | Kolumnrubriker i statistiken. |
| `save_menu.py` | `DISH_KEYS`, `ROW_KEYS`, `DISH_TYPES` | Tillåtna fält i utkastet, och tillåtna värden för `type`. |
| `app.js` | `DISH_TYPES` | Ikonerna för `type`: namn och SVG-banor (24×24, linjer). Samma nycklar som i `save_menu.py`. |
| `archive_votes.py` | `PAUSE` | 0,4 s mellan anrop till Abacus. |

### Rutinen (molnet)

Inställningarna finns i `.claude/routines/fetch-lunch-menus.md` och på claude.ai/code/routines (rutin-id `trig_01U6pBgKvECQMrfUtTkoXDmw`).
Schema `10 6 * * 1-5` (UTC): 07.10 vintertid, 08.10 sommartid, alltid före 09.00. Environment med Network access = Custom;
domänlistan står i rutinfilen och måste innehålla varje restaurangs domän och `abacus.jasoncameron.dev`.
Claude GitHub App måste vara installerad på repot, annars nekas pushen. Ändras prompten: uppdatera rutinfilen och rutinen
(RemoteTrigger `update`, eller på webben).

## Dataformat

### `docs/data/menus/<datum>.json`

```json
{
  "date": "2026-10-16",
  "fetched_at": "2026-10-16T14:29:33+02:00",
  "restaurants": [
    {
      "id": "sabis", "name": "Sabis Ulriksdal", "source_url": "https://…", "found": true, "price": 144, "note": null,
      "dishes": [
        {"label": null, "name": "Köttbullar på nöt och kalv", "description": "Gräddsås, rårörda lingon", "price": 154},
        {"label": null, "name": "Citronstekt fisk", "description": "Couscous sallad", "type": "fisk"}
      ]
    },
    {"id": "bruket", "name": "Bruket", "source_url": "https://…", "found": false, "dishes": [], "price": null, "note": null, "link_only": true}
  ]
}
```

- Restaurangerna står i `restaurants.json`-ordning **vid sparandet**. Den ordningen styr hjulets tårtbitar för den dagen.
- `price` på restaurangen = ordinarie lunchpris. `price` på en rätt finns bara när den rätten kostar något annat, eller när
  sidan har pris per kategori (Matronan: Dagens kött/fisk/veg). Kortets metarad visar restaurangens pris, annars spannet av rätternas priser.
- `type` på en rätt (valfri): `kott`, `fagel`, `fisk`, `vegetarisk` eller `vegansk`. Visas som en ikon efter namnet. Oklart (flera val, efterrätt) har inget fält.
  Modellen sätter det enligt reglerna i `fetch-lunch-menus`. `label` sparas men visas inte.
- `note` visas för besökarna. Bara sådant restaurangen själv meddelar ("Stängt idag"), aldrig tekniska problem.
- Skriv **aldrig** menyfiler för hand. Gör ett utkast (formatet står överst i `save_menu.py`) och kör `save_menu.py`.
  Den flyttar också ett pris sist i beskrivningen, "(154 kr)", till rättens `price`.

### `docs/data/votes.json`

`{"days": {"2026-10-16": {"reimers": 0, "sabis": 3, …}}}`: röster netto per restaurang för avslutade dagar.
Läses **före** Abacus av både startsidan och statistiken (`loadCounts` i `core.js`).

## Röster och hjulet

- **Räknare:** `<counterApi>/hit/<namespace>/<datum>_<id>` för en röst och `<datum>_<id>_minus` när någon byter bort den.
  Netto = `max(0, röster − minus)`. Abacus kan bara räkna ned med en hemlig nyckel som skulle hamna i den publika koden,
  därför minus-räknaren. Abacus tillåter 30 anrop per 10 s per IP.
- **Röstningen:** man klickar ett kort, bekräftar i raden längst ned och kan byta fram till `spinAt`. Byte = `hit` på nya,
  sedan `hit` på gamlas `_minus`. Misslyckas minus-anropet sparas det i `owed:<datum>` och skickas nästa gång, men bara under röstningen.
- **Spärren** (en röst per webbläsare och dag) finns bara i webbläsaren. Det går att fuska, och det är medvetet godtaget.
- **Faser** (`phaseFor` i `core.js`): före `voteOpens` = `upcoming`, fram till `spinAt` = `voting`, sedan `result`. Tidigare dagar är alltid `result`.
- **Hjulet är deterministiskt:** vinnaren räknas fram i varje webbläsare med `spinWheel(datum, restauranger, röster)`
  (`hash` + `seededRandom` på datum och röster). Alla ser samma resultat utan server.
  **Ändra aldrig `hash`, `seededRandom`, `spinWheel`, seed-strängen eller tårtbitarnas ordning.** Då byter gamla dagar vinnare,
  både på startsidan och i statistiken.
- Inga röster = alla restauranger väger lika. Sådana dagar räknas inte som vinster i statistiken (filtret kan ta med dem).
- `loadCounts` sparar en avslutad dags röster i `localStorage` (`counts:<datum>`). Läs därför aldrig in röster för en dag som inte är `result`.

## Lagring i webbläsaren

| Nyckel | Innehåll |
|---|---|
| `vote:<datum>` | Restaurang-id man har röstat på (JSON-sträng). |
| `owed:<datum>` | Byten vars minus-anrop inte gick fram. |
| `counts:<datum>` | Avslutad dags röster, cache. |
| `stats:includeEmpty` | Statistikfiltret "räkna även dagar utan röster". |
| `theme` | `"light"` eller `"dark"` (rå sträng, inte JSON). Saknas = följ systemet. |

Allt går via `store` i `core.js` (utom `theme`), som är try/catch-skyddat och i testläget bara ligger i minnet.

## Vanliga ändringar

### Lägga till en restaurang
1. Lägg till en rad i `docs/data/restaurants.json` (ny unik `id`, läggs sist så att de andras färger behålls).
2. Logga: hitta loggan på restaurangens sida, beskär till kvadrat och skala till 128 px, spara som `docs/logos/<id>.png`
   (`sips -c <h> <b> --cropOffset <y> <x> in.png --out ut.png` och `sips -Z 128 ut.png --out docs/logos/<id>.png`). Lägg till `"logo"`.
3. Lägg till domänen i rutinens Allowed domains (på claude.ai och i `.claude/routines/fetch-lunch-menus.md`).
4. Kontrollera att källan får återges. Annars `link_only`.
5. Fler än sex restauranger: utöka `COLORS` och kör färgvalideringen (`dataviz`).
6. Testa med `python3 scripts/page_text.py <menu_url>` och kör skillen lokalt utan `publicera`.

### Ta bort en restaurang
Ta bort raden. Gamla menyfiler behåller den, och statistiken visar den fortfarande för gamla dagar (grå färg).

### Byta källa
Ändra `menu_url` (och domänlistan). Gamla menyfiler behåller sin gamla `source_url`, och `--check` godkänner dem ändå.

### Slå på statistiken
`showStats: true` i `docs/config.js`. Inget annat behövs. Arkivet har samlats in hela tiden.

### Ändra tider
`voteOpens`/`spinAt` i `config.js`. Ändra också rutinens schema om hämtningen inte längre hinner före `voteOpens`.

### Nollställa rösterna
Byt `namespace` i `config.js`. Arkiverade dagar ligger kvar.

### Ändra design
Tokens i `:root` i `style.css` (båda mörka blocken). Typsnitt: Cormorant Garamond (rubriker, rätter, kursiva tillbehör) och
Inter (allt annat), från Google Fonts i båda HTML-filerna. Restaurangkorten ska se likadana ut: logga i rund vit bricka med
färgad ring, namn, en metarad (pris · källa · röster), rätter centrerade med namnet stort (följt av eventuell typikon och
eget pris) och tillbehören i kursiv under. Under korten visas en teckenförklaring för dagens ikoner.
Färg betyder alltid en restaurang; därför är typikonerna i textens dämpade färg och värmekartan i en neutral skala.

Resultatet efter 11.30: vinnarens tårtbit i full färg och de andra nedtonade (`.settled`), under hjulet en rubrik med
vinnarens logga, "Dagens lunch", namnet och röster/chans, och vinnarens kort först med ram i restaurangens färg och en
fylld "Dagens val"-etikett (`.card.won`).

Layout: under 900 px är menyerna en enda lista (mobil). Från 900 px (`@media (min-width: 900px)` sist i `style.css`) ligger
de i ett rutnät med `minmax(340px, 1fr)`: två kolumner på mindre skärmar, tre på stora, max 1180 px. Dagväljaren och
bekräftelseraden är alltid högst 588 px och centrerade; ljust/mörkt- och statistikknappen sitter i sidhuvudets hörn.
Restauranger utan rätter (`link_only` eller ingen meny hittad) sorteras sist och visas på datorn som en smal rad över hela
bredden (`li.compact`) med förklaring och länk, i stället för ett tomt kort.
Testa alltid både 375 px, ca 1000 px och 1280 px.

### Lägga till en typikon
1. `save_menu.py`: lägg till värdet i `DISH_TYPES`.
2. `app.js`: lägg till i `DISH_TYPES` med `label` och `paths` (24×24, bara linjer, rundade ändar, samma stil som de andra).
   Rita ikonen stort och litet bredvid de andra innan du bestämmer dig: den ska gå att känna igen i 17 px.
3. `fetch-lunch-menus`: beskriv när värdet ska sättas under `type`.

### Lägga till ett fält i menydatan
1. `save_menu.py`: lägg till i `DISH_KEYS`/`ROW_KEYS`, `normalize_dish`/`build` och kontrollerna.
2. `app.js`: visa det (`dishList`/`cardContent`).
3. Skillen `fetch-lunch-menus`: beskriv fältet under "Fälten".
4. Gamla filer saknar fältet: koden måste klara att det saknas.

### Ändra hur menyer hämtas
Ändra `.claude/skills/fetch-lunch-menus/SKILL.md`. Rutinen läser den från `main` vid varje körning, så pusha först.
Testa med skillen lokalt (utan `publicera`) eller *Run now* på rutinen och läs loggen (RemoteTrigger `list_runs`/`get_run_log`).

## Testa

```bash
python3 -m http.server -d docs 8000     # eller preview_start "lunch" / "lunch-fresh" (port 8001) från .claude/launch.json
node --check docs/core.js && node --check docs/app.js && node --check docs/stats.js
for f in docs/data/menus/*.json; do python3 scripts/save_menu.py --check "$f"; done
python3 scripts/stamp_assets.py --check
```

| URL | Visar |
|---|---|
| `/?tid=08.59.50` | Före röstningen, öppnar efter tio sekunder. |
| `/?tid=10.00` | Röstning. Röster i testläget går till ett eget namespace per sidladdning och påverkar inte de riktiga. |
| `/?tid=11.29.40` | Rösta och se hjulet snurra kl 11.30 (räknar röster 4–12 s, snurrar 7 s). |
| `&datum=2026-10-15` | En annan dag. |
| `/#2026-10-15` | Gå till en dag. |
| `/statistik.html?exempel` | Statistiken med påhittad data (kräver `showStats: true`). |

En remsa överst visar testläget och den låtsade klockan.

- **Webbläsarcache:** `config.js` och andra filer cachas hårt. Efter ändringar: ladda om utan cache, eller använd den andra
  porten (`lunch-fresh`, 8001) för en ren cache.
- Testa både ljust och mörkt läge och en mobilbredd (375 px).
- Ändrar du `save_menu.py`: testa `build()` med ett utkast i Python (se tidigare tester: miss behåller tidigare träff,
  ingen träff alls underkänns, okända fält underkänns, `link_only` i utkastet underkänns).

## Publicera

**Ändrar du CSS eller JavaScript (även `config.js`): kör `python3 scripts/stamp_assets.py` före commit**, och
`python3 scripts/stamp_assets.py --check` ska gå igenom. GitHub Pages låter webbläsare cacha filer i tio minuter;
utan nya versionsmärken kan besökare få ny data men gammal kod (t.ex. gammal layout och etiketter i stället för ikoner).
HTML-filerna själva kan fortfarande vara cachade i upp till tio minuter, sedan hämtas allt nytt.


`git push origin main`. GitHub Pages bygger `docs/` på ungefär en minut. Kontrollera:

```bash
gh api repos/Leonnorblad/lunchpicker/pages/builds/latest --jq '{status, commit: .commit[0:7]}'
```

Rutinen pushar själv sina `Menyer <datum>`-commits till `main`. Hämta (`git pull`) innan du pushar.

## Konventioner

- Svenska i gränssnitt, kommentarer, commit-meddelanden och dokumentation.
- Inga beroenden och ingen byggprocess. Python: bara standardbiblioteket. JavaScript: vanliga skript som delar globala
  variabler; `core.js` måste laddas före `app.js`/`stats.js`.
- Bygg DOM med `el()` (och `svg()` i statistiken), aldrig `innerHTML` med data.
- Statistik visar bara exakta siffror: röster, vinnare via `spinWheel`, antal rätter, priser. Rätter jämförs aldrig mellan dagar.
  `?exempel` är den enda platsen med påhittad data, och den har en tydlig skylt.
- `docs/data/` skrivs bara av skripten.
- Håll README:n för människor; tekniska detaljer hör hemma här.
