---
doc: per-orchestration sizing worksheet (template — copy per role)
audience: a planner authoring or troubleshooting an orchestration (and the reviewer)
status: living
---
# Sizing Worksheet — Template

## Why this exists

This skill strips all sizing math out of role docs on purpose: a role doc carries the resolved *result*, never the budget reasoning behind it. That keeps the docs bare — but it has a cost.

Once the math is gone, an unsized session looks identical on disk to a carefully sized one. Nothing in the role doc distinguishes them. An overrun only announces itself at run time, when the tripwire trips mid-step and the orchestration stalls.

This worksheet is the sanctioned fix: it moves overrun-detection from **run time to review time**. The planner does the budget math here, in a persisted sidecar, while authoring — and the user reads it before any session is spawned. The math the role docs can't carry lives here, in plain sight.

Read it straight:

- Read by **planners** (while sizing) and by **the user** (while reviewing). **Never** read by a runtime worker — pipeline workers do not look in `planning/`.
- Role docs stay **bare**. Nothing in this worksheet is ever merged into a role card.
- This is a **sidecar, not a source**. It records the reasoning; the role doc records only the result that reasoning produced.

## How to use it

1. One worksheet per orchestration, named `<role>-sizing.md`, living in `planning/` (e.g. `planning/reviewer-sizing.md`). Copy this template, fill the table, keep the file.
2. One row per distinct session **shape**, not per instance. Twelve identical Mergers = one row, instance count 12; a coordinator that runs as two distinct sessions across its life = two rows.
3. Compute each row's **floor growth** as Σ(action × cost) using the per-action anchors in `reference.md` → Cost anchor table. Raw, optimistic sum.
4. Compute the **inflated** figure: the baseline plus the variance multiplier, which rides on growth only — never on the baseline. Take the constants from `reference.md` → The variance multiplier; do not restate them here. Judge against the **switch target**, not the bare floor.
5. Assign the verdict against the thresholds in `reference.md` → The thresholds: ✅ comfortably under the switch target · ⚠️ within the buffer band (in band, watch it) · ❌ over.
6. Flag every **heavy-read-plus-dispatch** session as first-class: any session that reads a large input *and* fires spawns is the exact failure this skill forbids, even if its arithmetic looks survivable. Note it in its own section below.
7. Review the whole sheet **before any spawn**. A row at ❌ does not launch — it gets split or re-shaped first.
8. Keep the file after the run. When something trips, the troubleshooting section turns the worksheet into a post-run diagnostic sheet.

> Cost anchors, formulas, and thresholds: see the skill's `reference.md` — do not duplicate numbers here.

## The worksheet

**Orchestration:** `<name>`
**Sized against:** `<the concrete batch / corpus / range this run targets>`
**Thresholds (switch target / tripwire / baseline): see `reference.md` → The thresholds.**

> Tier legend — **dispatcher**: pure spawn, no heavy read. **orchestrator**: light coordinator, reads only markers and the brief it was handed. **leaf**: does one disposable heavy read, then stops.

| # | Session shape | Tier | Instances | Actions (itemised growth) | Floor growth | Inflated total (reference.md) | Verdict vs switch target | Heavy-read + dispatch? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |  |  |

## Heavy-read-plus-dispatch check

One entry per row flagged "YES" above. Name the session, state the large input it reads **and** the spawns it fires in the same life, and write the fix direction — typically: carve the heavy read out into a disposable leaf and leave the dispatcher pure spawn.

- *none flagged* — or list each here.

## Troubleshooting (post-run)

One entry per incident, added after the run. Record:

- **Session** — which shape tripped.
- **Symptom** — where it tripped (which step, what the tripwire showed).
- **Measured cause** — the arithmetic that explains it, in real numbers.
- **Fix direction** — what would re-shape the session to stay in band (not necessarily implemented).
