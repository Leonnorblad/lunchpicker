#!/usr/bin/env python3
"""Kontrollerar, sparar och publicerar dagens menyer som skillen fetch-lunch-menus tagit fram.

Modellen fyller i utkastet som prepare.py skapar. Skriptet fyller i namn och länk
från docs/data/restaurants.json, rättar mellanslag och skiljetecken, behåller
menyer som redan hittats idag, kontrollerar formatet och skriver
docs/data/menus/<datum>.json och docs/data/index.json. Bara standardbiblioteket.

    python3 scripts/save_menu.py utkast.json [--date YYYY-MM-DD] [--publicera]
    python3 scripts/save_menu.py --check docs/data/menus/2026-10-15.json

Utkastets format (bara id och dishes krävs, fält som saknas blir null):

    {"date": "2026-10-16", "restaurants": [
      {"id": "reimers", "price": 145,
       "dishes": [{"name": "Pumpasoppa", "type": "vegetarisk"},
                  {"name": "Köttbullar", "description": "Gräddsås och lingon", "price": 154}]},
      {"id": "bruket", "dishes": [], "comment": "Sidan visar bara öppettider"}
    ]}

found räknas fram ur dishes. price på restaurangen är ordinarie lunchpris, price på
en rätt bara när den rätten kostar något annat. note visas för besökarna. comment
är modellens kommentar till loggen (varför ingen meny hittades, vad som var osäkert)
och hamnar bara i commit-meddelandet.

En restaurang som saknas i utkastet behålls om den redan har meny i dagens fil
(komplettering), annars underkänns utkastet. Restauranger med "link_only" fylls i
automatiskt och ska inte vara med.

--publicera: utgår från senaste main, arkiverar avslutade dagars röster
(archive_votes.py), sparar, committar docs/data och pushar till main. Commit-
meddelandet är körningens logg och skrivs varje gång, även när inget ändrats.

Exit 0 = klart, 1 = underkänt eller publiceringen misslyckades (läs meddelandet).
"""

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
TZ = ZoneInfo("Europe/Stockholm")


class Invalid(Exception):
    pass


class NoMenus(Invalid):
    """Ingen restaurang har någon meny. Inget sparas, men med --publicera loggas körningen."""


class PublishError(Exception):
    pass


DISH_KEYS = {"label", "name", "description", "price", "type"}
DISH_TYPES = {"kott", "fagel", "fisk", "vegetarisk", "vegansk"}  # Visas som ikoner. Oklart: inget fält.
ROW_KEYS = {"id", "found", "dishes", "price", "note", "comment"}


def check_price(price, where: str) -> None:
    if price is not None and (type(price) is not int or not 30 <= price <= 500):
        raise Invalid(f"{where}: price ska vara ett heltal i kronor (30–500) eller null, fick {price!r}")


def tidy(text: str) -> str:
    """Mekaniska rättningar: "ricotta , spenat" -> "ricotta, spenat", "mozzarella& tomat" -> "mozzarella & tomat"."""
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = re.sub(r"\s*&\s*", " & ", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def tidy_description(text: str) -> str | None:
    """Tillbehör: utan inledande "Serveras med"/"Med" och avslutande punkt, med versal först."""
    text = re.sub(r"^(?:serveras med|med)\s+", "", tidy(text), flags=re.I).rstrip(". ")
    return text[:1].upper() + text[1:] if text else None


def normalize_dish(dish, where: str) -> dict:
    """Utkastets rätt i filens format: label, name, description alltid, price bara om den finns."""
    if not isinstance(dish, dict):
        raise Invalid(f"{where}: en rätt ska vara ett objekt")
    if extra := set(dish) - DISH_KEYS:
        raise Invalid(f"{where}: okända fält {sorted(extra)}")
    out = {"label": dish.get("label"), "name": dish.get("name"), "description": dish.get("description")}
    price = dish.get("price")
    # Ett pris sist i beskrivningen, "Gräddsås och lingon (154 kr)", flyttas till rättens prisfält
    if price is None and isinstance(out["description"], str):
        if m := re.search(r"\s*\(?(\d{2,3})\s*(?:kr|:-)\)?\s*$", out["description"]):
            price = int(m.group(1))
            out["description"] = out["description"][:m.start()].strip(" ,") or None
    if isinstance(out["name"], str):
        out["name"] = tidy(out["name"])
    if isinstance(out["description"], str):
        out["description"] = tidy_description(out["description"])
    if price is not None:
        out["price"] = price
    if dish.get("type") is not None:
        out["type"] = dish["type"]
    return out


def check_dish(dish, where: str) -> None:
    if not isinstance(dish, dict) or not {"label", "name", "description"} <= set(dish) <= DISH_KEYS:
        raise Invalid(f"{where}: en rätt ska ha label, name och description (och kan ha price)")
    if not isinstance(dish["name"], str) or not dish["name"].strip():
        raise Invalid(f"{where}: name saknas")
    if dish["name"].isupper() and len(dish["name"]) > 3:
        raise Invalid(f"{where}: name är skrivet i VERSALER: {dish['name']!r}")
    for key in ("label", "description"):
        if dish[key] is not None and (not isinstance(dish[key], str) or not dish[key].strip()):
            raise Invalid(f"{where}: {key} ska vara text eller null")
    check_price(dish.get("price"), where)
    if "type" in dish and dish["type"] not in DISH_TYPES:
        raise Invalid(f"{where}: type ska vara en av {sorted(DISH_TYPES)} eller utelämnas, fick {dish['type']!r}")


def check_result(r: dict, where: str) -> None:
    """Gemensamt för utkast och färdig fil: found, dishes, price, note."""
    if not isinstance(r.get("found"), bool):
        raise Invalid(f"{where}: found ska vara true/false")
    if not isinstance(r.get("dishes"), list):
        raise Invalid(f"{where}: dishes ska vara en lista")
    if r["found"] and not r["dishes"]:
        raise Invalid(f"{where}: found=true men inga rätter")
    if not r["found"] and r["dishes"]:
        raise Invalid(f"{where}: found=false men har rätter")
    for i, dish in enumerate(r["dishes"]):
        check_dish(dish, f"{where} rätt {i + 1}")
    check_price(r.get("price"), where)
    note = r.get("note")
    if note is not None and (not isinstance(note, str) or not note.strip()):
        raise Invalid(f"{where}: note ska vara text eller null")


def check_menu(menu: dict) -> None:
    """Kontrollerar en färdig menyfil, samma format som sidan läser.

    Bara formatet: gamla filer ska fortsätta gå igenom när en restaurang byter
    adress eller en ny läggs till i restaurants.json.
    """
    if set(menu) != {"date", "fetched_at", "restaurants"}:
        raise Invalid("menyfilen ska ha exakt date, fetched_at och restaurants")
    dt.date.fromisoformat(menu["date"])
    dt.datetime.fromisoformat(menu["fetched_at"])
    ids = [r.get("id") for r in menu["restaurants"]]
    if len(set(ids)) != len(ids) or not all(isinstance(i, str) and i for i in ids):
        raise Invalid(f"restaurangernas id saknas eller finns flera gånger: {ids}")
    for r in menu["restaurants"]:
        if not isinstance(r.get("name"), str) or not r["name"].strip():
            raise Invalid(f"{r['id']}: name saknas")
        check_result(r, r["id"])
        if r.get("link_only") and r["found"]:
            raise Invalid(f"{r['id']}: link_only ska inte ha rätter")
    if not any(r["found"] for r in menu["restaurants"]):
        raise NoMenus("ingen restaurang har found=true")


def build(draft: dict, day: dt.date, restaurants: list[dict], previous: dict | None) -> tuple[dict, dict]:
    """Dagens menyfil ur utkastet och dagens tidigare fil. Skriver inget.

    Ger också utfallet per restaurang: status ny/behöll/ingen/länk, antal rätter och modellens kommentar.
    """
    if draft.get("date") != day.isoformat():
        raise Invalid(f"utkastet gäller {draft.get('date')!r}, inte {day}")
    rows = draft.get("restaurants")
    if not isinstance(rows, list):
        raise Invalid("utkastet saknar restaurants-listan")
    by_id = {}
    for row in rows:
        rid = row.get("id") if isinstance(row, dict) else None
        if rid in by_id:
            raise Invalid(f"{rid} finns två gånger")
        by_id[rid] = row

    known = {r["id"] for r in restaurants}
    if unknown := set(by_id) - known:
        raise Invalid(f"okända id: {sorted(unknown)}")

    prev = {r["id"]: r for r in (previous or {}).get("restaurants", [])}
    results, outcome = [], {}
    for conf in restaurants:
        rid = conf["id"]
        entry = {"id": rid, "name": conf["name"], "source_url": conf.get("menu_url") or None}
        before = prev.get(rid, {})
        if conf.get("link_only"):
            if rid in by_id:
                raise Invalid(f"{rid} är link_only och ska inte hämtas")
            results.append(entry | {"found": False, "dishes": [], "price": None, "note": None, "link_only": True})
            outcome[rid] = {"status": "länk"}
            continue
        if rid not in by_id:
            # En komplettering tar bara med det som saknades: resten står kvar från dagens fil
            if not before.get("found"):
                raise Invalid(f"{rid} saknas i utkastet")
            results.append(before)
            outcome[rid] = {"status": "behöll", "dishes": len(before["dishes"])}
            continue
        row = by_id[rid]
        if extra := set(row) - ROW_KEYS:
            raise Invalid(f"{rid}: okända fält {sorted(extra)}")
        comment = row.get("comment")
        if comment is not None and (not isinstance(comment, str) or not comment.strip()):
            raise Invalid(f"{rid}: comment ska vara text eller null")
        dishes = row.get("dishes")
        if not isinstance(dishes, list):
            raise Invalid(f"{rid}: dishes ska vara en lista (tom om ingen meny hittades)")
        dishes = [normalize_dish(d, f"{rid} rätt {i + 1}") for i, d in enumerate(dishes)]
        row = {"found": row.get("found", bool(dishes)), "dishes": dishes, "price": row.get("price"), "note": row.get("note")}
        check_result(row, rid)
        # Körs skillen igen samma dag ska en meny som redan hittats inte ersättas av en miss
        if not row["found"] and before.get("found"):
            results.append(before)
            outcome[rid] = {"status": "behöll", "dishes": len(before["dishes"]), "comment": comment}
            continue
        results.append(entry | row)
        outcome[rid] = {"status": "ny" if row["found"] else "ingen", "dishes": len(dishes), "comment": comment}

    menu = {
        "date": day.isoformat(),
        "fetched_at": dt.datetime.now(TZ).isoformat(timespec="seconds"),
        "restaurants": results,
    }
    return menu, outcome


def update_index(day: dt.date) -> None:
    index_path = DATA / "index.json"
    dates = set(json.loads(index_path.read_text())["dates"]) if index_path.exists() else set()
    dates.add(day.isoformat())
    index_path.write_text(json.dumps({"dates": sorted(dates)}, indent=2) + "\n")


def menu_path(day: dt.date) -> Path:
    return DATA / "menus" / f"{day.isoformat()}.json"


def previous_menu(day: dt.date) -> dict | None:
    return json.loads(menu_path(day).read_text()) if menu_path(day).exists() else None


def save(draft: dict, day: dt.date, restaurants: list[dict]) -> tuple[str, dict, str]:
    """Bygger, kontrollerar och skriver dagens fil. Ger (vad som hände, utfallet, läge).

    Ingen meny alls ger NoMenus. Är menyn densamma som förut skrivs inget.
    """
    out_path = menu_path(day)
    previous = previous_menu(day)
    mode = "komplettering" if previous else "första körningen"
    menu, outcome = build(draft, day, restaurants, previous)
    try:
        check_menu(menu)
    except NoMenus as error:
        error.outcome, error.mode = outcome, mode
        raise
    if previous and menu["restaurants"] == previous["restaurants"]:
        return "oförändrad", outcome, mode
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(menu, ensure_ascii=False, indent=2) + "\n")
    update_index(day)
    return "sparad", outcome, mode


def report(restaurants: list[dict], outcome: dict, fetches: dict) -> list[str]:
    """En rad per restaurang, samma i utskriften och i commit-meddelandet."""
    lines = []
    for conf in restaurants:
        o = outcome[conf["id"]]
        dishes = f"{o.get('dishes')} {'rätt' if o.get('dishes') == 1 else 'rätter'}"
        text = {
            "länk": "bara länk",
            "behöll": f"{dishes} (från tidigare körning)",
            "ny": dishes,
            "ingen": "ingen meny",
        }[o["status"]]
        fetch = fetches.get(conf["id"])
        if fetch and not fetch.get("fetched"):
            text += f" (sidan gick inte att hämta: {fetch['error']})"
        if o.get("comment"):
            text += f" – {o['comment'].strip()}"
        lines.append(f"{conf['name']}: {text}")
    return lines


# ---------- Publicering ----------

def git(*args: str, stdin: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(["git", *args], cwd=ROOT, input=stdin, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise PublishError(f"git {' '.join(args)}: {(result.stderr or result.stdout).strip()}")
    return result


def sync_main() -> None:
    """Utgå från senaste main. Andra ändringar än i docs/data stoppar publiceringen, så att inget annat följer med.

    docs/data skrivs bara av skripten och skapas om här, så osparade ändringar där kastas.
    """
    dirty = [line[3:] for line in git("status", "--porcelain").stdout.splitlines()]
    if other := [path for path in dirty if not path.startswith("docs/data/")]:
        raise PublishError("andra filer än docs/data är ändrade, publicerar inte: " + ", ".join(other))
    if dirty:
        git("checkout", "--", "docs/data")
        git("clean", "-fdq", "docs/data")
    git("fetch", "-q", "origin", "main")
    if git("branch", "--show-current").stdout.strip() != "main":
        git("switch", "-q", "main")
    git("merge", "-q", "--ff-only", "origin/main")


def archive_votes() -> str:
    try:
        result = subprocess.run([sys.executable, str(ROOT / "scripts" / "archive_votes.py")],
                                cwd=ROOT, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        return "arkiveringen tog för lång tid, nästa körning försöker igen"
    if result.returncode != 0:
        last = (result.stderr.strip().splitlines() or ["okänt fel"])[-1][:120]
        return f"arkiveringen misslyckades ({last}), nästa körning försöker igen"
    days = re.findall(r"^(\d{4}-\d{2}-\d{2}): (\d+) röster", result.stdout, re.M)
    return ", ".join(f"arkiverade {d} ({n} röster)" for d, n in days) or "inget nytt att arkivera"


def publish(draft: dict, day: dt.date, restaurants: list[dict], fetches: dict) -> tuple[str, list[str]]:
    """Sparar och publicerar. Commit-meddelandet är körningens logg. Ger (commit, meddelandets rader)."""
    sync_main()
    build(draft, day, restaurants, previous_menu(day))  # Ett underkänt utkast stoppar här, innan något skrivs
    for _ in range(3):
        votes = archive_votes()
        try:
            result, outcome, mode = save(draft, day, restaurants)
            subject = f"Menyer {day}" + (", komplettering" if mode == "komplettering" else "")
            if result == "oförändrad":
                subject += ": inget nytt"
        except NoMenus as error:
            outcome, subject = error.outcome, f"Menyer {day}: ingen meny hittades"
        lines = [subject, ""] + report(restaurants, outcome, fetches) + ["", f"Röster: {votes}"]
        git("add", "docs/data")
        git("commit", "-q", "--allow-empty", "-F", "-", stdin="\n".join(lines) + "\n")
        if git("push", "-q", "origin", "main", check=False).returncode == 0:
            return git("rev-parse", "--short", "HEAD").stdout.strip(), lines
        # Någon annan hann pusha: börja om ovanpå deras version (save_menu slår ihop med dagens fil)
        git("fetch", "-q", "origin", "main")
        git("reset", "-q", "--hard", "origin/main")
    raise PublishError("pushen avvisades tre gånger")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("draft", nargs="?", help="utkastet från prepare.py, ifyllt")
    parser.add_argument("--date", help="YYYY-MM-DD, standard är idag (Stockholm)")
    parser.add_argument("--publicera", action="store_true", help="committa och pusha till main, med loggen i commit-meddelandet")
    parser.add_argument("--check", metavar="FIL", help="kontrollera bara en färdig menyfil")
    args = parser.parse_args()
    restaurants = json.loads((DATA / "restaurants.json").read_text())

    try:
        if args.check:
            check_menu(json.loads(Path(args.check).read_text()))
            print(f"OK: {args.check}")
            return 0
        if not args.draft:
            parser.error("ange utkastet eller --check")
        day = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(TZ).date()
        if day.weekday() >= 5:
            raise Invalid(f"{day} är helg")
        draft = json.loads(Path(args.draft).read_text())
        status_path = Path(args.draft).parent / "status.json"
        fetches = json.loads(status_path.read_text())["restaurants"] if status_path.exists() else {}

        if args.publicera:
            commit, lines = publish(draft, day, restaurants, fetches)
            print(f"Publicerat på main: {commit}\n")
            print("\n".join(lines))
            print("\nKlart. Avsluta med rapporten: raderna ovan och det som var osäkert.")
            return 0

        result, outcome, _ = save(draft, day, restaurants)
    except NoMenus as error:
        if outcome := getattr(error, "outcome", None):
            print("\n".join(report(restaurants, outcome, fetches)))
        print("\nIngen restaurang hade meny. Inget sparat (med --publicera loggas körningen ändå).")
        return 1
    except PublishError as error:
        print(f"Publiceringen misslyckades: {error}", file=sys.stderr)
        return 1
    except (Invalid, ValueError, KeyError, TypeError, AttributeError) as error:
        print(f"Underkänt, inget sparat: {error}\nRätta utkastet och kör igen.", file=sys.stderr)
        return 1

    print("\n".join(report(restaurants, outcome, fetches)))
    print(f"\n{'Sparade' if result == 'sparad' else 'Oförändrad:'} docs/data/menus/{day}.json. Inte publicerat (det gör --publicera).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
