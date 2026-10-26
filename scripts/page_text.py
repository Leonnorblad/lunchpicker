#!/usr/bin/env python3
"""Hämtar en menysida och skriver ut texten, för skillen fetch-lunch-menus.

HTML blir ren text (utan script/style). PDF och bilder sparas till en fil vars
sökväg skrivs ut, så att de kan öppnas med Read. Länkar som ser ut att leda till
menyer (pdf, lunch, meny, vecka) listas sist. Bara standardbiblioteket.

    python3 scripts/page_text.py URL [--out KATALOG]

prepare.py använder fetch() för att hämta alla restaurangers sidor.
"""

import argparse
import hashlib
import re
import sys
import tempfile
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

USER_AGENT = "Mozilla/5.0 (compatible; lunchmeny-bot/1.0)"
SKIP = {"script", "style", "noscript", "svg", "template"}
BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "td", "th"}
MENU_LINK = re.compile(r"\.pdf|lunch|meny|menu|vecka|week", re.I)


class TextParser(HTMLParser):
    def __init__(self, base: str):
        super().__init__()
        self.base, self.parts, self.links, self.skipping = base, [], [], 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skipping += 1
        if tag in BLOCK:
            self.parts.append("\n")
        for name, value in attrs:
            if value and ((tag == "a" and name == "href") or (tag in {"iframe", "embed"} and name == "src")):
                url = urljoin(self.base, value)
                if MENU_LINK.search(url) and url not in self.links:
                    self.links.append(url)

    def handle_endtag(self, tag):
        if tag in SKIP and self.skipping:
            self.skipping -= 1
        if tag in BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skipping:
            self.parts.append(data)


def fetch(url: str, out_dir: str) -> dict:
    """Hämtar url. Ger final_url, status, content_type och antingen text (HTML) eller file (PDF/bild), samt links."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        content_type = response.headers.get("content-type", "")
        body = response.read()
        final_url = response.geturl()
        status = response.status
    page = {"final_url": final_url, "status": status, "content_type": content_type, "text": None, "file": None, "links": []}

    if "pdf" in content_type or content_type.startswith("image/") or final_url.lower().endswith(".pdf"):
        suffix = ".pdf" if "pdf" in content_type or final_url.lower().endswith(".pdf") else "." + content_type.split("/")[1].split(";")[0]
        path = Path(out_dir) / f"meny-{hashlib.sha1(final_url.encode()).hexdigest()[:10]}{suffix}"
        path.write_bytes(body)
        page["file"] = str(path)
        return page

    # Teckenkodning från headern, annars från sidans <meta charset>
    header = re.search(r"charset=([\w-]+)", content_type)
    meta = re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', body[:4000], re.I)
    encoding = header.group(1) if header else meta.group(1).decode() if meta else "utf-8"
    try:
        html = body.decode(encoding, errors="replace")
    except LookupError:
        html = body.decode("utf-8", errors="replace")

    text_parser = TextParser(final_url)
    text_parser.feed(html)
    text = re.sub(r"[ \t\xa0]+", " ", "".join(text_parser.parts))
    page["text"] = re.sub(r"\n\s*\n+", "\n", text).strip()
    page["links"] = text_parser.links[:30]
    return page


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--out", default=tempfile.gettempdir(), help="var PDF/bilder sparas")
    args = parser.parse_args()

    page = fetch(args.url, args.out)
    print(f"URL: {page['final_url']}\nStatus: {page['status']}\nTyp: {page['content_type']}\n")
    if page["file"]:
        print(f"Sparad som fil, öppna med Read: {page['file']}")
        return 0
    print(page["text"])
    if len(page["text"]) < 200:
        print("\n[Väldigt lite text: sidan renderas troligen med JavaScript. Leta efter länkar nedan.]")
    if page["links"]:
        print("\nLänkar som kan leda till menyn:")
        for link in page["links"]:
            print(f"  {link}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
