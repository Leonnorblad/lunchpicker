#!/usr/bin/env python3
"""Kontrollerar och sparar dagens menyer som skillen fetch-lunch-menus tagit fram.

Skillen skriver ett utkast med en rad per restaurang. Skriptet fyller i namn och
länk från docs/data/restaurants.json, behåller en tidigare hittad meny om utkastet
missar den, kontrollerar formatet och skriver docs/data/menus/<datum>.json och
docs/data/index.json. Bara standardbiblioteket, så det kräver ingen installation.

    python3 scripts/save_menu.py utkast.json [--date YYYY-MM-DD]
    python3 scripts/save_menu.py --check docs/data/menus/2026-10-15.json

Utkastets format (bara id och dishes krävs, fält som saknas blir null):

    {"date": "2026-10-16", "restaurants": [
      {"id": "reimers", "price": 145,
       "dishes": [{"name": "Pumpasoppa", "type": "vegetarisk"},
                  {"name": "Köttbullar", "description": "Gräddsås och lingon", "price": 154}]},
      {"id": "bruket", "dishes": [], "note": "Stängt idag"}
    ]}

found räknas fram ur dishes om det saknas. price på restaurangen är ordinarie
lunchpris, price på en rätt bara när den rätten kostar något annat.

Restauranger med "link_only" i restaurants.json fylls i automatiskt och ska inte vara med.
Exit 0 = sparat, 1 = utkastet underkänt (inget skrivs).
"""

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
TZ = ZoneInfo("Europe/Stockholm")


class Invalid(Exception):
    pass


DISH_KEYS = {"label", "name", "description", "price", "type"}
DISH_TYPES = {"fisk", "fagel", "vegetarisk", "vegansk"}  # Visas som ikoner. Kött och oklart: inget fält.
ROW_KEYS = {"id", "found", "dishes", "price", "note"}


def check_price(price, where: str) -> None:
    if price is not None and (type(price) is not int or not 30 <= price <= 500):
        raise Invalid(f"{where}: price ska vara ett heltal i kronor (30–500) eller null, fick {price!r}")


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
        raise Invalid("ingen restaurang har found=true")


def build(draft: dict, day: dt.date, restaurants: list[dict], previous: dict | None) -> tuple[dict, list[str]]:
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
    results, kept = [], []
    for conf in restaurants:
        entry = {"id": conf["id"], "name": conf["name"], "source_url": conf.get("menu_url") or None}
        if conf.get("link_only"):
            if conf["id"] in by_id:
                raise Invalid(f"{conf['id']} är link_only och ska inte hämtas")
            results.append(entry | {"found": False, "dishes": [], "price": None, "note": None, "link_only": True})
            continue
        if conf["id"] not in by_id:
            raise Invalid(f"{conf['id']} saknas i utkastet")
        row = by_id[conf["id"]]
        if extra := set(row) - ROW_KEYS:
            raise Invalid(f"{conf['id']}: okända fält {sorted(extra)}")
        dishes = row.get("dishes")
        if not isinstance(dishes, list):
            raise Invalid(f"{conf['id']}: dishes ska vara en lista (tom om ingen meny hittades)")
        dishes = [normalize_dish(d, f"{conf['id']} rätt {i + 1}") for i, d in enumerate(dishes)]
        row = {"found": row.get("found", bool(dishes)), "dishes": dishes, "price": row.get("price"), "note": row.get("note")}
        check_result(row, conf["id"])
        # Körs skillen igen samma dag ska en meny som redan hittats inte ersättas av en miss
        if not row["found"] and prev.get(conf["id"], {}).get("found"):
            results.append(prev[conf["id"]])
            kept.append(conf["name"])
            continue
        results.append(entry | row)

    menu = {
        "date": day.isoformat(),
        "fetched_at": dt.datetime.now(TZ).isoformat(timespec="seconds"),
        "restaurants": results,
    }
    check_menu(menu)
    return menu, kept


def update_index(day: dt.date) -> None:
    index_path = DATA / "index.json"
    dates = set(json.loads(index_path.read_text())["dates"]) if index_path.exists() else set()
    dates.add(day.isoformat())
    index_path.write_text(json.dumps({"dates": sorted(dates)}, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("draft", nargs="?", help="utkastet från skillen")
    parser.add_argument("--date", help="YYYY-MM-DD, standard är idag (Stockholm)")
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
        out_path = DATA / "menus" / f"{day.isoformat()}.json"
        previous = json.loads(out_path.read_text()) if out_path.exists() else None
        menu, kept = build(json.loads(Path(args.draft).read_text()), day, restaurants, previous)
    except (Invalid, ValueError, KeyError, TypeError, AttributeError) as error:
        print(f"Underkänt, inget sparat: {error}", file=sys.stderr)
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(menu, ensure_ascii=False, indent=2) + "\n")
    update_index(day)

    for r in menu["restaurants"]:
        status = "bara länk" if r.get("link_only") else f"{len(r['dishes'])} rätter" if r["found"] else (r["note"] or "ingen meny")
        print(f"  {r['name']}: {status}{' (behöll tidigare)' if r['name'] in kept else ''}")
    print(f"Sparade {out_path.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
