# AZ ROC Prep — KB-2 Dual Residential & Small Commercial

Study system for the Arizona Registrar of Contractors (AZ ROC) license exams for the **KB-2 Dual Residential and Small Commercial** classification.

## Live site

**https://highgroundthree-art.github.io/az_roc_prep/** — study guide for all ten domains, search, domain quizzes, a timed 100-question practice exam weighted like the real test, a review list of missed questions, and the 3-day plan. Progress is saved in the browser (nothing is sent anywhere).

To publish: GitHub → Settings → Pages → Deploy from a branch → `main` / `(root)`.

After editing any domain file or doc, rebuild the site data: `pip install markdown && python3 tools/build_site.py`, then commit `assets/data.js`.

## Start here

1. **Check for an exam waiver first.** A former qualifying party in the same classification within 5 years gets the exam waived (A.R.S. § 32-1122(F)). See [docs/00-official-sources.md](docs/00-official-sources.md#exam-waiver-check-this-first).
2. **Study by domain.** Each folder below has key concepts, where to find answers in the books, and practice questions with hidden answers.
3. **Take a timed exam.** [Practice Exam 01](practice/full-exam-01.md) · [Practice Exam 02](practice/full-exam-02.md). Each has 100 questions weighted like the real test. Log your misses in [practice/missed-log.md](practice/missed-log.md).

## Domains (weighted by exam items)

| Domain | Items | Study file | Main reference |
|---|---|---|---|
| Concrete | 14 | [02-concrete](domains/02-concrete/README.md) | PCA Design & Control (study only), IRC/IBC |
| Metals | 13 | [04-metals](domains/04-metals/README.md) | SJI (study only), OSHA Subpart R |
| Carpentry | 12 | [05-carpentry](domains/05-carpentry/README.md) | Carpentry & Bldg Construction (study only), IRC |
| Safety | 12 | [09-safety](domains/09-safety/README.md) | **OSHA 1926 (in room)** |
| Masonry | 10 | [03-masonry](domains/03-masonry/README.md) | Modern Masonry (study only), IRC R703.8 |
| Thermal & Moisture | 10 | [06-thermal-moisture](domains/06-thermal-moisture/README.md) | **IRC / IBC (in room)** |
| Sitework | 9 | [01-sitework](domains/01-sitework/README.md) | Pipe & Excavation (study only), OSHA Subpart P |
| General Building Code | 9 | [10-general-building-code](domains/10-general-building-code/README.md) | **IBC / IRC (in room)** |
| Finishes | 6 | [08-finishes](domains/08-finishes/README.md) | **IRC / IBC (in room)** |
| Doors & Windows | 5 | [07-doors-windows](domains/07-doors-windows/README.md) | **IRC / IBC (in room)** |

The question bank has 156 questions across the 10 domains. Build a fresh shuffled exam with `python3 tools/build_exam.py <seed>`. The bank is small, so exams overlap. Add questions to any domain file in the same format and they get picked up automatically.

## What has to be passed

| Exam | Delivered by | Format | Pass | Notes |
|---|---|---|---|---|
| Combined B-1 / B-2 / KB-1 / KB-2 Trade Exam | PSI Services | 100 questions, 240 min, open book (3 references) | 70% | Can be replaced by NASCLA |
| Statutes and Rules Exam (SRE) | AZ ROC via Gmetrix (online only) | Open-book training course + exam | 70% | Required for applicants who weren't a QP in the last 5 years. $61 |
| *Alternative:* NASCLA Commercial General Building | PSI / NASCLA | 115 questions, 330 min | 81 correct | Accepted in lieu of the AZ trade exam. $106 + $25 |

## Repo layout

```
docs/
  00-official-sources.md     PSI CIB, content outline, AZ ROC pages, exam waiver
  01-content-outline.md      Exam blueprint by domain with item counts
  02-references.md           Books allowed in the room vs study-only
  03-practice-exams.md       Practice sources: online, local schools, libraries, colleges
  04-study-plan.md           3-day plan + 8-week plan
domains/                     One folder per domain: concepts, code locations, questions
practice/                    Full practice exams, answer keys, missed-question log
sre/                         Statutes and Rules Exam notes
tools/build_exam.py          Builds weighted, shuffled 100-question exams (markdown)
tools/build_site.py          Converts domains + docs into assets/data.js for the website
index.html, assets/          The website (no framework, no build step beyond data.js)
```

## Status

- [x] Official guide located (PSI CIB + content outline)
- [x] Blueprint mapped
- [x] Practice sources, local schools, libraries, colleges researched
- [x] 3-day plan for Friday 11/20
- [x] Domain notes and question banks (all 10 domains)
- [x] Weighted practice exams 01 and 02
- [ ] Download the official PSI content outline PDF and confirm item counts
- [ ] Exam waiver confirmation from ROC
- [ ] SRE notes (only if the waiver doesn't cover it)

> Study notes are paraphrased summaries with section references, not code text. Always verify against your own 2018 IBC, IRC and OSHA 1926, and confirm requirements with PSI (855-744-0310) and AZ ROC Licensing (602-542-1525).
