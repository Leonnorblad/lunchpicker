#!/usr/bin/env python3
"""Sparar avslutade dagars röster i docs/data/votes.json.

Rösterna ligger i räknare hos Abacus, två per restaurang och dag:
`<datum>_<id>` och `<datum>_<id>_minus` (bytta röster). Dagens röster är
skillnaden. När en dag är avslutad (efter hjulet kl 11.30) ändras de inte, så
skriptet hämtar varje dag en gång och sparar den. Statistiken och sidan läser
sedan arkivet istället för att fråga Abacus om varje gammal dag.

    python3 scripts/archive_votes.py [--dry-run]

Bara standardbiblioteket. Körs av skillen fetch-lunch-menus varje morgon.
"""

import argparse
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DATA = DOCS / "data"
TZ = ZoneInfo("Europe/Stockholm")
USER_AGENT = "Mozilla/5.0 (compatible; lunchmeny-bot/1.0)"
PAUSE = 0.4  # Abacus tillåter 30 anrop per 10 sekunder


def config() -> dict:
    """Läser counterApi, namespace och spinAt ur docs/config.js."""
    text = (DOCS / "config.js").read_text()
    values = dict(re.findall(r'(\w+):\s*"([^"]*)"', text))
    return {key: values[key] for key in ("counterApi", "namespace", "spinAt")}


def get_count(api: str, namespace: str, key: str) -> int:
    url = f"{api}/get/{namespace}/{key}"
    for attempt in range(6):
        time.sleep(PAUSE)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=20) as response:
                return int(json.load(response).get("value") or 0)
        except urllib.error.HTTPError as error:
            if error.code == 404:  # Ingen har röstat, räknaren finns inte
                return 0
            if error.code != 429:
                raise
        except urllib.error.URLError:
            pass
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Abacus svarade inte för {key}")


def finished_days(now: dt.datetime, spin_at: str) -> list[str]:
    """Vardagar i index.json vars hjul redan har snurrat (med två minuters marginal)."""
    dates = json.loads((DATA / "index.json").read_text())["dates"]
    hour, minute = map(int, spin_at.split(":"))
    cutoff = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + dt.timedelta(minutes=2)
    today = now.date().isoformat()
    return [
        d for d in dates
        if dt.date.fromisoformat(d).weekday() < 5 and (d < today or (d == today and now >= cutoff))
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="visa vad som skulle sparas, skriv inget")
    args = parser.parse_args()

    cfg = config()
    path = DATA / "votes.json"
    archive = json.loads(path.read_text()) if path.exists() else {"days": {}}
    missing = [d for d in finished_days(dt.datetime.now(TZ), cfg["spinAt"]) if d not in archive["days"]]
    if not missing:
        print("Alla avslutade dagar finns redan i votes.json.")
        return 0

    for day in missing:
        menu_path = DATA / "menus" / f"{day}.json"
        if not menu_path.exists():
            continue
        ids = [r["id"] for r in json.loads(menu_path.read_text())["restaurants"]]
        votes = {}
        for rid in ids:
            plus = get_count(cfg["counterApi"], cfg["namespace"], f"{day}_{rid}")
            minus = get_count(cfg["counterApi"], cfg["namespace"], f"{day}_{rid}_minus")
            votes[rid] = max(0, plus - minus)
        archive["days"][day] = votes
        print(f"{day}: {sum(votes.values())} röster {votes}")

    archive["days"] = dict(sorted(archive["days"].items()))
    if args.dry_run:
        print("(--dry-run, inget sparat)")
        return 0
    path.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + "\n")
    print(f"Sparade {path.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
