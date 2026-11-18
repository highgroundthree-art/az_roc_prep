#!/usr/bin/env python3
"""Build assets/data.js for the study site from the markdown source files.

Reads  domains/*/README.md (study notes + question banks) and docs/*.md
Writes assets/data.js  (window.DATA = {...})

Run after editing any domain file or doc:  python3 tools/build_site.py
Requires:  pip install markdown
"""
import json
import re
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_exam import BLUEPRINT, parse  # noqa: E402

IN_ROOM = {"06-thermal-moisture", "07-doors-windows", "08-finishes", "09-safety", "10-general-building-code"}

BLURB = {
    "01-sitework": "Soil types, sloping and benching, trench protection, pipe bedding and grading.",
    "02-concrete": "Cement types, water-cement ratio, testing, curing, joints and rebar. The biggest domain.",
    "03-masonry": "Mortar types, CMU, grout, reinforcement and weather limits.",
    "04-metals": "Steel joists, bridging, erection rules and OSHA Subpart R.",
    "05-carpentry": "Framing, spans, headers, sheathing and fasteners.",
    "06-thermal-moisture": "Roofing, flashing, insulation, vapor control and the building envelope.",
    "07-doors-windows": "Egress, safety glazing, flashing and fall protection at openings.",
    "08-finishes": "Gypsum board, plaster, flooring and interior finishes.",
    "09-safety": "OSHA 1926 numbers you must be able to find fast.",
    "10-general-building-code": "IBC and IRC tab maps, occupancy, construction types and egress.",
}


LIST_RE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s")


def prep(text):
    """Python-Markdown needs a blank line before tables and lists; the source files often omit it."""
    out, prev = [], ""
    for line in text.splitlines():
        is_tbl, is_list = line.lstrip().startswith("|"), bool(LIST_RE.match(line))
        prev_tbl, prev_list = prev.lstrip().startswith("|"), bool(LIST_RE.match(prev))
        if prev.strip() and ((is_tbl and not prev_tbl) or (is_list and not prev_list and not prev.startswith((" ", "\t")))):
            out.append("")
        out.append(line)
        prev = line
    return "\n".join(out)


def md(text):
    text = prep(text)
    html = markdown.markdown(text, extensions=["tables", "sane_lists"])
    html = html.replace("<table>", '<div class="tbl"><table>').replace("</table>", "</table></div>")
    return html


LINK_MAP = [
    (re.compile(r'href="(?:\.\./)?(?:domains/)?(\d\d-[\w-]+)/README\.md[^"]*"'), r'href="#/study/\1"'),
    (re.compile(r'href="(?:\.\./)?practice/full-exam-\d+(?:-key)?\.md"'), 'href="#/exam"'),
    (re.compile(r'href="(?:\.\./)?practice/missed-log\.md"'), 'href="#/missed"'),
    (re.compile(r'href="(?:\.\./)?(?:docs/)?00-official-sources\.md[^"]*"'), 'href="#/resources"'),
]


def fix_links(html):
    for rx, rep in LINK_MAP:
        html = rx.sub(rep, html)
    html = re.sub(r'<a href="(https?://[^"]+)"', r'<a target="_blank" rel="noopener" href="\1"', html)
    return html


def clean(s):
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    return s.replace("`", "").strip()


def build():
    domains, questions = [], []
    for folder, name, items in BLUEPRINT:
        text = (ROOT / "domains" / folder / "README.md").read_text()
        study = text.split("\n## Practice questions")[0]
        lines = study.splitlines()
        body = "\n".join(lines[1:]).strip()  # drop H1
        # first paragraph = reference note
        first, _, rest = body.partition("\n\n")
        bank = parse(ROOT / "domains" / folder / "README.md")
        for q in bank:
            opts = [t for _, t in re.findall(r"- ([A-D])\) (.*)", q["opts"])]
            expl, _, ref = q["expl"].partition("*Ref:*")
            questions.append({
                "id": q["id"],
                "d": folder,
                "q": clean(q["stem"]),
                "o": [clean(o) for o in opts],
                "a": "ABCD".index(q["ans"]),
                "e": clean(expl).rstrip(" ."),
                "r": clean(ref),
            })
        domains.append({
            "id": folder,
            "n": int(folder[:2]),
            "name": name,
            "items": items,
            "books": "in-room" if folder in IN_ROOM else "study-only",
            "blurb": BLURB[folder],
            "ref": fix_links(md(first)),
            "html": fix_links(md(rest)),
            "qcount": len(bank),
        })

    def doc(path, drop_h1=True):
        t = (ROOT / path).read_text()
        if drop_h1:
            t = "\n".join(t.splitlines()[1:])
        return fix_links(md(t.strip()))

    data = {
        "exam": {"date": "2026-11-20", "questions": 100, "minutes": 240, "pass": 70},
        "domains": domains,
        "questions": questions,
        "docs": {
            "plan": doc("docs/04-study-plan.md"),
            "sources": doc("docs/00-official-sources.md"),
            "refs": doc("docs/02-references.md"),
            "practice": doc("docs/03-practice-exams.md"),
            "outline": doc("docs/01-content-outline.md"),
        },
    }
    out = ROOT / "assets" / "data.js"
    out.parent.mkdir(exist_ok=True)
    out.write_text("window.DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"wrote {out.relative_to(ROOT)}: {len(domains)} domains, {len(questions)} questions, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    build()
