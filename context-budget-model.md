---
doc: BA1 context-budget model — reference
audience: any future BA1 session sizing its work or deciding when to hand off
status: living
---
# BA1 Context-Budget Model

This is the reference for sizing a BA1 session's context burn and deciding when to hand off to a fresh session. It is self-contained — you do not need to read the calibration findings or any handoff doc to use it.

## TL;DR

- Switch target: 70k total context. Aim to hand off before exceeding it — this is the line you design against.
- Hard stop: 75k total context, where a tripwire forces a handoff. The 70k target sits deliberately 5k inside this stop; that gap is an intentional buffer (see section 1), so orchestrations designed against 70k stay clear of the tripwire.
- Calm nudge at 55k: a non-blocking heads-up that wrap-up runway has begun. Do not rush or cut quality — just aim your next natural breakpoint to be tidy.
- Existence baseline: 30k at session start (loaded by the platform, not by your work).
- Working headroom: 40k of growth budget per session.
- Math (floor): `floor ≈ 30k + Σ (action × cost)` — pull cost values from the per-action anchor table.
- Plan against the inflated figure, not the floor. Real runs always exceed the clean action list, so size your work against `30k + 1.5 × Σ (action × cost)` and pick spawn/phase counts off that. See section 8.

## Table of contents

1. Switch target and the 70k rule
2. Existence baseline (what the 30k buys you)
3. The headroom rule and worked handoff example
4. Per-action cost anchors (table)
5. Per-action formulas with worked examples
6. Two worked session-shape estimates
7. Upper-bound bias caveat — when to trust the table loosely vs. tightly
8. The variance multiplier — your estimate is a floor
9. Prompt-plan alignment — make the planned action the natural action

## 1. Switch target and the 70k rule

Claude agents do not degrade at a single cliff. Across long-context benchmarks (Fiction LiveBench, NVIDIA RULER, Databricks RAG, Chroma's "context rot" study), quality slides *continuously* as input grows — measurable decline begins somewhere in the 16k–64k range, and the practical "good" working band lands around 60k–80k total context. There is no safe 120k plateau: a 200k- or 1M-token window does not mean 200k of usable thinking — degradation is continuous, not a sudden cliff at some high threshold.

Two findings matter most for BA1. First, **noise — not raw token count — is the primary failure mode for coding/agentic sessions.** Search, exploration, spawning, and backtracking accumulate tool-call debris that degrades every later output. BA1 sessions are exactly this high-rot kind, so we sit at the *fast* end of the degradation curve. Second, **position matters:** context is retrieved best at the very start and end, worst in the middle. BA1's ~30k existence baseline (tool catalogs, system prompt) is clean and pinned at the start, so it costs little in quality; the working growth piled on top is what rots.

BA1 therefore sets the switch target at 70k total context — a deliberately conservative stop well inside the research's 60k–80k quality band, with headroom below the 80k top past which the noisy/agentic growth degrades fastest. That is 40k of working growth on top of the 30k clean baseline. Because our growth is the noisy, agentic kind that rots fastest, we stop conservatively inside the band rather than push toward its top. The 70k target is the line you design against; the mechanical tripwire that forces a handoff sits wider, at 75k. That 5k gap is a deliberate buffer — an orchestration sized against 70k absorbs its normal slop without tripping the forced handoff, so plan to 70k and treat the extra 5k as safety margin, not budget to spend. A calm, non-blocking nudge fires earlier at 55k — that 55k→70k span is wrap-up runway, not stolen budget, so when it fires, finish tidily; do not rush, truncate, or cut quality. A session's total context is the sum of all /context buckets — Messages, System prompt, System tools, MCP tools, MCP tools (deferred), Memory, Custom agents, Skills, Misc.

In practice, the Messages bucket is the only one that grows meaningfully during work; the others are roughly fixed once the session starts. So in formulas below, "growth" means Messages-bucket growth.

## 2. Existence baseline

Empty BA1 session, no work performed: ~30k total context. Decomposition (typical):

- Messages bucket: ~5k (system instructions render here)
- MCP tools (deferred) — the static catalog of available-but-unloaded tools: ~17.6k
- System prompt + system tools + memory index + skills + custom agents + misc: ~7k

Loading a deferred tool via ToolSearch does not shrink the deferred catalog; it adds the schema to the Messages bucket as a tool result. The 17.6k catalog is permanent overhead for the session shape, not something to optimize away. It is also clean, start-pinned context (see section 1), so it costs budget but little quality.

## 3. The headroom rule

At any point in the session: `headroom = 70k − current_total_context`.

Before taking the next action, estimate its cost from the table below. If `estimated_cost > headroom`, hand off first — do not take the action and hope. Handoffs are cheap; drift is expensive.

Worked example. You are mid-session at total=50k. You need to read a 200-line dense markdown plan. From the table: file-read ≈ 9k overhead + 76 tok/line × 200 = 24.2k. headroom = 70k − 50k = 20k. 24.2k > 20k → hand off. Pattern: drop the read to a brief-as-file pattern (have the next session read the doc fresh) or split the doc with offset+limit reads in the next session.

## 4. Per-action cost anchors

| Action / tool | Cost | Notes |
| --- | --- | --- |
| Read (file, ~25-word-line markdown, 50-300 lines) | ~9k + 76 tok/line | Linear fit `tokens(N) ≈ 8.76k + 75.9 × N` |
| Read content cap | 256KB file size OR 25k tokens per call | Larger files need offset+limit reads |
| Bash, trivial (e.g., echo) | ~1.2k upper bound | Marginal per-call; real Bash usually costs more from result output |
| ToolSearch, deferred-tool load | ~2.5k per tool, batched | Batch as many tools as you'll need into one ToolSearch call |
| mcp__nimbalyst-meta-agent (schema bundle: spawn + status + result) | ~10k, one-time | Loaded once per session that does any meta-agent work |
| spawn_session call | ~5k + brief payload size | Brief payload dominates for non-trivial briefs |
| get_session_status poll | ~4k upper bound |  |
| get_session_result, trivial child | ~6.5k + child output | Scales with child's returned payload |
| User message, dense English prose | ~2.5 tok/word | Upper bound; cleaner prose runs lower |
| User message, "ok"-shape ack | ~5k turn overhead | Per-turn overhead dominates short messages |
| Write / artifact output (assistant-emitted file content) | ~2.5 tok/word of rendered content | The written content renders as assistant output; a multi-artifact write is the same cost as a paste of that text. Do NOT budget a flat per-file figure — scale by total content volume. See section 5. |

## 5. Per-action formulas with worked examples

### File-read formula

`read_cost(N) ≈ 9k + 76 × N` for ~25-word-line markdown, valid in the 50-300 line range. Worked example: reading a 150-line plan doc costs ≈ 9k + 76 × 150 = 20.4k. (Sanity check against the underlying measurement: a 150-line read in calibration measured 17.9k, within the upper-bound band.)

Hard caps: a single Read call refuses files above 256KB OR above ~25k tokens of content. For dense ~25-word-line markdown that ceiling lands near ~300 lines per call. Above that, split with offset+limit.

### Spawn-cycle formula

One full spawn cycle (schema load + spawn + 1 status poll + result fetch) for a child producing ≤200 tokens: `spawn_cycle_cost ≈ 10k schema + 5k spawn + 4k poll + 6.5k result ≈ 25.6k`. The schema 10k amortizes — every additional spawn in the same session skips it. So for the N-th spawn after the first:

`per_extra_spawn ≈ 5k spawn + 4k × P polls + (6.5k + child_payload_size) result`

where P is the number of status polls you take on that child before fetching its result.

Worked example. A second spawn in the same session, polled twice, child returns 1k of output: `5k + 4k × 2 + 6.5k + 1k = 20.5k`.

### User-message formula

`user_msg_cost ≈ 5k turn overhead + 2.5 × words`. Short acks are dominated by overhead; long pastes are dominated by per-word cost.

Worked example. A 5k-word document paste into a working session: ≈ 5k + 2.5 × 5,000 = 17.5k.

### Deferred-tool load formula

`tool_load_cost ≈ 7k ToolSearch overhead + 2.5k × tools_in_batch`. One tool: ≈ 9.5k. Four tools batched: ≈ 17k. Two separate ToolSearch calls of 2 tools each: ≈ 24k. Batch aggressively.

### Write / artifact-output formula

`write_cost ≈ 2.5 × words_of_rendered_content`, summed across every artifact the session emits. A write costs the same as a paste of the same text: the content renders as assistant output. There is no cheap flat per-file rate — a session writing six artifacts pays for the full word-volume of all six, not six small fixed charges.

Worked example. A Reader leaf writing six artifacts for a re-audit with ~35 findings (findings.md + reference/surface/closed/collected lists + manifest) emitted on the order of ~78k of growth — its Messages bucket reached 82.9k, more than the heavy single spec read it also did (~21k) and far past a naive "~6k for all six files" estimate. The driver is the cumulative finding volume rendered as text, not the file count. **Size writes by total content words, and when the inflated figure crosses 70k, split artifact production across workers** (e.g. a findings-writer leaf separate from the list/manifest writer) so no single session renders the whole set. Finding-count is the input that scales this — budget it against the re-audit's actual tally, not a per-file constant.

## 6. Two worked session-shape estimates

### Shape A: ROOT dispatching chunkers in Stage 2

Assumptions: ROOT picks up a Stage 2 handoff, reads the launch plan + memory, loads meta-agent tools, dispatches chunkers in one assistant turn with inline briefs, then polls them via filesystem (not via list_spawned_sessions).

A naive "read everything, then dispatch six" ROOT:

- Existence: 30k
- Read launch plan (~250 lines): 9k + 76 × 250 ≈ 28k
- Read memory index + 2-3 relevant memory files (~150 lines combined): ≈ 9k + 76 × 150 = 20.4k
- Meta-agent schema load: 10k
- Six spawn_session calls in one turn, each with ~1k brief payload: 6 × (5k + 1k) = 36k

Subtotal after dispatch: 30k + 28k + 20k + 10k + 36k = 124k — nearly double the 70k switch target, before any polling.

The fix is to stop making the dispatcher also be the reader. A **dedicated dispatcher** carries only a lean inline brief (no full launch-plan read, no memory reads) plus the schema, then fires spawns:

- Existence: 30k
- Lean inline brief in the handoff prompt (~5k): 5k
- Meta-agent schema load: 10k

That is 45k of fixed cost, leaving 25k of headroom to 70k. At ~6k per spawn, the headroom rule trips after ~4 spawns (4 × 6k = 24k → lands at 69k; a 5th would hit 75k). A planning ROOT that also reads a spec or memory file first has essentially no room left to spawn — it should hand the dispatch to a dedicated dispatcher rather than fire spawns itself. So: for a 30-chunker Stage 2, plan for roughly **8–10 dispatcher handoffs** (or split dispatch across parallel dispatcher sessions), and never let a single ROOT both read context and dispatch a large batch. Those counts are floors: apply the section 8 multiplier and a dispatcher the floor says could fire four spawns should be planned for three, so a 30-chunker Stage 2 needs closer to 10–12 dispatcher handoffs.

### Shape B: Planning conversation reading spec docs and producing a 5k-word handoff

Assumptions: a planning ROOT reads BA1 spec docs (dense ~25-word-line markdown), exchanges ~6 turns of discussion with the product owner (each turn ~300 words from them + similar from ROOT), then produces a 5k-word handoff document by Write.

Reading **one** 200-line spec and writing the handoff:

- Existence: 30k
- Spec read 1 (200 lines): 9k + 76 × 200 = 24.2k
- 6 discussion turns (~300 words user + 300 words assistant ≈ 1.5k each): 6 × 1.5k = 9k
- Write the 5k-word handoff (the cost is the content rendering as assistant output, ~2.5 tok/word × 5,000 ≈ 12.5k for the turn that emits it)

Subtotal: 30k + 24.2k + 9k + 12.5k = 75.7k — over the 70k target by ~6k. Even a single-spec planning session tips over once it also writes a long handoff. Patterns to stay under 70k: write a **lean** handoff (~2k words ≈ 5k, landing at ~68k), or do not read the spec in this session at all — discuss from memory and hand the spec to the successor, which reads it fresh against a clean baseline. Reading a *second* spec is out of the question: a 350-line spec needs 9k + 76 × 350 = 44.6k (split across two Read calls, since it exceeds the 25k-token cap) and blows the ceiling on its own. So: **at most one spec read per planning session, paired with a lean handoff.**

### Shape C: An orchestrator that runs two pipeline legs in one session — the unclosed seam

A coordinator session is sized for **one** leg: one fan-out wave at the 3-spawn cap, then a handoff at its seam. The failure mode is running a *second* leg in the same session — most often after an idle-resume reactivates the spent session instead of spawning a fresh successor for the next leg. The two legs' Messages growth then sums into one bucket.

Worked failure. A Tracer Lead ran leg (a) — 3 slice-reader spawns + 1 successor handoff spawn — then idle-resumed and ran leg (b) — 3 partial-Merger spawns + 1 successor handoff spawn — in the *same* session. That is ~8 self-contained spawn payloads, plus a manifest read with repo-wide search carried in both legs, plus the idle-resume paste re-injecting full disk state. Result: Messages 52.4k → total 81.6k, ~6.6k over the tripwire. A sibling session that ran only its single merge leg landed at 69.9k — right at target.

The fix is structural, not a cost-anchor change: **close the session at the seam.** Each leg must run on its own clean 30k baseline. On idle-resume, spawn a *fresh* successor for the next leg rather than reanimating the spent instance — the pipeline's own 3-spawn-cap + handoff design already intends this; the trip comes from not honoring it. Two estimates that are each safe in isolation are not safe summed: never budget a coordinator for more than one leg, and never let resume logic add a second leg to a session that already spent its budget on the first.

## 7. Upper-bound bias caveat

Most per-action anchors in section 4 were measured in a protocol where the user pasted a /context screenshot between every step. That paste lands in the Messages bucket and adds 3-5k to each measured delta. So:

- Cleanly-measured anchors: file-read per-line slope (76 tok/line) and the 25k/256KB Read caps. These come from the multi-point linear fit and the tool's hard refusal, neither of which is paste-confounded.
- Upper-bound anchors: everything else — Bash floor, ToolSearch overhead, spawn-cycle per-stage, user-message per-word. True costs in production sessions (where there are no /context pastes between steps) are roughly 30-60% lower for short actions.

How to use the upper-bound numbers anyway: they are conservative. Estimating high means handing off earlier, which is the safe direction. If you find yourself crowded against the 70k switch target with budget left only because you trusted upper-bound anchors, re-estimate that specific action with a 0.5× factor and decide whether to proceed.

## 8. The variance multiplier — your estimate is a floor

The `Σ (action × cost)` sum totals the clean, happy-path action list: the reads, spawns, and writes you can name in advance. Real runs always exceed it. The same action list, run for real, picks up:

- Re-reads — a doc read once, then reached for again after the thread of it is lost.
- Error recovery — a failed tool call, a retried spawn, a correction round.
- Oversized worker payloads — a child returns 3k where the plan assumed 200 tokens.
- Unplanned exploration — a Glob, Grep, or Read to resolve something the plan did not foresee.

Section 1 already names the cause: noise, not raw token count, is the primary failure mode, and BA1 sits at the fast end of that curve. So the floor sum is not the expected burn — it is the best case you will rarely hit.

Plan against the inflated figure instead: `planned_total ≈ 30k + 1.5 × Σ (action × cost)`.

The multiplier rides on the growth only; the 30k baseline is clean, start-pinned context that does not inflate. **Size every count you control — spawns per dispatcher, phases before a handoff, reads per planning session — so the inflated total stays under 70k, not the floor.** Worked the other way: if the floor says a dispatcher could fire four spawns before the headroom rule trips, the multiplier says plan for three and hand off.

The 1.5× is the current working figure, not a measured constant. The first full coordinator run measured end to end exposed where it holds and where it does not:

- Where the floor action list was **complete**, 1.5× was about right or even conservative: a Tap whose burn was one cleanly-measured 675-line read came in at 89.8k against a ~90k prediction — accurate, because the read anchor is trustworthy and nothing was missing from the list.
- Where the floor action list was **incomplete**, 1.5× did not save the estimate — because a multiplier on a missing line is still zero. The Reader was rated ~74k inflated and ran to 111.6k; the gap was not variance, it was an action type left off the floor entirely (the six-artifact write was budgeted at a flat ~6k instead of by content volume — see the write formula in section 5). The same pattern hit long-lived glance-loop orchestrators whose per-wakeup prompt re-injection and status recaps were never on the action list at all.

Lesson: **the multiplier covers slop on actions you named, not actions you forgot.** Before trusting 1.5×, confirm the floor list includes every write (sized by content words), every scheduled-wakeup re-injection, and every leg the session will run. A complete-but-floor list inflated by 1.5× is sound; an incomplete list inflated by any multiplier is not. Until a clean coordinator run with a complete action list re-measures the constant, treat 1.5× as the deliberate margin between the floor you can compute and the burn you will actually see — and treat a missing anchor as the larger risk.

## 9. Prompt-plan alignment — make the planned action the natural action

A plan can say a role never reads the raw input and still watch that role read it — when the kickoff prompt hands it the input path and says "run the resolution." The agent follows the prompt in front of it, not a rule buried in a role doc it may never re-read. When prompt and plan disagree, the prompt wins, and the budget written against the plan is already wrong by the third move.

**The spawn or kickoff prompt must not put in front of an agent any input the plan says it must not consume.** If the plan says a coordinator works from a brief and never touches the raw 200-line input, the prompt hands it the brief — not the input path. Do not rely on a "do not read X" instruction to hold against an X sitting in the prompt; take X out of the prompt instead. Make the cheap, planned action the natural one — the one the prompt makes easiest — so staying under budget never depends on an agent resisting a temptation you placed in front of it.

This is the design-side complement to keeping pipeline agents context-unaware. The agent never monitors its own budget, so the plan and the prompt must carry that work for it, decided up front by whoever authors them.
