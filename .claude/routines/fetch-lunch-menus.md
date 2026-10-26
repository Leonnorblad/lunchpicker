# Rutin: Hämta lunchmenyer

Inställningar för rutinen på claude.ai/code/routines (Desktop: Code → Routines → New routine → Cloud).

| Fält | Värde |
|---|---|
| Namn | Hämta lunchmenyer |
| Repo | Leonnorblad/lunchpicker (Claude GitHub App måste vara installerad för att pushen ska gå igenom) |
| Trigger | Schedule, cron `10 6,8 * * 1-5` (UTC). Första körningen 07.10 vintertid / 08.10 sommartid, alltid före omröstningen 09.00. Omkörningen två timmar senare (09.10 / 10.10) hämtar bara det som saknas, t.ex. när en restaurang lägger upp veckans meny sent på måndagen, och är klar långt före hjulet 11.30. Inte exakt på timmen, då kan starten bli flera minuter sen. |
| Environment | Eget, med Network access = Custom (se nedan). Inga variabler, inget setup-skript. |
| Connectors | Ta bort alla. Rutinen behöver bara GitHub, som redan ingår via repot. |

**Allowed domains** (kryssa också i *Also include default list of common package managers*):

```
www.reimers.se
reimers.se
www.lillaangel.com
lillaangel.com
www.sabis.se
sabis.se
www.matronan.se
matronan.se
www.bramat8.se
bramat8.se
abacus.jasoncameron.dev
compass.mashie.matildaplatform.com
```

Lägger du till en restaurang i `docs/data/restaurants.json` måste dess domän också läggas till här. `abacus.jasoncameron.dev` behövs för att arkivera rösterna till statistiken.

## Prompt

Kopiera texten nedan till rutinens Instructions.

```text
Kör skillen /fetch-lunch-menus med argumentet "publicera".

Det betyder: hämta dagens lunchmenyer (Stockholmstid) för restaurangerna i
docs/data/restaurants.json, spara dem med scripts/save_menu.py och pusha
commiten direkt till main, inte till en claude/-gren. GitHub Pages publicerar
sidan från main.

Klart är när något av detta gäller:
- save_menu.py gick igenom och commiten "Menyer <datum>" finns på origin/main, eller
- det är helg, eller
- ingen restaurang hade någon meny, eller
- dagens menyfil fanns redan och du hittade inga nya menyer. Committa då ingenting.

Ändra inga andra filer än det save_menu.py skriver i docs/data/. Ändra inte
skillen, skripten eller restaurants.json, även om något verkar trasigt: skriv
det i rapporten istället.

Avsluta med skillens rapport.
```
