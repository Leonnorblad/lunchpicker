# Rutin: Hämta lunchmenyer

Inställningar för rutinen på claude.ai/code/routines (Desktop: Code → Routines → New routine → Cloud).

| Fält | Värde |
|---|---|
| Namn | Hämta lunchmenyer |
| Repo | Leonnorblad/lunchpicker (Claude GitHub App måste vara installerad för att pushen ska gå igenom) |
| Trigger | Schedule, cron `45 7,8 * * 1-5` (UTC). Rutinen hämtar 9.45 svensk tid året runt. Cron räknas alltid i UTC (rutinen har ingen tidszon), så den startar både 07.45 och 08.45 UTC, och prompten nedan släpper bara igenom starten som är mellan 09.30 och 10.30 i Stockholm. Den andra (8.45 vintertid, 10.45 sommartid) slutar direkt. Inget behöver ändras vid sommartid. Menyerna syns runt 09.50. Röstningen öppnar när de har kommit, och senast `voteOpens` (10.30) om körningen misslyckas. |
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
Kör först bara detta kommando:

    TZ=Europe/Stockholm date +%H%M

Rutinen startar två gånger varje vardag, 9.45 och antingen 8.45 eller 10.45 svensk tid
(cron är i UTC och följer inte sommartid). Bara starten runt 9.45 ska göra något.
Är talet mindre än 0930 eller större än 1030: svara "Inte 9.45 svensk tid, gör
ingenting." och sluta direkt, utan att läsa filer, köra skillen eller committa.

Annars: kör skillen /fetch-lunch-menus med argumentet "publicera".

Det betyder: hämta dagens lunchmenyer (Stockholmstid) för restaurangerna i
docs/data/restaurants.json, spara dem med scripts/save_menu.py och pusha
commiten direkt till main, inte till en claude/-gren. GitHub Pages publicerar
sidan från main.

Klart är när något av detta gäller:
- save_menu.py gick igenom och commiten "Menyer <datum>" finns på origin/main, eller
- det är helg, eller
- ingen restaurang hade någon meny. Committa då ingenting.

Ändra inga andra filer än det save_menu.py skriver i docs/data/. Ändra inte
skillen, skripten eller restaurants.json, även om något verkar trasigt: skriv
det i rapporten istället.

Avsluta med skillens rapport.
```
