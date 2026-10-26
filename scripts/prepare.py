#!/usr/bin/env python3
"""Förbereder dagens menyhämtning åt skillen fetch-lunch-menus. Rör aldrig repot.

Avgör om det är första körningen idag eller en komplettering (dagens menyfil finns
redan), hämtar menysidorna för de restauranger som ska fyllas i och sparar varje
sidas hela text i en egen fil. Skriver också ett tomt utkast att fylla i. Sidornas
innehåll tolkas inte: det gör modellen.

    python3 scripts/prepare.py [--date YYYY-MM-DD]

Allt hamnar i <tmp>/lunch/<datum>/: en <id>.txt per restaurang, utkast.json och
status.json (hämtningens utfall, läses av save_menu.py till commit-meddelandet).
Bara standardbiblioteket.
"""

import argparse
import concurrent.futures
import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from page_text import fetch

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
TZ = ZoneInfo("Europe/Stockholm")
WEEKDAYS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"]
MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"]
WEEK_MENTION = re.compile(r"(?:\bvecka|\bweek|\bv\.?)\s*(\d{1,2})\b", re.I)


def host(url: str) -> str:
    return (urlparse(url).hostname or "").removeprefix("www.")


def fetch_restaurant(conf: dict, day: dt.date, work: Path) -> dict:
    """Hämtar en restaurangs menysida till <id>.txt. Ger status för sammanfattningen."""
    weekday = WEEKDAYS[day.weekday()]
    try:
        page = fetch(conf["menu_url"], str(work))
    except Exception as error:  # 403, host_not_allowed, timeout: oftast nätverket i miljön
        return {"fetched": False, "error": str(error)[:120]}

    text = page["text"] or ""
    status = {
        "fetched": True,
        "http": page["status"],
        "chars": len(text),
        "weekday": bool(re.search(rf"\b{weekday}\b", text, re.I)),
        "weeks": sorted({int(n) for n in WEEK_MENTION.findall(text) if 1 <= int(n) <= 53}),
        "redirect": host(page["final_url"]) if host(page["final_url"]) != host(conf["menu_url"]) else None,
        "file": page["file"],
    }
    lines = [
        f"Restaurang: {conf['name']} (id: {conf['id']})",
        f"Menysida: {conf['menu_url']}",
    ]
    if status["redirect"]:
        lines.append(f"Skickades vidare till: {page['final_url']} (annan domän: kontrollera att det är samma restaurang)")
    lines.append(f"Idag: {weekday} {day.day} {MONTHS[day.month - 1]} {day.year}, vecka {day.isocalendar().week}")
    if conf.get("notes"):
        lines.append(f"Om sidan: {conf['notes']}")
    lines.append("")
    if page["file"]:
        lines.append(f"Sidan är en PDF eller bild. Öppna den med Read: {page['file']}")
    else:
        lines += ["===== Sidans text =====", text]
        if len(text) < 200:
            lines.append("[Väldigt lite text: menyn visas troligen med JavaScript. Prova länkarna nedan.]")
    if page["links"]:
        lines += ["", "===== Länkar på sidan som kan leda till menyn ====="] + page["links"]
    (work / f"{conf['id']}.txt").write_text("\n".join(lines) + "\n")
    return status


def earlier_runs(day: dt.date) -> str:
    """Commit-meddelandet från dagens senaste körning: där står vad som saknades och varför."""
    result = subprocess.run(
        ["git", "log", "-n", "1", "--format=%B", f"--grep=^Menyer {day.isoformat()}", "HEAD"],
        cwd=ROOT, capture_output=True, text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="YYYY-MM-DD, standard är idag (Stockholm)")
    args = parser.parse_args()

    day = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(TZ).date()
    weekday = WEEKDAYS[day.weekday()]
    if day.weekday() >= 5:
        print(f"{weekday.capitalize()} {day}: helg. Inget att göra, sluta här.")
        return 0

    restaurants = json.loads((DATA / "restaurants.json").read_text())
    menu_path = DATA / "menus" / f"{day}.json"
    previous = json.loads(menu_path.read_text()) if menu_path.exists() else None
    found_before = {r["id"] for r in (previous or {}).get("restaurants", []) if r["found"]}
    todo = [r for r in restaurants if not r.get("link_only") and r["id"] not in found_before]
    mode = "komplettering" if previous else "första körningen"

    work = Path(tempfile.gettempdir()) / "lunch" / day.isoformat()
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)

    with concurrent.futures.ThreadPoolExecutor() as pool:
        statuses = dict(zip([r["id"] for r in todo], pool.map(lambda r: fetch_restaurant(r, day, work), todo)))

    draft_path = work / "utkast.json"
    draft = {"date": day.isoformat(), "restaurants": [
        {"id": r["id"], "price": None, "dishes": [], "note": None, "comment": None} for r in todo
    ]}
    draft_path.write_text(json.dumps(draft, ensure_ascii=False, indent=2) + "\n")
    (work / "status.json").write_text(json.dumps({"mode": mode, "restaurants": statuses}, ensure_ascii=False, indent=2) + "\n")

    week = day.isocalendar().week
    print(f"Idag: {weekday} {day}, vecka {week}. Läge: {mode}.")
    if previous:
        print(f"Dagens menyfil finns redan. Har meny: {', '.join(sorted(found_before)) or 'ingen'}.")
        if log := earlier_runs(day):
            print("\nSenaste körningen idag (commit-meddelande):\n" + "\n".join(f"  {line}" for line in log.splitlines()))
    if not todo:
        print("\nAlla restauranger har redan meny. Utkastet är tomt: kör ändå save_menu.py (steg 3) så att körningen loggas.")
    else:
        print(f"\n{'Restaurang':<16}{'Svar':<7}{'Tecken':>7}  {weekday:<9}{'Veckor i texten':<17}Fil")
        notes = []
        for conf in todo:
            s = statuses[conf["id"]]
            if not s["fetched"]:
                print(f"{conf['name']:<16}{'fel':<7}{'':>7}  {'':<9}{'':<17}-")
                notes.append(f"{conf['name']}: sidan gick inte att hämta ({s['error']}).")
                continue
            weeks = ", ".join(map(str, s["weeks"])) or "-"
            print(f"{conf['name']:<16}{s['http']:<7}{s['chars']:>7}  {'ja' if s['weekday'] else 'nej':<9}{weeks:<17}{work / (conf['id'] + '.txt')}")
            if s["redirect"]:
                notes.append(f"{conf['name']}: skickades vidare till {s['redirect']}.")
            if s["weeks"] and week not in s["weeks"]:
                notes.append(f"{conf['name']}: texten nämner vecka {weeks}, inte vecka {week}.")
            if s["file"]:
                notes.append(f"{conf['name']}: PDF eller bild, se filen.")
        if notes:
            print("\nObs:\n" + "\n".join(f"  {n}" for n in notes))
        print(f"\nNästa steg: läs varje fil med Read (hela filen) och fyll i utkastet {draft_path}")

    date_arg = f" --date {day}" if args.date else ""
    print(f"Spara sedan: python3 scripts/save_menu.py {draft_path}{date_arg} [--publicera]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
