---
name: plan-authoring
description: Author a new agent pipeline plan, role doc, wave plan, sizing worksheet, or kickoff/spawn prompt — design it, size it against the budget model, then write it bare and closed — or audit and remediate an existing one against the bare-doc and budget-sizing rules. Use when writing, sizing, or repairing any role card, orchestration or remediation plan, wave plan, sizing worksheet, or spawn/kickoff prompt.
---
# plan-authoring

You are about to write or fix a role doc, an orchestration or remediation plan, a wave plan, a sizing worksheet, or a kickoff/spawn prompt. This skill holds the discipline that makes every session those artifacts spawn (1) land under the switch target and (2) run to its end on the literal steps alone, without improvising.

Two modes share one reference (`reference.md`). Pick the mode, then work the checklist.

## The one rule

Everything an agent would otherwise have to work out for itself, you work out now — at authoring time — and bake the answer into the steps. The artifact carries **none of your reasoning** (not the budget math, not the lookup, not the "why") and **every result that reasoning produced** (the fixed count, the named seam, the concrete path, the decision made, the branch chosen).

Two kinds of unknown an agent must never carry, both owned by you:

- **Cost.** You size the work, inflate the estimate, and set spawn and phase counts. The agent is never told a budget exists, and never monitors its own context.
- **Content.** You resolve every lookup, name every path, make every decision, and choose the branch for each way a step can come back wrong. The agent is never told to "figure out," "resolve," or "handle" anything.

A pipeline agent that monitors its own context is a defect, not a safety — and so is one that must discover, disambiguate, or decide. Both mean a step was left open. Engineer safety into the **structure**: if the literal steps sum under budget and every named input already resolves, the agent never needs to know a budget exists and never needs to improvise.

### The executor's reader test

A role doc has exactly one reader: the agent executing that role — not a human auditor, not a future maintainer, not you re-reading later. For every line, ask: **does the agent take a different action because this line is here?** If a line only orients a reader, situates the role in the bigger picture, or describes a neighbor role, the executor acts on none of it — cut it, however true or well-written. A single one-line frame of *this* role can earn its place; describing neighbors, restating pipeline shape, or narrating flow does not.

## The thresholds

These plain numbers are all the budget arithmetic an entry card carries. Everything else — the cost table, the formulas, the multiplier — lives in reference.md.

- **70k — switch target.** The line you design against; hand off before exceeding it.
- **75k — hard stop.** A tripwire forces a handoff here. The 70k target sits deliberately inside this stop — treat the gap as safety margin, not budget to spend.
- **55k — calm nudge.** A non-blocking heads-up that wrap-up runway has begun. When it fires, finish tidily — do NOT rush, truncate, or cut quality.
- **Existence baseline — model-specific.** Loaded by the platform at session start, not by your work: ~40k on Opus (the default lean worker), ~38.6k on Haiku, ~52k on Sonnet (plus a hidden ~33k reserve). Full decomposition in `reference.md`.

## The two modes

One skill, two entry paths over the one reference. Both end with the same confirm pass.

### Author new — "I need a plan for X"

1. **Design.** Decide the session shapes the role will spawn (boot/lead, wave-owner, leaf workers, reducers) and where the seams fall. One leg per session; a seam is a wall, not a pause.
2. **Size.** Record the budget math in a per-orchestration sizing worksheet (`planning/<role>-sizing.md`, copied from this skill's bundled `sizing-worksheet-template.md`). One row per distinct session shape, including the boot session. Size with the budget model, treat the sum as a floor, inflate it by the variance multiplier, and verdict each row against the 70k switch target. A row over 70k is not yet a plan — split or re-shape it before any spawn. (Numbers and formulas: `reference.md`.)
3. **Write.** Author each artifact bare and closed, working the checklist below. Open any boot-able plan with a cold-start contract.

### Fix existing — "audit this doc against the rules, then remediate"

1. **Audit.** Read the finished doc against the red-flag list (`reference.md` → Red flags). Run three distinct passes: the budget-leak scan (any token figure, "k" number, or sizing rationale), the open-step scan (any "figure out / resolve / find / as appropriate," any input named by description instead of a concrete path, any step with a happy path and no failure branch), and the executor's reader test (any line the agent takes no action on). Confirm the doc boots cold if a human starts it by pointing at it.
2. **Remediate.** For each flag, apply the fix: strip the leak, close the open step (inline the resolved result or pin the branch), cut the dead line, or add the missing cold-start contract. Re-resolve any lookup the doc punted. Move any surviving budget math out of the doc and into the sizing worksheet.

## The authoring checklist

Two passes and a confirm. *Size it* so no session can overrun; *close it* so no session can improvise; then confirm both. Run every check before calling an artifact finished.

### Group A — Size it (so nothing overruns)

1. **Size each session shape, then inflate it.** List every distinct session the role spawns AND the boot session that starts the run. For each, sum the growth from the cost anchors, treat that as a floor, plan against the inflated figure, and size spawn/phase counts off the inflated total — not the raw one. Any single session whose inflated total crosses 70k is not yet a plan — split it. (`reference.md` → Cost anchors, Variance multiplier.)
2. **Size the write side, not just the reads.** Every artifact a worker emits renders its full content as growth. For each session, list every artifact it writes and size the *largest plausible* payload. If summed writes push the inflated total over 70k, split artifact production across workers or cap per-artifact payload. (`reference.md` → Write formula.)
3. **Translate the sizing into bare behavioral instructions.** Wherever sizing assumed a cheap action, write the doc so the cheap action is the only one the agent is told to take — and never write the budget reason beside it. (`reference.md` → Translation patterns.)
4. **Align every kickoff/spawn prompt with the plan.** No prompt may put an input in front of an agent that the plan says it must not consume. If the plan says the worker works from a brief, the prompt hands the brief — not the raw input path. (`reference.md` → Prompt-plan alignment.)
5. **Record the sizing in the orchestration's sizing worksheet.** The math lives in the persisted sidecar at `planning/<role>-sizing.md`, never in the role doc. One row per distinct session shape, each with its floor growth, its inflated figure, its verdict against 70k, and a first-class flag on any heavy-read-plus-dispatch session. Review the sheet before any spawn — a row over 70k does not launch — and keep it after the run as a troubleshooting record.

### Group B — Close it (so nothing improvises)

6. **Resolve every lookup at authoring time.** If a step turns a pointer into a file, a name into a path, or an ID into a record, do that resolution now and write the concrete result into the step. If a result genuinely cannot be known until run time, the step still owes three things: proof the method returns exactly one answer, the exact command that produces it, and the branch the agent takes on zero or many.
7. **Make every step concrete and self-contained.** Each step names its real inputs and outputs — path, file, line range — never a description the agent must go find or disambiguate. Never define a step by pointing at another role's or wave's behavior; spell the mechanic out in full here. The one exception is a genuine handoff at a phase seam, where the step's job *is* to send the agent to the next leg's card.
8. **Choose the failure branch for each fragile step.** For every step that can come back empty, ambiguous, or missing, the step says what the agent does then. You pick the branch (stop-and-record, take-the-first, take-the-highest) and write it down.

### Group C — Then confirm

9. **Hunt for context-aware instructions and remove them.** Scan the doc and every spawn prompt for anything asking the agent to check, measure, estimate, or react to its own context, token count, or budget; any "until done / until full" loop with no fixed count; any "hand off when your context gets high." Replace each with a fixed structural rule: a finite count, a named phase seam, or a bounded read.
10. **Confirm the doc is bare — and closed.** Read it once more against the red-flag list. If any budget number, token figure, sizing rationale, or self-monitoring instruction survived, strip it. If any step still says "figure out," "resolve," or "as appropriate," or names an input it never resolved, close it.
11. **Confirm the plan boots cold.** If a human or successor starts this artifact by pointing at it and saying "begin," it must open with a closed cold-start contract (below). Confirm the boot session stays lean — it dispatches the heavy reads, never performs them — and that no opening step asks the agent to absorb the plan or gather inputs before acting.

## The cold-start contract

A plan does not execute itself — someone boots it. A human points a fresh agent at the plan file and types "start this," and that one-line kickoff is the *entire* instruction the agent gets; everything else it takes from the plan. So the plan carries its own kickoff: a closed, bounded cold-start contract at the very top — the first thing the boot agent reads and the only thing it needs to launch. It owes the same two things every session owes:

- **Lean, not heavy.** The boot agent is a coordinator: it reads a small startup set and dispatches. It does not read the corpus, the audit, the findings, or even the rest of the plan — those belong to the workers it spawns. Any heavy read the launch appears to need is a disposable worker's job, dispatched *by* the lean boot owner, never done *by* it.
- **Closed, not improvised.** The contract is an ordered, self-contained list of opening steps that ends at the first spawn or the first handoff: read exactly these bounded things, then spawn this worker with this inline brief, or hand to this owner. No step says "understand the plan," "gather the inputs," or "figure out where to begin." The agent coming in cold runs the contract literally and is launched.

Symptom when wrong: the first session burns its whole budget discovering it should not have read what it just read, then hands off having launched nothing.

## Where the detail lives

`reference.md` is the single source of truth for everything this card points at:

- the per-action **cost anchor table** and the existence-baseline decomposition;
- the **formulas** — file-read, spawn-cycle, user-message, deferred-tool load, write, floor math;
- the **variance multiplier** and the "your estimate is a floor" lesson;
- the **upper-bound caveat** and the re-estimate factor;
- the worked **session shapes** (don't read heavy to dispatch; don't read heavy then write heavy; close the session at the seam);
- **prompt-plan alignment** and why 70k works;
- the **translation patterns** table;
- the **structural toolkit** (including the cross-session spawner/collector/doer role split);
- the **red-flag** phrase list and the worked micro-examples.

The bundled `sizing-worksheet-template.md` is the per-orchestration sizing sidecar — copy it to `planning/<role>-sizing.md` and fill one row per session shape.
