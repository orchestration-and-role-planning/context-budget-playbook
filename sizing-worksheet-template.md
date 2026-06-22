---
doc: per-orchestration sizing worksheet (template — copy per role)
audience: a planner authoring or troubleshooting an orchestration (and the product owner reviewing it)
status: living
---
# Sizing Worksheet — Template

## Why this exists

The role-authoring budget guide strips every scrap of sizing math out of the role docs, on purpose: a role doc carries the resolved *result*, never the budget reasoning behind it. That keeps the docs bare — but it has a cost. Once the math is gone, a session that was never sized looks identical on disk to one that was sized carefully. There is nothing in the role doc to tell them apart. The overrun only announces itself at run time, when the 75k tripwire trips mid-step and the orchestration stalls.

This worksheet is the sanctioned fix. It moves overrun-detection from run time to review time: the planner does the budget math *here*, in a persisted sidecar, while authoring the orchestration — and the product owner reads it before a single session is spawned. The math that the role docs are not allowed to carry lives here instead, in plain sight, where the people who plan and review the run can see it.

Read it straight:

- It is read by **planners** (while sizing) and by **the product owner** (while reviewing). It is **never** read by a runtime worker — pipeline workers do not look in `Context planning/`.
- The role docs stay **bare**. Nothing in this worksheet is ever merged into a role card.
- This is a **sidecar**, not a source. It records the reasoning; the role doc records only the result that reasoning produced.

## How to use it

1. One worksheet per orchestration, named `<Role>-sizing.md`, living in `Context planning/` (e.g. `Context planning/Coordinator-sizing.md`). Copy this template, fill the table, keep the file.
2. One row per distinct session **shape**, not per instance. Twelve identical merge workers are one row with an instance count of 12; a coordinator that runs as two distinct sessions across its life is two rows.
3. Compute each row's **floor growth** as Σ(action × cost) using the per-action anchors in `context-budget-model.md` §4–5. This is the raw, optimistic sum.
4. Compute the **inflated** figure as `30k + 1.5 × floor growth` — baseline plus the variance multiplier riding on growth only (never on the baseline). Judge the row against the **70k switch target**, not against the bare floor.
5. Assign the verdict: ✅ comfortably under 70k · ⚠️ within ~5k of 70k (in band, but watch it) · ❌ over.
6. Flag every **heavy-read-plus-dispatch** session as first-class: any session that reads a large input *and* fires spawns is the exact failure the budget guide forbids, even if its arithmetic looks survivable. Note it in its own section below.
7. Review the whole sheet **before any spawn**. A row sitting at ❌ does not launch — it gets split or re-shaped first.
8. Keep the file after the run. When something trips, the troubleshooting section turns the worksheet into a post-run diagnostic sheet.

## Cost crib

Authoritative source is `context-budget-model.md` §4–5 — copy from there, don't re-derive. The figures below are the common anchors; reach back to the model for anything not listed.

| Action | Cost |
| --- | --- |
| Baseline (every session starts here) | 30k — the ×1.5 multiplier rides on growth only, never on the baseline |
| File read | `9k + 76 × N` for N lines. A single Read caps at ~300 lines / ~25k tokens; above that it is multiple calls, each carrying its own 9k floor |
| Meta-agent schema load | 10k, one-time per session that spawns |
| Spawn a child | ~5k + the brief you hand it |
| Status poll (`get_session_status`) | ~4k. A Glob existence-glance is far cheaper — a glance is not a read |
| `get_session_result` | ~6.5k + the child's returned payload |
| Write | ~2.5 tokens per word emitted |

Two caveats from the model that change how you read a row's verdict — not the arithmetic, but the trust you place in it:

- **Only the file-read anchor is cleanly measured** (model §7). The per-line slope and the read caps come from a multi-point fit and the tool's hard refusal. Every other anchor — schema, spawn, poll, result — is an *upper bound*, inflated by a measurement artifact; real runs cost ~30–60% lower on those short actions. So a row pushed over 70k mostly by **spawn-cycle** cost is softer than it looks (upper bounds, then ×1.5 on top), while a row pushed over by **file reads** is real. When a row is borderline, ask which kind of cost dominates it. Conservative estimates only ever err toward handing off early, which is the safe direction.
- **The 1.5× multiplier is provisional** (model §8) — a deliberate working margin, not a measured constant, set to be recalibrated the first time a full coordinator run is measured end to end against its own floor. Treat it as the current best margin, not a law.

## The worksheet

**Orchestration:** `<name>`
**Sized against:** `<the concrete batch / corpus / range this run targets>`
**Switch target: 70k · Tripwire: 75k · Baseline: 30k**

Tier legend — **dispatcher**: pure spawn, no heavy read. **orchestrator**: light coordinator, reads only markers and the brief it was handed. **leaf**: does one disposable heavy read, then stops.

| # | Session shape | Tier | Instances | Actions (itemised growth) | Floor growth | Inflated 30k+1.5× | Verdict vs 70k | Heavy-read + dispatch? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |  |  |

## Heavy-read-plus-dispatch check

One entry per row flagged "YES" above. Name the session, state the large input it reads and the spawns it fires in the same life, and write the fix direction — typically: carve the heavy read out into a disposable leaf and leave the dispatcher pure spawn.

- *none flagged* — or list each here.

## Troubleshooting (post-run)

One entry per incident, added after the run. Record:

- **Session** — which shape tripped.
- **Symptom** — where it tripped (which step, what the tripwire showed).
- **Measured cause** — the arithmetic that explains it, in real numbers.
- **Fix direction** — what would re-shape the session to stay in band (not necessarily implemented).
