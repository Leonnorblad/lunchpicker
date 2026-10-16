# Lunch i Ulriksdal

Dagens lunchmenyer, omröstning 09.00–11.30 och lyckohjul kl 11.30.

- **Menyer:** en [Claude Code-rutin](#claude-code-rutinen) körs varje vardagsmorgon. Den hämtar varje restaurangs menysida, plockar ut dagens rätter, sparar dem i `docs/data/menus/<datum>.json` och pushar till `main`.
- **Reserv:** GitHub Action *Hämta lunchmenyer* gör samma sak med OpenAI `gpt-6-luna`, men bara när den startas för hand. Varje sådan körning blir en trace i [Langfuse](https://langfuse.com) (`fetch-lunch-menus`).
- **Sida:** `docs/` publiceras med GitHub Pages.
- **Röster:** räknare hos [Abacus](https://abacus.jasoncameron.dev). Ingen databas och ingen nyckel. Hjulet räknas fram på samma sätt i varje webbläsare (utifrån datum och röster), så alla ser samma resultat.

## Kom igång

1. Skapa ett repo på GitHub och pusha projektet.
2. **Settings → Pages:** Source = *Deploy from a branch*, branch `main`, mapp `/docs`.
3. Skapa rutinen enligt [`.claude/routines/fetch-lunch-menus.md`](.claude/routines/fetch-lunch-menus.md). Claude GitHub App måste vara installerad på repot, annars nekas pushen.
4. Vill du kunna använda reserven: **Settings → Secrets and variables → Actions**, lägg till `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` och `LANGFUSE_BASE_URL`. Kör den med **Actions → Hämta lunchmenyer → Run workflow**.

## Claude Code-rutinen

Menyerna hämtas av en [Claude Code-rutin](https://code.claude.com/docs/en/routines): en Claude-session som startar i molnet varje vardagsmorgon, klonar repot, kör skillen `fetch-lunch-menus` och pushar till `main`. Claude kan prova flera vägar (undersidor, PDF, källkod, sökning) när en sida inte går att läsa direkt. Körningen dras från Claude-abonnemanget, så ingen OpenAI-nyckel behövs, men det blir inga Langfuse-traces. Varje körning syns istället som en session på claude.ai.

- **Skill:** [`.claude/skills/fetch-lunch-menus/SKILL.md`](.claude/skills/fetch-lunch-menus/SKILL.md). Går också att köra lokalt i Claude Code: `/fetch-lunch-menus` (bara spara) eller `/fetch-lunch-menus publicera`.
- **Sparande:** `scripts/save_menu.py` kontrollerar Claudes utkast, behåller tidigare hittade menyer och skriver filerna. `python3 scripts/save_menu.py --check <fil>` kontrollerar en befintlig menyfil.
- **Rutinens inställningar och prompt:** [`.claude/routines/fetch-lunch-menus.md`](.claude/routines/fetch-lunch-menus.md).
- **Köra om:** *Run now* på rutinens sida på claude.ai/code/routines. Det går att köra om samma dag: en meny som redan hittats skrivs aldrig över av en miss.

## Ändra restauranger

Redigera `docs/data/restaurants.json`. `menu_url` ska peka på en sida som visar veckans eller dagens meny (HTML, PDF eller bild). Lämnas den tom söker Claude på webben istället. Det är mindre pålitligt.

Lägg också till den nya domänen under *Allowed domains* i rutinens environment, annars kan rutinen inte nå sidan.

Sätt `"link_only": true` för ställen vars källa inte får eller kan hämtas automatiskt (t.ex. Kvartersmenyn, som blockerar servrar och ber att man hör av sig innan man återanvänder innehållet). De visas då med en länk "Se menyn ↗" och finns kvar i omröstningen.

## Lokalt

Lägg nycklarna i `.env` (samma namn som ovan). Den filen pushas aldrig.

```sh
pip install -r requirements.txt
python scripts/fetch_menus.py                    # idag
python scripts/fetch_menus.py --date 2026-10-16
python3 -m http.server -d docs 8000              # http://localhost:8000
```

## Bra att veta

- Röstspärren (en röst per dag, bara 09.00–11.30) finns i webbläsaren, inte på servern. Det räcker för kollegor, men det går att fuska.
- Abacus tillåter 30 anrop per 10 sekunder per IP-adress, och varje besök efter 11.30 läser 6 räknare. Sidan sprider ut anropen och försöker igen vid behov. Blir ni många på samma kontorsnät kan resultatet ta några sekunder att dyka upp.
- Byt `namespace` i `docs/config.js` för att nollställa alla röster.
