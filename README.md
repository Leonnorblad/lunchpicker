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

## Ändra restauranger

Redigera `docs/data/restaurants.json`. `menu_url` ska peka på en sida som visar veckans eller dagens meny (HTML, PDF eller bild). Lämnas den tom söker Luna på webben istället. Det är dyrare och mindre pålitligt.

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
