# Rutin: Hämta lunchmenyer

Inställningar för rutinen på claude.ai/code/routines (Desktop: Code → Routines → New routine → Cloud).

| Fält | Värde |
|---|---|
| Namn | Hämta lunchmenyer |
| Repo | Leonnorblad/lunchpicker (Claude GitHub App måste vara installerad för att pushen ska gå igenom, och GitHub-användaren som är kopplad till Claude-kontot måste ha skrivrätt till repot) |
| Modell | Haiku (`claude-haiku-5-5`) |
| Trigger | Schedule, cron `45 7,8 * * 1-5` (UTC). Cron räknas alltid i UTC (rutinen har ingen tidszon), så körningarna blir 08.45 och 09.45 vintertid, 09.45 och 10.45 sommartid: 9.45 är alltid en av dem. Första körningen hämtar allt, den andra kompletterar det som saknas. Inget behöver ändras vid sommartid. Röstningen öppnar när första körningens menyer har kommit (ca fem minuter efter start), och senast `voteOpens` (10.30). |
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

## Flytta rutinen till ett annat Claude-konto

Rutinen och dess environment hör till kontot och följer inte med; allt annat ligger i repot. Inga hemligheter behövs.

1. Koppla GitHub i det nya kontot. Användaren måste ha skrivrätt till `Leonnorblad/lunchpicker` (lägg till som
   collaborator om det är en annan GitHub-användare), och Claude GitHub App måste omfatta repot.
2. Skapa ett environment med Network access = Custom och domänlistan ovan.
3. Skapa rutinen med inställningarna i tabellen och prompten nedan.
4. Kör *Run now* och kontrollera att en `Menyer <datum>`-commit kommer till `main`.
5. Stäng av eller ta bort rutinen på det gamla kontot, annars körs båda.
6. Uppdatera rutin-id:t i `.claude/skills/maintain-lunch/SKILL.md` (avsnittet Rutinen).

## Prompt

Kopiera texten nedan till rutinens Instructions.

```text
Kör skillen /fetch-lunch-menus med argumentet "publicera".

Rutinen körs två gånger varje vardagsmorgon. Skripten avgör om det är första
körningen eller en komplettering och skriver ut vad du ska göra.

Ändra inga filer själv utom utkastet som prepare.py skapar, och kör inga egna
git-kommandon: save_menu.py --publicera committar och pushar. Ändra inte skillen,
skripten eller restaurants.json, även om något verkar trasigt: skriv det i
rapporten istället.

Avsluta med skillens rapport.
```
