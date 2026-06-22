---
doc: role-authoring budget guide
audience: an agent that FIXES or CREATES a pipeline role doc, wave plan, or kickoff prompt
status: living
---
# Role-Authoring Budget Guide

You are about to write or fix a pipeline role doc (a Pipeline/Roles/*.md), its wave plan, or a kickoff/spawn prompt. This guide is the discipline for doing that so every session the role spawns does two things by structure: it lands under the 70k switch target, and it runs to its end on the literal steps alone — without ever improvising. You hold the budget; you also hold every lookup, path, and decision the steps depend on. The agent holds neither — it executes closed steps.

Use it alongside `context-budget-model.md`, the sizing reference. That model is yours to use while authoring. It, and the reasoning you draw from it, must never appear in the doc you produce. This guide is the one place in the pipeline tree where budget reasoning belongs — it lives here precisely so the role docs stay bare.

## The one rule

Everything an agent would otherwise have to work out for itself, you work out now — at authoring time — and bake the answer into the steps. There are two kinds of unknown an agent should never carry, and both are yours:

- **Cost.** You size with the budget model, apply the variance multiplier, set the spawn and phase counts. The agent is never told a budget exists.
- **Content.** You resolve every lookup, name every path, make every decision, and choose the branch for each way a step can come back wrong. The agent is never told to "figure out," "resolve," or "handle" anything.

So the role doc carries **none of your reasoning** — not the budget math, not the lookup you ran, not the "why." It carries **every result that reasoning produced** — the fixed count, the named seam, the concrete path, the decision already made, the branch already chosen. Withhold the reasoning; bake in the result. Bare of *why*, total on *what* — those are not in tension. "Bare" means free of budget-reasoning, never thin on mechanics; a step stripped of its concrete inputs is not bare, it is unfinished.

A pipeline agent that monitors its own context is a defect, not a safety — and so is one that has to discover, disambiguate, or decide. Both mean a step was left open. Engineer the safety into the **structure** of the steps: if the literal steps sum to under budget and every input they name already resolves, the agent never needs to know a budget exists and never needs to improvise.

## The authoring checklist

Two passes and a confirm. **Size it** so no session can overrun; **close it** so no session can improvise; then confirm both. Run every check before you call a role doc finished.

### Size it — so nothing overruns

1. **Size each session shape with the model — then inflate it.** List every distinct session the role spawns (Lead per-cycle, wave-owner, each leaf worker, each reducer). For each, sum the growth from the budget model's "Per-action cost anchors" table. Treat that sum as a floor: per the budget model's Section 8 — The variance multiplier, plan against `30k + 1.5 × (growth sum)` and size the spawn and phase counts off that inflated figure, not the raw one. Any single session whose inflated total crosses 70k is not yet a plan — split it.

2. **Size the WRITE side, not just the reads.** A session's output is growth too: every artifact a worker emits renders its full content as assistant tokens. For each session, list every artifact it writes and size the largest plausible payload — not a nominal one. A worker that emits several artifacts, or one whose size scales with a finding/row count (a re-audit's findings file, a sorted handoff of dozens of items), is a write-side overrun even when its reads are tiny. Size each artifact against the *upper* bound of what the run can produce, sum the writes into the session's floor alongside the reads, and inflate the total. If the summed writes push the inflated total over 70k, split artifact production across workers (e.g. a findings-writer leaf separate from the list/manifest writer) or cap the per-artifact payload — never let one session own an unbounded fan of fat writes.

2. **Translate the sizing into bare behavioral instructions.** Wherever your sizing assumed a cheap action, write the doc so the cheap action is the only one the agent is told to take, and never write the budget reason beside it. Use the translation patterns below.

3. **Align every kickoff/spawn prompt with the plan.** Per the budget model's Section 9 — Prompt-plan alignment, no prompt may put an input in front of an agent that the plan says it must not consume. If the plan says the worker works from a brief, the prompt hands the brief — not the raw input path. Make the cheap planned action the natural one; withhold the expensive input the plan forbids.

4. **Record the sizing in the orchestration's sizing worksheet.** The math you just did does not live in the role doc — but it must not evaporate either, or the next planner cannot tell a session that was never sized from one sized carefully. Capture it in a persisted sidecar at `Context planning/<Role>-sizing.md` (copy `Context planning/sizing-worksheet-template.md`): one row per distinct session shape, each carrying its floor growth, its inflated `30k + 1.5×` figure, its verdict against 70k, and a first-class flag on any heavy-read-plus-dispatch session. Review the sheet before any spawn — a row at ❌ does not launch — and keep it after the run as a troubleshooting record. The worksheet is the **sanctioned home for the math, separate from and never merged into the role doc**: budget reasoning lives outside the role docs precisely so they stay bare, and the sizing worksheet is the per-orchestration instance of exactly that principle.

### Close it — so nothing improvises

4. **Resolve every lookup at authoring time.** If a step turns a pointer into a file, a name into a path, or an ID into a record, do that resolution now and write the concrete result into the step. If a result genuinely cannot be known until run time, you still owe three things in the step: proof the method returns exactly one answer, the exact command that produces it, and the branch the agent takes when it returns zero or many. A lookup you did not run, or whose result you neither inlined nor bounded with a branch, is a punt — and the agent improvises to cover it.

5. **Make every step concrete and self-contained.** Each step names its real inputs and outputs — the path, the file, the line range — never a description the agent must go find or disambiguate. Following the step must require nothing the doc or the brief did not already hand over: if a step leans on a convention, a fact, or a prior decision, that thing is written into the step.

6. **Choose the failure branch for each fragile step.** For every step that can come back empty, ambiguous, or missing, the step says what the agent does then. The branch is yours to pick — stop-and-record, take-the-first, take-the-highest — but it is picked here, by you, and written down. A step with one happy path and no branch forces a guess the instant reality diverges from the plan.

### Then confirm

4. **Hunt for context-aware instructions and remove them.** Scan the role doc and every spawn prompt for anything that asks the agent to check, measure, estimate, or react to its own context, token count, or budget; any "until done / until full" loop with no fixed count; any "hand off when your context gets high." Each is a defect. Replace it with a fixed structural rule — a finite count, a named phase seam, or a bounded read.

5. **Confirm the doc is bare — and closed.** Read the finished role doc once more against the red-flag list below. If any budget number, token figure, sizing rationale, or self-monitoring instruction survived, strip it. If any step still says "figure out," "resolve," or "as appropriate," or names an input it never resolved, close it. The justification stays in your head and in the budget model; the resolution goes into the step.

## Translation patterns

These convert a sizing or resolution decision into a bare instruction. The left column is what the agent must never be told; the right column is what the doc says instead.

| Instead of (leaks, unbounded, or unresolved) | Write (bare, finite, resolved) |
| --- | --- |
| "read the raw input / full handoff / corpus" | "work from the brief / the digest / your assigned slice" |
| "spawn readers until the work is done" | "spawn these three readers" (a fixed count) |
| "hand off when your context gets high" | "hand off after this phase" (a named seam) |
| "keep folding findings until merged" | "fold at most four findings; more than four means a partial-then-final reducer" |
| "check whether the handoff is too big to read" | "match and read only the tagged lines" (bounded regardless of input size) |
| "poll the child until it returns" | "glance for its done marker, then read only the digest" |
| "resolve each pointer to its file" | "read `…/3f9a.jsonl`" (you resolved it; the path is inline) |
| "find the right slice and process it" | "process `slice-07.md`" (the choice is already made) |
| "handle whatever the search returns" | "if the match count is not exactly one, stop and record the pointer — do not guess" (the branch is pinned) |

The shape is always the same: replace an open-ended, budget-conditional, or unresolved action with a finite, named, bounded, already-resolved one.

## The structural toolkit

These proven primitives — the bare-instruction vocabulary that keeps a session under budget and off the improvising path. Reach for these when you translate.

- **Lead-never-reads-heavy.** A coordinator reads only its light startup set, compact digests, and disk markers — never the corpus, a full handoff, or leaf/merged findings. Disk glances are existence checks (Glob), not content reads.
- **Spawn cap + successor instance.** A session spawns at most a fixed number of children; beyond the cap it hands to a fresh successor instance of itself via the disk-marker survival pattern (fire-and-forget spawns + schedule_wakeup + marker glances). The count is fixed in the doc; the agent never tallies it against a budget.
- **Fold cap + staged reducers.** A reducer folds at most a fixed number of findings files; more than that means staged partial reducers feeding a final one. This bounds reads per session, because every read costs a fixed floor regardless of file size.
- **Brief / digest / marker, never raw.** Workers consume compact, bounded artifacts the prior stage wrote for them. The expensive source is read once, by the single disposable worker scoped to it.
- **Phase = one session, broken at a wait.** Each phase is scoped to a single session and ends at a natural wait — a child running, a marker pending. The phase boundary is a fixed handoff seam: the agent hands off because the step says to, not because it measured anything.
- **One leg per session — a seam is a wall, not a pause.** A single session runs exactly one pipeline leg and then closes. When a session reaches its handoff seam, it spawns a *fresh successor instance* to carry the next leg — it never reanimates itself to do more work. This holds across idle-resumes especially: a session resumed after going idle mid-pipeline must verify its leg is complete and hand off, not pick up a second leg (a fan-out leg followed by a merge leg in one session is the canonical two-legged overrun — both waves of spawn payloads, both manifest/search passes, and the resume paste all accumulate in one Messages bucket). Author the resume branch explicitly: the step a resumed session lands on says "confirm your leg's markers are down, then hand off to a fresh successor for the next leg" — never "continue." Each leg then runs on its own clean baseline.
- **Bounded read over an unbounded input.** When an input has no size ceiling (a handoff, an archive), tell the worker to match and read only the tagged lines, not the whole file — bounded no matter how large the input grew.
- **Count the read floor per file, not per byte.** Each read costs a fixed floor regardless of file size, so breadth is as dangerous as bulk: a session told to consult six registers pays six floors before a single content line, and that fan alone can carry it over the wire even when no one read is large. When sizing, multiply the floor by the number of distinct files a session reads, not just their summed length. The fix is to pre-distill the fan into one compact notes artifact upstream — the worker reads that single brief, not the six live sources. Never place several source paths in front of a worker and trust a "read selectively" instruction to hold; the paths in the prompt are what it consumes.
- **Every lookup the worker needs is in its brief — caps only hold if it never has to leave them.** A "read at most N inputs, nothing else" cap is defeated the instant a step depends on something not in those inputs (a canonical catalog, a code list), because the worker must then explore to find it — and that off-cap hunt is the overrun. Resolve every such dependency at authoring time and inline it (or hand it as a pre-resolved capped input) so the only reads available are the cheap planned ones.
- **Slice an oversized single read across leaves.** When one read is too large for a session's budget even alone (a several-hundred-line index range distilled inside a read-then-dispatch session is the textbook case), do not leave it in a session that also does other work, and do not just move it to one leaf — a read that exceeds one leaf's budget overruns the leaf too. Slice the oversized source across multiple disposable reader leaves with a merge (mirroring the corpus slice-readers), or shrink the per-batch range, so no single session owns the whole read. Keep the dispatching session pure dispatch.
- **Resolve-then-inline.** Every pointer, name, or ID a step depends on is resolved by you while authoring and written into the step as its concrete target. The agent reads a path; it never derives one.
- **Pinned failure branch.** Every step that can come back empty, ambiguous, or missing carries the response you chose for it — stop-and-record, take-the-first, take-the-highest — written into the step. The branch is decided by you; it is never left to the agent's judgment.
- **Complete brief.** A worker's brief holds everything its steps name — the paths, the ranges, the decisions already made — so the worker reads only what the brief points to and supplies nothing of its own.
- **Sub-dispatcher fan-out.** No single head fans out a whole roster. When a head must dispatch more items than its spawn cap, interpose sub-dispatchers: the head spawns 2–3 sub-dispatchers, each owning a contiguous slice of the roster and fanning out only its slice, mirroring the spawn-cap-plus-successor pattern. A roster of N items at spawn cap C uses ceil(N ÷ C) leaf spawns, grouped under ceil(that ÷ C) sub-dispatchers, recursing until one head spawns the top tier.

## Red flags — what must never appear in a produced role doc

If the doc you wrote contains any of these, it is not finished:

- a token number, a "k" figure, or any context/budget arithmetic;
- the words "context," "budget," "70k," "tripwire," or "token" used to direct the agent's behavior;
- "check / watch / estimate your context," "hand off when full," "if you're running low";
- a "why we do this" rationale of any kind — the agent acts on the rule, never on its reason;
- an unbounded loop ("until done," "as many as needed") where the safety depends on a count;
- a kickoff prompt that hands a worker the raw input the plan says it works a brief from;
- a step that says "resolve," "look up," "find," "figure out," "determine," "decide," "handle," "as appropriate," or "as needed" — each names a decision you failed to make;
- an input referred to by description ("the right transcript," "the slice file") instead of by a concrete path;
- a lookup or transform written as a step with no inlined result and no proof it returns exactly one answer;
- a step with a single happy path and no branch for what happens when it comes back empty, ambiguous, or missing.

The context-tripwire hook is a safety belt, not the control; if the structure is right, no session reaches it. There is no equivalent belt for improvisation — the only thing standing between a step and a guess is whether you closed it here.

## Worked micro-examples

**The cost overrun.** Sizing says: a dispatcher that both reads its sizing input and fires a large batch of spawns overruns — a reader-plus-large-dispatcher session inflates past 70k well before the batch is out. So the structure splits the two jobs.

- **Bad (leaks + overruns):** "Read the wave plan, then spawn one worker per slice until all slices are dispatched, watching your context as you go."
- **Good (bare + finite):** the Lead's doc says "Spawn the wave-owner with the slice list inline." The wave-owner's doc says "Spawn the first six slice-workers from the list below. After the sixth, hand off to your successor instance to spawn the rest." Neither doc names a budget; the fixed counts make the budget hold.

Prompt-plan alignment on the same example: the wave-owner's spawn prompt hands each slice-worker its **one slice file and line range** — not the corpus path — so the cheap planned read (one slice) is the only read available to it.

**The unresolved lookup.** The content-side twin of the overrun. A plan hands a worker a roster of pointers and tells it to find the file each one names. The author assumed the lookup resolves cleanly; at run time each pointer matches fifty files, the step carries no branch, and the worker improvises to save the run.

- **Bad (unresolved + no branch):** "For each pointer in the roster, find its transcript file and read it."
- **Good (resolved + pinned):** you run the lookup while authoring and write the roster as concrete paths — "Read `…/3f9a.jsonl`, lines 1–40." For any pointer that genuinely cannot resolve until run time, the step carries the exact command and the branch you chose: "Grep the marker in the transcript dir; if the result is not exactly one file, stop and record the pointer in a marker — do not guess." Either way the agent never decides: you resolved the lookup, or you handed it the branch.
