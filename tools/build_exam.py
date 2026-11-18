#!/usr/bin/env python3
"""Build a weighted 100-question practice exam from the domain question banks.

Usage: python3 tools/build_exam.py [seed]
Writes practice/full-exam-<seed>.md (questions) and practice/full-exam-<seed>-key.md (answers).
"""
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BLUEPRINT = [
    ("01-sitework", "Sitework", 9),
    ("02-concrete", "Concrete", 14),
    ("03-masonry", "Masonry", 10),
    ("04-metals", "Metals", 13),
    ("05-carpentry", "Carpentry", 12),
    ("06-thermal-moisture", "Thermal & Moisture Protection", 10),
    ("07-doors-windows", "Doors & Windows", 5),
    ("08-finishes", "Finishes", 6),
    ("09-safety", "Safety", 12),
    ("10-general-building-code", "General Building Code", 9),
]

BLOCK_RE = re.compile(
    r"^(?P<id>\w+)\n(?P<stem>.*?)\n(?P<opts>(?:- [A-D]\) [^\n]*\n)+)\s*<details><summary>Answer</summary>\s*\*\*(?P<ans>[A-D])\*\*(?P<expl>.*?)</details>",
    re.S,
)


def parse(path):
    text = path.read_text()
    out = []
    for block in text.split("\n### ")[1:]:
        m = BLOCK_RE.match(block)
        if not m:
            continue
        expl = re.sub(r"^[\s\u2014.,-]+", "", m.group("expl").strip())
        out.append({
            "id": m.group("id"),
            "stem": " ".join(m.group("stem").split()),
            "opts": m.group("opts").rstrip("\n"),
            "ans": m.group("ans"),
            "expl": " ".join(expl.split()),
        })
    return out


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    rng = random.Random(seed)
    picked = []
    for folder, name, n in BLUEPRINT:
        bank = parse(ROOT / "domains" / folder / "README.md")
        if len(bank) < n:
            sys.exit(f"{folder}: only {len(bank)} questions, need {n}")
        for q in rng.sample(bank, n):
            q["domain"] = name
            picked.append(q)
    rng.shuffle(picked)

    # Shuffle answer choices so letter position carries no signal.
    for q in picked:
        opts = re.findall(r"- ([A-D])\) (.*)", q["opts"])
        texts = [t for _, t in opts]
        correct = texts["ABCD".index(q["ans"])]
        rng.shuffle(texts)
        q["opts"] = "\n".join(f"- {L}) {t}" for L, t in zip("ABCD", texts))
        q["ans"] = "ABCD"[texts.index(correct)]
        q["correct"] = correct

    tag = f"{seed:02d}"
    exam = [
        f"# Practice Exam {tag}: Combined B-1 / B-2 / KB-1 / KB-2",
        "",
        "100 questions · 240 minutes · 70 correct to pass · open book: OSHA 1926, 2018 IBC, 2018 IRC",
        "",
        f"Weighted to the PSI content outline. Answer key: [full-exam-{tag}-key.md](full-exam-{tag}-key.md)",
        "",
        "Start a timer. Aim for under 2.4 minutes per question, and skip long lookups and come back to them.",
        "",
    ]
    key = [
        f"# Practice Exam {tag}: Answer Key",
        "",
        "| # | Ans | Correct choice | Domain | Bank ID | Explanation / Ref |",
        "|---|---|---|---|---|---|",
    ]
    for i, q in enumerate(picked, 1):
        exam += [f"**{i}.** {q['stem']}", "", q["opts"], ""]
        key.append(f"| {i} | {q['ans']} | {q['correct'].replace('|', '/')} | {q['domain']} | {q['id']} | {q['expl'].replace('|', '/')} |")

    key += ["", "## Score by domain", "", "| Domain | Items | Your misses |", "|---|---|---|"]
    key += [f"| {name} | {n} | |" for _, name, n in BLUEPRINT]

    (ROOT / "practice" / f"full-exam-{tag}.md").write_text("\n".join(exam) + "\n")
    (ROOT / "practice" / f"full-exam-{tag}-key.md").write_text("\n".join(key) + "\n")
    print(f"Wrote practice/full-exam-{tag}.md ({len(picked)} questions)")


if __name__ == "__main__":
    main()
