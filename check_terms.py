#!/usr/bin/env python3
"""Check that every Chinese phrase written into the page is on the approved list.

Usage:  python3 check_terms.py [index.html]

Every run of Chinese characters in the file (split at punctuation and spaces)
must appear exactly in terms.json, either as an official HKO term or as a
general interface word. Text that the page receives from the HKO API at run
time is not in the file, so it is shown exactly as HKO publishes it.
"""
import json
import re
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
page = Path(sys.argv[1]) if len(sys.argv) > 1 else here / "index.html"
terms = json.loads((here / "terms.json").read_text(encoding="utf-8"))

allowed = set(terms["hko_terms"]["terms"]) | set(terms["hko_terms"]["icon_terms"]) | set(terms["ui_general"])
for names in terms.get("place_names", {}).values():
    if isinstance(names, list):
        allowed |= set(names)

cjk_run = re.compile(r"[㐀-䶿一-鿿豈-﫿]+")
problems = []
for lineno, line in enumerate(page.read_text(encoding="utf-8").splitlines(), 1):
    for m in cjk_run.finditer(line):
        if m.group() not in allowed:
            problems.append((lineno, m.group()))

if problems:
    print(f"FAIL: {len(problems)} phrase(s) not on the approved list:")
    for lineno, word in problems:
        print(f"  line {lineno}: {word}")
    sys.exit(1)

print(f"PASS: every Chinese phrase in {page.name} is an approved HKO term or interface word.")
