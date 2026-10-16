#!/usr/bin/env python3
"""Versionsmärker CSS och JavaScript i HTML-filerna, så att webbläsaren hämtar nya filer.

GitHub Pages låter webbläsare cacha filer i tio minuter. Utan märkning kan en besökare
få ny data men gammal app.js/style.css. Skriptet sätter `?v=<hash>` på varje lokal
stilmall och skriptfil i docs/*.html, där hashen räknas fram ur filens innehåll. Ändras
filen ändras adressen. Kör det före varje commit som ändrar CSS eller JS:

    python3 scripts/stamp_assets.py          # skriver om HTML-filerna vid behov
    python3 scripts/stamp_assets.py --check  # exit 1 om något är omärkt eller inaktuellt

Bara standardbiblioteket.
"""

import argparse
import hashlib
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
# Lokala .css/.js i href/src, med eller utan en tidigare ?v=
ASSET = re.compile(r'(?P<attr>href|src)="(?P<path>[\w./-]+\.(?:css|js))(?:\?v=[0-9a-f]*)?"')


def stamp(html: str) -> str:
    def replace(m: re.Match) -> str:
        file = DOCS / m["path"]
        if not file.exists():  # Externa eller saknade filer lämnas orörda
            return m[0]
        digest = hashlib.sha1(file.read_bytes()).hexdigest()[:10]
        return f'{m["attr"]}="{m["path"]}?v={digest}"'
    return ASSET.sub(replace, html)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="ändra inget, bara kontrollera")
    args = parser.parse_args()
    stale = []
    for page in sorted(DOCS.glob("*.html")):
        old = page.read_text()
        new = stamp(old)
        if new != old:
            stale.append(page.name)
            if not args.check:
                page.write_text(new)
    if args.check:
        if stale:
            print(f"Inaktuell versionsmärkning i: {', '.join(stale)}. Kör python3 scripts/stamp_assets.py", file=sys.stderr)
            return 1
        print("Versionsmärkningen stämmer.")
        return 0
    print(f"Uppdaterade: {', '.join(stale)}" if stale else "Inget att uppdatera.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
