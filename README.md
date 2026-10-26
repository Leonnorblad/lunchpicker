<div align="center">

# Lunch

**Var ska vi äta idag?**<br>
Dagens menyer från restaurangerna runt kontoret, en omröstning på förmiddagen<br>
och ett lyckohjul som bestämmer klockan halv tolv.

### [→ Öppna lunchsidan](https://leonnorblad.github.io/lunchpicker/)

<br>

<img src="screenshots/dator.png" width="840" alt="Lunchsidan på en dator: dagens menyer från sex restauranger i tre kolumner">

<sub>På datorn ligger menyerna sida vid sida</sub>

<br><br>

<img src="screenshots/rosta.png" width="260" alt="Dagens menyer, med Reimers vald och en rad längst ned för att bekräfta rösten">&nbsp;&nbsp;
<img src="screenshots/hjulet.png" width="260" alt="Lyckohjulet med restaurangerna och dagens vinnare">&nbsp;&nbsp;
<img src="screenshots/morkt.png" width="260" alt="Sabis meny i mörkt läge">

<sub>På mobilen: rösta · hjulet bestämmer · mörkt läge</sub>

</div>

<br>

## Så går en dag till

| När | Vad händer |
|---|---|
| **10.00** | Dagens menyer hämtas automatiskt från restaurangernas egna sidor: rätter, tillbehör och pris, ordagrant som de står där. |
| **Strax efter 10–11.30** | Rösta. Röstningen öppnar när menyerna är inlästa, och senast 10.30 (då med länkar till restaurangernas egna menyer om inläsningen inte blev av). Klicka på stället du vill äta på och bekräfta. Ändrar du dig går det att byta fram till 11.30. |
| **11.30** | Hjulet snurrar. Varje restaurang får en bit som är lika stor som dess andel av rösterna, så den populäraste har störst chans, men inget är avgjort i förväg. Alla ser samma hjul och samma vinnare. Har ingen röstat har alla lika stor chans. |
| **Efteråt** | Alla menyer finns kvar under hjulet, med den valda restaurangen först. |

Små ikoner efter rätterna visar vad som är fisk, fågel, vegetariskt eller veganskt. Bläddra mellan dagarna med pilarna,
och byt mellan ljust och mörkt läge med knappen uppe till vänster.

## Restaurangerna

| | Restaurang | Menyn kommer från |
|---|---|---|
| <img src="docs/logos/reimers.png" width="28"> | **Reimers** | [reimers.se](https://www.reimers.se/lunch/) |
| <img src="docs/logos/matronan.png" width="28"> | **Matronan** | [matronan.se](https://www.matronan.se/) |
| <img src="docs/logos/lilla-angel.png" width="28"> | **Lilla Ängel** | [lillaangel.com](https://www.lillaangel.com/frosunda/lunch/) |
| <img src="docs/logos/bra-mat-no8.png" width="28"> | **Bra Mat No8** | [bramat8.se](https://www.bramat8.se/lunch) |
| <img src="docs/logos/sabis.png" width="28"> | **Sabis Ulriksdal** | [sabis.se](https://www.sabis.se/restauranger-cafeer/vara-publika-restauranger/sabis-ulriksdal/) |
| | **Bruket** | [Compass Group](https://compass.mashie.matildaplatform.com/public/app/ncc+hk/b079ac04?country=se) |

Hittas ingen meny en dag står det så, med en länk till restaurangens sida. Inga rätter hittas på.

## Statistik (kommer snart)

Rösterna och hjulets val sparas varje dag, och när det har samlats lite mer kommer en statistiksida:
topplista, hjulets val dag för dag, röster över tid, vilka veckodagar som vinner och lunchpriserna.
Dagar då ingen röstade räknas inte, så statistiken visar vad vi faktiskt valde.

<div align="center">

<img src="screenshots/statistik.png" width="260" alt="Statistiksidan med nyckeltal och topplista, exempeldata">&nbsp;&nbsp;
<img src="screenshots/statistik-grafer.png" width="260" alt="Diagram över röster per dag och antal vinster över tid, exempeldata">

<sub>Förhandsvisning med påhittad exempeldata</sub>

</div>

## Bra att veta

- Varje webbläsare har en röst per dag. Rösterna är anonyma.
- Menyerna hämtas av en [Claude Code-rutin](https://code.claude.com/docs/en/routines) som körs i molnet varje vardagsmorgon.
- Sidan är statisk och ligger på GitHub Pages. Ingen inloggning och inga kakor, bara det din webbläsare själv sparar
  (din röst och om du valt mörkt läge).

---

<sub>Ska du ändra något i koden? Börja med [`CLAUDE.md`](CLAUDE.md) och underhållsguiden i
[`.claude/skills/maintain-lunch/SKILL.md`](.claude/skills/maintain-lunch/SKILL.md).</sub>
