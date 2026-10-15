#!/usr/bin/env python3
"""Hämtar dagens lunchmenyer och sparar dem i docs/data/menus/<datum>.json.

Varje restaurang har en fast menysida (docs/data/restaurants.json). Sidan hämtas
direkt och Luna plockar ut dagens rätter. Om sidan inte går att läsa används
OpenAI:s webbsök som reserv. Alla anrop spåras i Langfuse.

    python scripts/fetch_menus.py [--date YYYY-MM-DD]

Nycklar läses från miljön eller från .env:
OPENAI_API_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
os.environ.setdefault("LANGFUSE_TRACING_ENVIRONMENT", "development")

# Langfuse måste importeras efter att miljön laddats och före OpenAI-klienten.
from langfuse import get_client, propagate_attributes  # noqa: E402
from langfuse.openai import OpenAI  # noqa: E402

import requests  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

DATA = ROOT / "docs" / "data"
TZ = ZoneInfo("Europe/Stockholm")
MODEL = os.environ.get("OPENAI_MODEL", "gpt-6-luna")
WEEKDAYS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"]
USER_AGENT = "Mozilla/5.0 (compatible; lunchmeny-bot/1.0)"
MAX_CHARS = 40_000

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["found", "dishes", "price", "note"],
    "properties": {
        "found": {"type": "boolean"},
        "dishes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["label", "name", "description"],
                "properties": {
                    "label": {"type": ["string", "null"]},
                    "name": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                },
            },
        },
        "price": {"type": ["integer", "null"]},
        "note": {"type": ["string", "null"]},
    },
}

INSTRUCTIONS = """Du extraherar lunchmenyer från restaurangers webbsidor.

Idag är {weekday} {date} (vecka {week}). Ta fram vad {name} serverar till lunch just idag.

Regler:
- Ta bara med rätter som gäller idag. Visar källan en veckomeny, ta med allt som står under {weekday}.
- Ta också med alla veckans specialrätter (t.ex. "veckans vegetariska", "veckans sallad").
- Hoppa över separata listor med fast sortiment som inte står under någon veckodag
  (t.ex. en sektion "Hela veckan" med bowls, sallader och mackor, eller à la carte).
- Hitta aldrig på rätter. Om källan uppger en annan vecka än {week}, eller om dagens
  meny inte går att hitta, sätt found=false och dishes=[].
- name: rättens namn, kort och med normal versalisering (inte VERSALER).
- description: tillbehör/beskrivning, eller null.
- label: kort kategori om källan anger en (t.ex. "Kött", "Fisk", "Veg", "Veckans sallad"), annars null.
- price: ordinarie lunchpris i kronor om det framgår, annars null.
- note: en mycket kort kommentar bara om något är avvikande (t.ex. "Lunchen stängd tills vidare"), annars null.
- Skriv på svenska."""

langfuse = get_client()


def fetch_source(url: str) -> dict | None:
    """Hämtar menysidan och gör om den till input för modellen."""
    with langfuse.start_as_current_observation(as_type="retriever", name="fetch-menu-page", input={"url": url}) as obs:
        response = requests.get(url, timeout=30, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")

        if "pdf" in content_type or url.lower().endswith(".pdf"):
            source = {"type": "input_file", "file_url": url}
        elif content_type.startswith("image/"):
            source = {"type": "input_image", "image_url": url}
        else:
            # Bytes istället för text: BeautifulSoup läser teckenkodningen från sidans <meta charset>
            soup = BeautifulSoup(response.content, "html.parser")
            for tag in soup(["script", "style", "noscript", "svg"]):
                tag.decompose()
            text = re.sub(r"\n\s*\n+", "\n", soup.get_text("\n")).strip()
            # Väldigt lite text betyder troligen en sida som renderas med JavaScript
            source = {"type": "input_text", "text": f"Innehåll från {url}:\n\n{text[:MAX_CHARS]}"} if len(text) >= 200 else None

        obs.update(
            output=source["text"] if source and source["type"] == "input_text" else source,
            metadata={"status_code": response.status_code, "content_type": content_type, "usable": source is not None},
        )
        return source


def extract_menu(client: OpenAI, restaurant: dict, day: dt.date) -> dict:
    with langfuse.start_as_current_observation(
        as_type="chain",
        name="extract-restaurant-menu",
        input={"restaurant": restaurant["name"], "menu_url": restaurant.get("menu_url"), "date": day.isoformat()},
        metadata={"restaurant_id": restaurant["id"]},
    ) as obs:
        prompt = INSTRUCTIONS.format(
            weekday=WEEKDAYS[day.weekday()],
            date=day.isoformat(),
            week=day.isocalendar().week,
            name=restaurant["name"],
        )
        url = restaurant.get("menu_url")

        source = None
        if url:
            try:
                source = fetch_source(url)
            except requests.RequestException as error:
                print(f"  kunde inte hämta {url}: {error}", file=sys.stderr)

        tools = []
        method = "page"
        if source is None:
            method = "web_search"
            tools = [{
                "type": "web_search",
                "user_location": {"type": "approximate", "country": "SE", "city": "Solna"},
            }]
            hint = f" Börja med {url}." if url else ""
            source = {
                "type": "input_text",
                "text": f"Sök upp dagens lunchmeny för {restaurant['name']} i Solna.{hint}",
            }

        response = client.responses.create(
            model=MODEL,
            reasoning={"effort": "low", "summary": "auto"},
            tools=tools,
            input=[{"role": "user", "content": [{"type": "input_text", "text": prompt}, source]}],
            text={"format": {"type": "json_schema", "name": "lunch_menu", "schema": SCHEMA, "strict": True}},
            name="extract-menu",
            metadata={"restaurant_id": restaurant["id"], "method": method},
        )
        result = json.loads(response.output_text)
        if not result["found"]:
            result["dishes"] = []

        obs.update(output=result, metadata={"restaurant_id": restaurant["id"], "method": method})
        return result


def update_index(day: dt.date) -> None:
    index_path = DATA / "index.json"
    dates = set()
    if index_path.exists():
        dates = set(json.loads(index_path.read_text())["dates"])
    dates.add(day.isoformat())
    index_path.write_text(json.dumps({"dates": sorted(dates)}, indent=2) + "\n")


def fetch_all(day: dt.date) -> int:
    client = OpenAI()
    restaurants = json.loads((DATA / "restaurants.json").read_text())

    with langfuse.start_as_current_observation(
        as_type="chain",
        name="fetch-lunch-menus",
        input={"date": day.isoformat(), "restaurants": [r["name"] for r in restaurants]},
    ) as root, propagate_attributes(
        trace_name="fetch-lunch-menus",
        tags=["lunch-menus"],
        metadata={"date": day.isoformat(), "model": MODEL},
    ):
        results = []
        for restaurant in restaurants:
            print(f"{restaurant['name']}…")
            entry = {"id": restaurant["id"], "name": restaurant["name"], "source_url": restaurant.get("menu_url") or None}
            try:
                entry |= extract_menu(client, restaurant, day)
            except Exception as error:  # En trasig källa ska inte stoppa resten
                print(f"  fel: {error}", file=sys.stderr)
                entry |= {"found": False, "dishes": [], "price": None, "note": None}
            print(f"  {len(entry['dishes'])} rätter")
            results.append(entry)

        # Körs skriptet igen samma dag ska en meny som redan hittats inte ersättas av en miss
        out_path = DATA / "menus" / f"{day.isoformat()}.json"
        previous = {}
        if out_path.exists():
            previous = {r["id"]: r for r in json.loads(out_path.read_text())["restaurants"]}
        kept = []
        for i, r in enumerate(results):
            if not r["found"] and previous.get(r["id"], {}).get("found"):
                results[i] = previous[r["id"]]
                kept.append(r["name"])

        summary = {r["name"]: [d["name"] for d in r["dishes"]] if r["found"] else (r["note"] or "ingen meny") for r in results}
        found = sum(r["found"] for r in results)
        root.update(output=summary, metadata={"found": found, "total": len(results), "kept_previous": kept})

        if not found:
            root.update(level="ERROR", status_message="Ingen meny hittades")
            print("Hittade ingen meny alls, sparar inget.", file=sys.stderr)
            return 1

    out = {
        "date": day.isoformat(),
        "fetched_at": dt.datetime.now(TZ).isoformat(timespec="seconds"),
        "restaurants": results,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    update_index(day)
    print(f"Sparade {day}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="YYYY-MM-DD, standard är idag (Stockholm)")
    args = parser.parse_args()
    day = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(TZ).date()

    if day.weekday() >= 5:
        print(f"{day} är helg, inget att hämta.")
        return 0

    try:
        return fetch_all(day)
    finally:
        langfuse.flush()  # Kortlivat skript: skicka alla traces innan vi avslutar


if __name__ == "__main__":
    sys.exit(main())
