# Lunch

Dagens lunchmenyer, omröstning 09.00–11.30 och lyckohjul kl 11.30.

- **Menyer:** en [Claude Code-rutin](#claude-code-rutinen) körs varje vardagsmorgon. Den hämtar varje restaurangs menysida, plockar ut dagens rätter, sparar dem i `docs/data/menus/<datum>.json` och pushar till `main`.
- **Sida:** `docs/` publiceras med GitHub Pages.
- **Statistik:** knappen uppe till höger öppnar `statistik.html` med topplista, hjulets val dag för dag, röster över tid och mer. `statistik.html?exempel` visar sidan med påhittad data.
- **Röster:** räknare hos [Abacus](https://abacus.jasoncameron.dev). Ingen databas och ingen nyckel. Hjulet räknas fram på samma sätt i varje webbläsare (utifrån datum och röster), så alla ser samma resultat.

## Kom igång

1. Skapa ett repo på GitHub och pusha projektet.
2. **Settings → Pages:** Source = *Deploy from a branch*, branch `main`, mapp `/docs`.
3. Skapa rutinen enligt [`.claude/routines/fetch-lunch-menus.md`](.claude/routines/fetch-lunch-menus.md). Claude GitHub App måste vara installerad på repot, annars nekas pushen.

## Claude Code-rutinen

Menyerna hämtas av en [Claude Code-rutin](https://code.claude.com/docs/en/routines): en Claude-session som startar i molnet varje vardagsmorgon, klonar repot, kör skillen `fetch-lunch-menus` och pushar till `main`. Claude kan prova flera vägar (undersidor, PDF, källkod, sökning) när en sida inte går att läsa direkt. Körningen dras från Claude-abonnemanget, så inga API-nycklar behövs. Varje körning syns som en session på claude.ai, där det går att läsa vad Claude gjorde för varje restaurang.

- **Skill:** [`.claude/skills/fetch-lunch-menus/SKILL.md`](.claude/skills/fetch-lunch-menus/SKILL.md). Går också att köra lokalt i Claude Code: `/fetch-lunch-menus` (bara spara) eller `/fetch-lunch-menus publicera`.
- **Sparande:** `scripts/save_menu.py` kontrollerar Claudes utkast, behåller tidigare hittade menyer och skriver filerna. `python3 scripts/save_menu.py --check <fil>` kontrollerar en befintlig menyfil.
- **Röstarkiv:** `scripts/archive_votes.py` sparar avslutade dagars röster i `docs/data/votes.json`. Skillen kör det varje morgon. Sidan och statistiken läser arkivet före Abacus, så gamla dagar är fasta även om `namespace` byts.
- **Rutinens inställningar och prompt:** [`.claude/routines/fetch-lunch-menus.md`](.claude/routines/fetch-lunch-menus.md).
- **Köra om:** *Run now* på rutinens sida på claude.ai/code/routines. Det går att köra om samma dag: en meny som redan hittats skrivs aldrig över av en miss.

## Ändra restauranger

Redigera `docs/data/restaurants.json`. `menu_url` ska peka på en sida som visar veckans eller dagens meny (HTML, PDF eller bild). Lämnas den tom söker Claude på webben istället. Det är mindre pålitligt.

Lägg också till den nya domänen under *Allowed domains* i rutinens environment, annars kan rutinen inte nå sidan.

Använd restaurangens egen sida när det går. Sätt `"link_only": true` för ställen vars källa inte får hämtas och visas på sidan (t.ex. Bruket, vars meny ligger hos Compass Group, som bara tillåter länkar). De visas då med en länk "Se menyn ↗" och finns kvar i omröstningen.

`"logo": "logos/<id>.png"` visar restaurangens logga i en rund bricka. Utan logga visas initialen.

## Lokalt

Skripten använder bara Pythons standardbibliotek, så inget behöver installeras.

```sh
python3 -m http.server -d docs 8000   # sidan på http://localhost:8000
```

Menyerna hämtas lokalt med `/fetch-lunch-menus` i Claude Code (sparar bara) eller `/fetch-lunch-menus publicera` (pushar också till `main`). `--date 2026-10-16` hämtar ett annat datum.

### Testa röstning och hjul

Lägg till `?tid=` för att låtsas att klockan är något annat idag. Klockan går vidare därifrån, så sidan byter läge av sig själv.

- `?tid=08.59.50`: före röstningen, som öppnar efter tio sekunder.
- `?tid=10.00`: under röstningen.
- `?tid=11.29.40`: rösta och se hjulet snurra kl 11.30.
- `&datum=2026-10-15`: en annan dag.

I testläget visas en gul etikett längst ned. Rösterna hamnar i egna räknare som är nya vid varje sidladdning, så de riktiga rösterna påverkas inte. Inget sparas i webbläsaren.

## Bra att veta

- Man väljer en restaurang och bekräftar. Fram till 11.30 går det att byta: det räknas som +1 på den nya restaurangen och +1 på den gamlas `_minus`-räknare, eftersom Abacus bara kan räkna ned med en hemlig nyckel.
- Röstspärren (en röst per webbläsare och dag, bara 09.00–11.30) finns i webbläsaren, inte på servern. Det räcker för kollegor, men det går att fuska.
- Abacus tillåter 30 anrop per 10 sekunder per IP-adress, och varje besök efter 11.30 läser två räknare per restaurang (röster och bytta röster). Sidan sprider ut anropen och försöker igen vid behov. Blir ni många på samma kontorsnät kan resultatet ta några sekunder att dyka upp.
- Byt `namespace` i `docs/config.js` för att nollställa alla röster.
