# Lunch i Ulriksdal

Dagens lunchmenyer, omröstning 09.00–11.30 och lyckohjul kl 11.30.

- **Menyer:** GitHub Action körs vardagar 07.15 svensk tid (både sommar- och vintertid). Den hämtar varje restaurangs menysida, låter OpenAI `gpt-6-luna` plocka ut dagens rätter och sparar dem i `docs/data/menus/<datum>.json`.
- **Tracing:** varje körning blir en trace i [Langfuse](https://langfuse.com) (`fetch-lunch-menus`). Där syns sidtexten Luna fick se, svaret, tokens och kostnad per restaurang.
- **Sida:** `docs/` publiceras med GitHub Pages.
- **Röster:** räknare hos [Abacus](https://abacus.jasoncameron.dev). Ingen databas och ingen nyckel. Hjulet räknas fram på samma sätt i varje webbläsare (utifrån datum och röster), så alla ser samma resultat.

## Kom igång

1. Skapa ett repo på GitHub och pusha projektet.
2. **Settings → Secrets and variables → Actions:** lägg till `OPENAI_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` och `LANGFUSE_BASE_URL`.
3. **Settings → Pages:** Source = *Deploy from a branch*, branch `main`, mapp `/docs`.
4. **Actions → Hämta lunchmenyer → Run workflow** för att hämta dagens menyer direkt.

## Som Claude Code-rutin

Istället för GitHub Action kan menyerna hämtas av en [Claude Code-rutin](https://code.claude.com/docs/en/routines): en Claude-session som startar i molnet varje vardagsmorgon, klonar repot, kör skillen `fetch-lunch-menus` och pushar till `main`. Claude kan prova flera vägar (undersidor, PDF, källkod, sökning) när en sida inte går att läsa direkt. Körningen dras från Claude-abonnemanget, så ingen OpenAI-nyckel behövs, men det blir inga Langfuse-traces. Varje körning syns istället som en session på claude.ai.

- **Skill:** [`.claude/skills/fetch-lunch-menus/SKILL.md`](.claude/skills/fetch-lunch-menus/SKILL.md). Går också att köra lokalt i Claude Code: `/fetch-lunch-menus` (bara spara) eller `/fetch-lunch-menus publicera`.
- **Sparande:** `scripts/save_menu.py` kontrollerar Claudes utkast, behåller tidigare hittade menyer och skriver filerna. `python3 scripts/save_menu.py --check <fil>` kontrollerar en befintlig menyfil.
- **Rutinens inställningar och prompt:** [`.claude/routines/fetch-lunch-menus.md`](.claude/routines/fetch-lunch-menus.md).

Låt bara en av dem köra på schema. När rutinen fungerar: ta bort `schedule:` ur `.github/workflows/fetch-menus.yml` och behåll Action för manuell körning.

## Ändra restauranger

Redigera `docs/data/restaurants.json`. `menu_url` ska peka på en sida som visar veckans eller dagens meny (HTML, PDF eller bild). Lämnas den tom söker Luna på webben istället. Det är dyrare och mindre pålitligt.

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
