# plan-authoring — reference

The single source of truth for cost physics, the budget formulas, the structural toolkit, and the red-flag list. Every cost number lives here and nowhere else — the entry card and the sizing worksheet point at this file; they never re-type a figure. "Growth" everywhere below means **Messages-bucket growth**: only the Messages bucket grows meaningfully during work; the other `/context` buckets are roughly fixed once the session starts.

---

## Cost anchor table (the canonical numbers)

This table is canonical. No other doc re-types these numbers — they reference this table.

```
| Action / tool                                                              | Cost                                  | Notes                                                                                                                                              |
| ---                                                                        | ---                                   | ---                                                                                                                                                |
| Read (file, ~25-word-line markdown, 50-300 lines)                          | ~9k + 76 tok/line                     | Linear fit `tokens(N) ≈ 8.76k + 75.9 × N`. The ~9k is a per-call floor — N separate reads = N floors (reads don't amortize); see Floor rules.     |
| Read content cap                                                           | 256KB file size OR 25k tokens per call| Larger files need offset+limit reads                                                                                                              |
| Bash, trivial (e.g., echo)                                                 | ~1.2k upper bound                     | Marginal per-call; real Bash usually costs more from result output                                                                                |
| ToolSearch, deferred-tool load                                             | ~2.5k per tool, batched               | Batch as many tools as you'll need into one ToolSearch call                                                                                       |
| mcp__nimbalyst-meta-agent (schema bundle: spawn + status + result)         | ~10k, one-time                        | Loaded once per session that does any meta-agent work                                                                                             |
| spawn_session call                                                         | ~5k + brief payload size              | Brief payload dominates for non-trivial briefs                                                                                                    |
| get_session_status poll                                                    | ~4k upper bound                       |                                                                                                                                                  |
| get_session_result, trivial child                                         | ~6.5k + child output                  | Scales with child's returned payload                                                                                                              |
| User message, dense English prose                                          | ~2.5 tok/word                         | Upper bound; cleaner prose runs lower                                                                                                             |
| User message, "ok"-shape ack                                               | ~5k turn overhead                     | Per-turn overhead dominates short messages                                                                                                        |
| Write / artifact output (assistant-emitted file content)                   | ~2.5 tok/word of rendered content     | The written content renders as assistant output; a multi-artifact write is the same cost as a paste of that text. Do NOT budget a flat per-file figure — scale by total content volume. See Write formula. |
```

### Existence baseline decomposition

Empty baseline session, no work performed. The baseline is now **model-specific**, and it is measured as **loaded context only** — the `/context` headline "used" figure, which EXCLUDES the deferred name-only tool catalog. Measured on an empty "say hi" session:

- **Haiku 4.5 — \~38.6k loaded.** system prompt ~8.9k + system tools (eager) ~18.2k + eager MCP ~4.2k + memory ~1.5k + skills ~1.9k + messages ~4k. No autocompact reserve.
- **Opus 4.8 — \~40k loaded.** system prompt ~5.7k + system tools (eager) ~18.8k + eager MCP ~5.6k + memory ~2k + skills ~2.6k + messages ~5.5k. No autocompact reserve.
- **Sonnet 5 — \~52k loaded, plus a silent \~33k autocompact buffer** reserved on top. system prompt ~12.2k + system tools (eager) ~24.1k + eager MCP ~5.6k + memory ~2k + skills ~2.6k + messages ~5.6k.

The deferred tool catalog is **not** in these figures and is **not** counted against the 70k target or the 75k tripwire. It is a name-only, start-pinned list of available-but-unloaded tools — Haiku ~29.7k, Opus ~34.7k, Sonnet ~36.7k (deferred MCP + deferred system tools). The tripwire enforces the LOADED headline, not an all-buckets sum: the hi-test loaded figures (38.6k / 40k / 52k) did not trip, whereas an all-buckets count (Opus ~75k, Sonnet ~89k) would trip instantly. Loading a deferred tool via ToolSearch does NOT shrink the deferred catalog; it copies that one schema into the Messages bucket as a tool result — clean, start-pinned context, so it costs budget but little quality.

The driver is the **platform harness** — the Claude Code system prompt and its built-in (eager) system tools — which is what makes the baseline both large and model-specific. It is not Nimbalyst's MCP tool catalog: that catalog is deferred and stays out of the loaded figure, which is what keeps the baseline off ~75-90k.

### Model choice — prefer the lighter baseline for lean workers

Because the baseline is model-specific, the model you pick moves worker headroom directly. **Opus 4.8 is the preferred model for lean workers:** it carries ~30k of working headroom to the 70k target and reserves no autocompact buffer. **Sonnet 5 starts heavier** — ~52k loaded vs Opus's ~40k, and it silently reserves a further ~33k — cutting its headroom to ~18k; treat it as tight and avoid it for lean, budget-sensitive roles. Haiku 4.5 is the lightest of the three (~38.6k, no reserve), so it is an option where a task genuinely fits a smaller model, but Opus is the default lean-and-capable pick. This is a finding-grounded recommendation, not a hard mandate.

---

## The thresholds

- **70k — switch target.** The line you design against; aim to hand off before exceeding it.
- **75k — hard stop.** A tripwire forces a handoff here. The 70k target sits deliberately 5k inside this stop — an intentional buffer. An orchestration sized against 70k absorbs its normal slop without tripping the forced handoff. Treat the 5k as safety margin, not budget to spend.
- **55k — calm nudge.** A non-blocking heads-up that wrap-up runway has begun. The 55k→70k span is wrap-up runway, not stolen budget. When it fires, finish tidily — do NOT rush, truncate, or cut quality.
- **Existence baseline — model-specific, loaded by the platform at session start, not by your work.**
  - **Haiku 4.5: \~38.6k** → ~31k working headroom to the 70k target; no autocompact reserve.
  - **Opus 4.8: \~40k** → ~30k working headroom to the 70k target; no autocompact reserve.
  - **Sonnet 5: \~52k** → ~18k working headroom, plus a silent ~33k autocompact reserve on top — tight for lean workers.

---

## Formulas

### Headroom rule (the one rule the author applies while sizing)

```
headroom = 70k − current_total_context
```

> Before taking the next action, estimate its cost from the table above. If `estimated_cost > headroom`, hand off first — do not take the action and hope. Handoffs are cheap; drift is expensive.

Worked example: mid-session at total=50k, need to read a 200-line dense markdown plan. file-read ≈ 9k + 76 × 200 = 24.2k. headroom = 70k − 50k = 20k. 24.2k > 20k → hand off.

### File-read formula

```
read_cost(N) ≈ 9k + 76 × N        (for ~25-word-line markdown, valid 50–300 lines)
```

Worked example: reading a 150-line plan doc ≈ 9k + 76 × 150 = 20.4k. (Sanity check: a 150-line read in calibration measured 17.9k, within the upper-bound band.)

Hard caps: a single Read call refuses files above **256KB OR above \~25k tokens** of content. For dense ~25-word-line markdown that ceiling lands near ~300 lines per call. Above that, split with offset+limit.

### Spawn-cycle formula

```
spawn_cycle_cost ≈ 10k schema + 5k spawn + 4k poll + 6.5k result ≈ 25.6k
   (one full cycle: schema load + spawn + 1 status poll + result fetch, child ≤200 tokens)

per_extra_spawn ≈ 5k spawn + 4k × P polls + (6.5k + child_payload_size) result
   (N-th spawn after the first; schema 10k amortizes — skipped on every additional spawn)
```

P = number of status polls taken on that child before fetching its result.

Worked example: a second spawn in the same session, polled twice, child returns 1k of output: `5k + 4k × 2 + 6.5k + 1k = 20.5k`.

### User-message formula

```
user_msg_cost ≈ 5k turn overhead + 2.5 × words
```

Short acks are dominated by overhead; long pastes by per-word cost. Worked example: a 5k-word document paste ≈ 5k + 2.5 × 5,000 = 17.5k.

### Deferred-tool load formula

```
tool_load_cost ≈ 7k ToolSearch overhead + 2.5k × tools_in_batch
```

One tool ≈ 9.5k. Four tools batched ≈ 17k. Two separate ToolSearch calls of 2 tools each ≈ 24k. Batch aggressively.

### Write / artifact-output formula

```
write_cost ≈ 2.5 × words_of_rendered_content     (summed across every artifact the session emits)
```

A write costs the same as a paste of the same text: the content renders as assistant output. There is no cheap flat per-file rate — a session writing six artifacts pays for the full word-volume of all six, not six small fixed charges.

Worked example: a Reader leaf writing six artifacts for a re-audit with ~35 findings (findings.md + reference/surface/closed/collected lists + manifest) emitted on the order of ~78k of growth — Messages reached 82.9k, more than the heavy single spec read it also did (~21k) and far past a naive "~6k for all six files" estimate. The driver is cumulative finding volume rendered as text, not file count. **Size writes by total content words; when the inflated figure crosses 70k, split artifact production across workers** (e.g. a findings-writer leaf separate from the list/manifest writer). Finding-count is the input that scales this — budget against the re-audit's actual tally, not a per-file constant.

### Floor math

```
floor ≈ baseline + Σ (action × cost)
```

Pull cost values from the anchor table above. The baseline term is the model-specific existence figure from The thresholds — Opus ~40k (the default lean worker), Haiku ~38.6k, Sonnet ~52k.

---

## Floor rules — reads don't amortize

The ~9k overhead is a *per-call* floor, paid once for every separate Read. Unlike the meta-agent schema (which amortizes — charged once per session), there is no shared-floor discount for later reads: four Read calls carry four ~9k floors. A fan of small files is priced by **floors × file-count, not by total content**. When a prompt hands a worker several input paths, count one floor per path.

Worked example (the four-floor trap): a slice-reader leaf was handed five reads — its 125-line slice plus four batch-wide lists of 97 / 41 / 27 / 28 lines. By content the four lists are only ~193 lines, which one pooled read would price near `9k + 76 × 193 ≈ 24k`. But as four separate Read calls they cost `(9k+76×97)+(9k+76×41)+(9k+76×27)+(9k+76×28) ≈ 50.7k` — four floors, more than double the pooled figure. Sized as one ~4k partition, the leaf was budgeted ~25k and instead ran to ~52k Messages, tripping the wire. **Fix when floor count pushes the inflated figure over 70k: collapse the fan** (concatenate N files into one so the worker does a single read of the same content) **or split the reads across more workers** (one leaf per file-subset). Same content, fewer floors per session; never read less.

---

## The variance multiplier — your estimate is a floor

```
planned_total ≈ baseline + 1.5 × Σ (action × cost)
```

The `Σ (action × cost)` sum totals the clean, happy-path action list: the reads, spawns, and writes you can name in advance. Real runs always exceed it. The same action list, run for real, picks up:

- **Re-reads** — a doc read once, then reached for again after the thread is lost.
- **Error recovery** — a failed tool call, a retried spawn, a correction round.
- **Oversized worker payloads** — a child returns 3k where the plan assumed 200 tokens.
- **Unplanned exploration** — a Glob/Grep/Read to resolve something the plan did not foresee.

Cause: noise, not raw token count, is the primary failure mode, and agentic pipeline work sits at the fast end of that curve. So the floor sum is the best case you will rarely hit, not the expected burn.

**The multiplier rides on the growth only; the existence baseline is clean, start-pinned context that does not inflate.** **Size every count you control — spawns per dispatcher, phases before a handoff, reads per planning session — so the inflated total stays under 70k, not the floor. Worked the other way: if the floor says a dispatcher could fire four spawns before the headroom rule trips, the multiplier says plan for three and hand off.**

**1.5× is the current working figure, not a measured constant.** First full coordinator run findings:

- Where the floor action list was **complete**, 1.5× was about right or conservative: a Tap whose burn was one cleanly-measured 675-line read came in at 89.8k against a ~90k prediction — accurate.
- Where the floor list was **incomplete**, 1.5× did not save it — a multiplier on a missing line is still zero. The Reader was rated ~74k inflated and ran to 111.6k; the gap was an action type left off the floor entirely (the six-artifact write was budgeted at a flat ~6k instead of by content volume). Same pattern hit long-lived glance-loop orchestrators whose per-wakeup prompt re-injection and status recaps were never on the action list.

**Lesson:** the multiplier covers slop on actions you *named*, not actions you *forgot*. Before trusting 1.5×, confirm the floor list includes every write (sized by content words), every scheduled-wakeup re-injection, every leg the session will run, and every multi-file read counted by its true per-file floor (N files = N floors). A complete-but-floor list inflated by 1.5× is sound; an incomplete list inflated by any multiplier is not. Treat a missing anchor as the larger risk.

---

## Upper-bound bias caveat — trust the table loosely vs. tightly

Most anchors were measured in a protocol where the user pasted a `/context` screenshot between every step. That paste lands in Messages and adds 3–5k to each measured delta. So:

- **Cleanly-measured anchors (trust tightly):** the file-read per-line slope (76 tok/line) and the 25k/256KB Read caps. These come from the multi-point linear fit and the tool's hard refusal — neither is paste-confounded.
- **Upper-bound anchors (trust loosely):** everything else — Bash floor, ToolSearch overhead, spawn-cycle per-stage, user-message per-word. True production costs (no `/context` pastes between steps) are roughly **30–60% lower** for short actions.

How to use them anyway: they are conservative. Estimating high means handing off earlier — the safe direction. If you find yourself crowded against the 70k target with budget left only because you trusted upper-bound anchors, re-estimate that specific action with a **0.5× factor** and decide whether to proceed.

---

## Session shapes — A / B / C

These worked session-shapes show the structural rules. A and B are the "don't read heavy to dispatch / don't read heavy then write heavy" lessons; C is the "close the session at the seam" lesson.

### Shape A — ROOT dispatching chunkers (don't make the dispatcher also the reader)

A naive "read everything, then dispatch six" ROOT (Opus default baseline):

- Existence (Opus): 40k
- Read launch plan (~250 lines): 9k + 76 × 250 ≈ 28k
- Read memory index + 2–3 memory files (~150 lines combined): ≈ 9k + 76 × 150 = 20.4k
- Meta-agent schema load: 10k
- Six spawn_session calls, each ~1k brief: 6 × (5k + 1k) = 36k
- **Subtotal after dispatch: 40k + 28k + 20k + 10k + 36k = 134k** — nearly double the 70k target, before any polling.

Fix — a **dedicated dispatcher** carrying only a lean inline brief (no full launch-plan read, no memory reads) plus the schema, then fires spawns:

- Existence (Opus): 40k
- Lean inline brief in handoff prompt (~5k): 5k
- Meta-agent schema load: 10k
- = 55k fixed cost, leaving 15k headroom. At ~6k/spawn, the headroom rule trips after ~2 spawns (2 × 6k = 12k → 67k; a 3rd hits 73k).

A planning ROOT that also reads a spec or memory file first has essentially no room to spawn — hand dispatch to a dedicated dispatcher. On the heavier model-specific baseline a dedicated dispatcher fires only ~2 spawns before the headroom rule trips, so a 30-chunker Stage 2 needs ~15 dispatcher handoffs (floor) → with the multiplier, more — which is why a batch this size uses the sub-dispatcher fan-out primitive rather than one dispatcher chained through the whole roster. Never let a single ROOT both read context and dispatch a large batch.

### Shape B — Planning conversation reading spec docs + producing a 5k-word handoff

Reading ONE 200-line spec and writing the handoff (Opus default baseline):

- Existence (Opus): 40k
- Spec read 1 (200 lines): 9k + 76 × 200 = 24.2k
- 6 discussion turns (~300 words user + 300 assistant ≈ 1.5k each): 6 × 1.5k = 9k
- Write 5k-word handoff: ~2.5 tok/word × 5,000 ≈ 12.5k
- **Subtotal: 85.7k** — past even the 75k hard stop. On the heavier baseline the spec read (24.2k) plus six discussion turns (9k) alone reach ~73k on a 40k Opus base — over target before a single handoff word is written.

Patterns to stay under 70k: **do not read the spec this session at all** — discuss from memory and hand the spec to the successor, which reads it fresh against a clean baseline. If the spec must be read live it now owns the whole session: spec (24.2k) plus a lean pointer-handoff (~2k words ≈ 5k) on the 40k base ≈ 69.2k, leaving essentially no room for discussion — so a live-spec session is a read-and-handoff session, not a discussion one. A *second* spec is out: a 350-line spec needs 9k + 76 × 350 = 44.6k (split across two Read calls, over the 25k-token cap) and blows the ceiling alone. **Rule: never pair a live spec read with both a real discussion and a long handoff in one planning session — the model-specific baseline no longer leaves room for all three.**

### Shape C — Orchestrator running two pipeline legs in one session (the unclosed seam)

A coordinator is sized for ONE leg: one fan-out wave at the 3-spawn cap, then a handoff at its seam. Failure mode: running a *second* leg in the same session — most often after an idle-resume reactivates the spent session instead of spawning a fresh successor. The two legs' Messages growth sums into one bucket.

Worked failure: a Tracer Lead ran leg (a) — 3 slice-reader spawns + 1 successor handoff spawn — then idle-resumed and ran leg (b) — 3 partial-Merger spawns + 1 successor handoff spawn — in the *same* session. ~8 self-contained spawn payloads + a manifest read with repo-wide search carried in both legs + the idle-resume paste re-injecting full disk state. Result: Messages 52.4k → total 81.6k, ~6.6k over the tripwire. A sibling that ran only its single merge leg landed at 69.9k — at target.

Fix (structural, not a cost-anchor change): close the session at the seam. Each leg runs on its own clean model-specific baseline (~40k for the default Opus worker). On idle-resume, spawn a fresh successor for the next leg rather than reanimating the spent instance. Two estimates each safe in isolation are not safe summed: never budget a coordinator for more than one leg.

---

## Prompt-plan alignment — make the planned action the natural action

A plan can say a role never reads the raw input and still watch that role read it — when the kickoff prompt hands it the input path and says "run the resolution." The agent follows the prompt in front of it, not a rule buried in a role doc it may never re-read. **When prompt and plan disagree, the prompt wins**, and the budget written against the plan is already wrong by the third move.

**The spawn or kickoff prompt must not put in front of an agent any input the plan says it must not consume.** If the plan says a coordinator works from a brief and never touches the raw 200-line input, the prompt hands it the brief — not the input path. Do not rely on a "do not read X" instruction to hold against an X sitting in the prompt; take X out of the prompt instead. Make the cheap, planned action the natural one — the one the prompt makes easiest — so staying under budget never depends on an agent resisting a temptation you placed in front of it.

This is the design-side complement to keeping pipeline agents context-unaware. The agent never monitors its own budget, so the plan and prompt must carry that work for it, decided up front by whoever authors them.

---

## Why 70k works

Claude agents do not degrade at a single cliff. Across long-context benchmarks (Fiction LiveBench, NVIDIA RULER, Databricks RAG, Chroma's "context rot" study), quality slides *continuously* as input grows — measurable decline begins somewhere in the 16k–64k range, and the practical "good" working band lands around 60k–80k total context. No safe 120k plateau; a 200k/1M window is not 200k of usable thinking. Two findings drive the 70k target:

1. **Noise — not raw token count — is the primary failure mode** for coding/agentic sessions. Search, exploration, spawning, backtracking accumulate tool-call debris that degrades every later output. Agentic pipeline work sits at the *fast* end of the curve.
2. **Position matters: context is retrieved best at the very start and end, worst in the middle.** The model-specific existence baseline (~40k on Opus, up to ~52k on Sonnet) is clean and start-pinned, so it costs little quality; the working growth piled on top is what rots.

This playbook sets 70k as a deliberately conservative stop inside the 60k–80k band. A session's total context = sum of all `/context` buckets (Messages, System prompt, System tools, MCP tools, MCP tools deferred, Memory, Custom agents, Skills, Misc). **Only the Messages bucket grows meaningfully during work**; the others are roughly fixed once the session starts. So "growth" in every formula means Messages-bucket growth.

---

## Translation patterns

Convert a sizing or resolution decision into a bare instruction. Left = what the agent must NEVER be told; right = what the doc says instead.

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
| "start the plan / review the plan and begin" | "read only this contract and `wave-0-brief.md`, then spawn the window-resolver leaf" (the cold-start is bounded and closed) |

The shape is always the same: replace an open-ended, budget-conditional, or unresolved action with a finite, named, bounded, already-resolved one.

---

## The structural toolkit (proven primitives)

The bare-instruction vocabulary that keeps a session under budget and off the improvising path. Reach for these when translating.

- **Lead-never-reads-heavy.** A coordinator reads only its light startup set, compact digests, and disk markers — never the corpus, a full handoff, or leaf/merged findings. Disk glances are existence checks (Glob), not content reads.
- **Lean boot owner.** The first session — the one a human boots by pointing at the plan and typing "start this" — is a coordinator, not an author. It reads only the cold-start contract's bounded startup set, then dispatches; every heavy read the launch needs (resolving line windows, digesting the audit, distilling briefs) goes to a disposable worker it spawns. The boot owner never reads the corpus, the findings, or the whole plan to get going. The contract that scopes it lives at the top of the plan, ahead of the body.
- **Spawn cap + successor instance.** A session spawns at most a fixed number of children; beyond the cap it hands to a fresh successor instance of itself via the disk-marker survival pattern (fire-and-forget spawns + schedule_wakeup + marker glances). The count is fixed in the doc; the agent never tallies it against a budget.
- **Fold cap + staged reducers.** A reducer folds at most a fixed number of findings files; more than that means staged partial reducers feeding a final one. Bounds reads per session, because every read costs a fixed floor regardless of file size.
- **Brief / digest / marker, never raw.** Workers consume compact, bounded artifacts the prior stage wrote for them. The expensive source is read once, by the single disposable worker scoped to it.
- **Phase = one session, broken at a wait.** Each phase is scoped to a single session and ends at a natural wait — a child running, a marker pending. The phase boundary is a fixed handoff seam: the agent hands off because the step says to, not because it measured anything.
- **One leg per session — a seam is a wall, not a pause.** A single session runs exactly one pipeline leg and then closes. When a session reaches its handoff seam, it spawns a *fresh successor instance* to carry the next leg — it never reanimates itself to do more work. Holds across idle-resumes especially: a session resumed after going idle mid-pipeline must verify its leg is complete and hand off, not pick up a second leg (a fan-out leg followed by a merge leg in one session is the canonical two-legged overrun). Author the resume branch explicitly: the step a resumed session lands on says "confirm your leg's markers are down, then hand off to a fresh successor for the next leg" — never "continue." Each leg runs on its own clean baseline.
- **Bounded read over an unbounded input.** When an input has no size ceiling (a handoff, an archive), tell the worker to match and read only the tagged lines, not the whole file — bounded no matter how large the input grew.
- **Count the read floor per file, not per byte.** Each read costs a fixed floor regardless of file size, so breadth is as dangerous as bulk: a session told to consult six registers pays six floors before a single content line, and that fan alone can carry it over the wire even when no one read is large. When sizing, multiply the floor by the number of distinct files a session reads, not just their summed length. Fix: pre-distill the fan into one compact notes artifact upstream — the worker reads that single brief, not the six live sources. Never place several source paths in front of a worker and trust a "read selectively" instruction to hold; the paths in the prompt are what it consumes.
- **Glance-read carve-out.** The ~9k read floor is the default for any substantive read. It deliberately over-counts three narrow read classes whose measured cost is ~3k rather than ~9k: (1) a marker/stamp read — a single value such as an audit-pass count; (2) a tiny standing-state file of ≤25 lines, e.g. the 9-line audit ledger; (3) a compact digest an upstream stage wrote to be read compact — a blank-tally, pattern digest, drift roll-up, or a short scoped prose brief/summary one stage writes for the next to consume, so long as it stays purpose-built and compact and never stands in for reading the raw doc. Price each at ~3k. Bounded two ways so the fan cannot creep: it covers ONLY those three named classes (any other read pays the full floor), and a single session may stack AT MOST 8 glance-reads. More than 8 glance-reads — or any non-class read consumed more than once — is a read-fan that must be pre-distilled into one brief, not glance-priced.
- **Every lookup the worker needs is in its brief.** A "read at most N inputs, nothing else" cap is defeated the instant a step depends on something not in those inputs (a canonical catalog, a code list), because the worker must then explore to find it — and that off-cap hunt is the overrun. Resolve every such dependency at authoring time and inline it (or hand it as a pre-resolved capped input) so the only reads available are the cheap planned ones.
- **Slice an oversized single read across leaves.** When one read is too large for a session's budget even alone (a several-hundred-line index range distilled inside a read-then-dispatch session is the textbook case), do not leave it in a session that also does other work, and do not just move it to one leaf — a read that exceeds one leaf's budget overruns the leaf too. Slice the oversized source across multiple disposable reader leaves with a merge, or shrink the per-batch range, so no single session owns the whole read. Keep the dispatching session pure dispatch.
- **Resolve-then-inline.** Every pointer, name, or ID a step depends on is resolved by the author while authoring and written into the step as its concrete target. The agent reads a path; it never derives one.
- **Pinned failure branch.** Every step that can come back empty, ambiguous, or missing carries the response the author chose (stop-and-record, take-the-first, take-the-highest), written into the step. Decided by the author; never left to the agent's judgment.
- **Complete brief.** A worker's brief holds everything its steps name — the paths, ranges, decisions already made — so the worker reads only what the brief points to and supplies nothing of its own.
- **Sub-dispatcher fan-out.** No single head fans out a whole roster. When a head must dispatch more items than its spawn cap, interpose sub-dispatchers: the head spawns 2–3 sub-dispatchers, each owning a contiguous slice of the roster and fanning out only its slice, mirroring the spawn-cap-plus-successor pattern. A roster of N items at spawn cap C uses ceil(N ÷ C) leaf spawns, grouped under ceil(that ÷ C) sub-dispatchers, recursing until one head spawns the top tier.

### Cross-session role split (folds onto the primitives above)

A multi-session run splits into three role shapes, each **retiring on a fixed integer count set in planning** — never on a felt threshold. The split is the cross-session expression of three primitives above:

- **Spawner** → **spawn cap + successor**, in its pure form. Fires its children and retires. Does not wait.
- **Collector** → **phase / waiter**. Does the waiting — by counted `Glob`-glances for disk completion-flags, never by polling a child for status.
- **Doer** → **one leg** (one fixed quantum of work, then retire).

Rationale to preserve: **waiting is what bloats a session.** A session told to launch a team and then *wait* by polling `get_session_status` in a loop bloated to 182k — each status reply piled onto context. Separating the waiter from the spawner keeps that cost off both: the spawner is already gone, and the collector's glances are existence checks, not content reads.

**Child-to-disk offload.** When a planning sub-task is context-expensive — enumerating many files, large-doc skims, multi-stage recon — it does NOT run in the parent planning session. A child runs it, writes its deliverable to a stable on-disk path; a successor session reads that artifact fresh and continues the larger thread. Spawn cost, poll cost, and the child's output never land in any single session's budget. Constraints:

- Use only when the child's deliverable is **reusable across sessions** (a report, map, digest) — not for a one-shot side errand.
- The child's brief is **self-contained**: it won't see the parent's context, so the brief restates goal, constraints, output format, and the disk path.
- The parent **retires at the spawn**; it does not poll-then-synthesize.

**Waiter mechanics & teardown order.** A disk-glance waiter (the Collector) has two non-obvious properties that drive teardown:

- It must hold its loop open with a **real `schedule_wakeup`**, not passive idling. The wakeup carries the orchestration forward between glances.
- It reads a flag's **absence** as a signal too. So **teardown order matters**: deleting a live orchestrator's expected wait-flags or scratch while it's still on its loop makes its next wake read "flag missing" as failure and spuriously re-run the whole pipeline. An orchestrator is **stood down and confirmed idle BEFORE its flags are deleted** — never while it can still wake.

The context tripwire is the hard backstop; the counts, offloads, and role splits above are what keep a session from ever drifting there.

---

## Red flags — what must never appear in a produced role doc

If the doc contains any of these, it is not finished:

- a token number, a "k" figure, or any context/budget arithmetic;
- the words "context," "budget," "70k," "tripwire," or "token" used to direct the agent's behavior;
- "check / watch / estimate your context," "hand off when full," "if you're running low";
- a "why we do this" rationale of any kind — the agent acts on the rule, never on its reason;
- an unbounded loop ("until done," "as many as needed") where the safety depends on a count;
- a kickoff prompt that hands a worker the raw input the plan says it works a brief from;
- a plan a human or successor boots by pointing at it, with no closed cold-start contract — a first session told (in effect) to "absorb the plan and begin," or one that reads the inputs, the audit, or the full plan to launch instead of dispatching that reading to a worker;
- a step that says "resolve," "look up," "find," "figure out," "determine," "decide," "handle," "as appropriate," or "as needed" — each names a decision you failed to make;
- an input referred to by description ("the right transcript," "the slice file") instead of by a concrete path;
- a lookup or transform written as a step with no inlined result and no proof it returns exactly one answer;
- a step with a single happy path and no branch for what happens when it comes back empty, ambiguous, or missing;
- a mechanic defined or justified by reference to another role's or wave's behaviour ("mirroring the map-build wave," "same as the X pass") instead of spelled out in full here — it makes the agent read a doc this card told it to skip (a genuine handoff to the next leg's card at a phase seam is not this);
- a line whose only audience is a human — orientation prose, a description of what another role does, a restatement of the pipeline shape, a narration of the flow — anything the executing agent takes no action on (a single opening frame of *this* role itself is not this).

The context-tripwire hook is a safety belt, not the control; if the structure is right, no session reaches it. There is no equivalent belt for improvisation — the only thing standing between a step and a guess is whether you closed it here.

---

## Worked micro-examples

**The cost overrun.** A dispatcher that both reads its sizing input and fires a large batch of spawns overruns — a reader-plus-large-dispatcher session inflates past 70k well before the batch is out. So the structure splits the two jobs.

- **Bad (leaks + overruns):** "Read the wave plan, then spawn one worker per slice until all slices are dispatched, watching your context as you go."
- **Good (bare + finite):** the Lead's doc says "Spawn the wave-owner with the slice list inline." The wave-owner's doc says "Spawn the first six slice-workers from the list below. After the sixth, hand off to your successor instance to spawn the rest." Neither doc names a budget; the fixed counts make the budget hold.
- **Prompt-plan alignment on the same example:** the wave-owner's spawn prompt hands each slice-worker its **one slice file and line range** — not the corpus path — so the cheap planned read (one slice) is the only read available to it.

**The unresolved lookup.** The content-side twin of the overrun. A plan hands a worker a roster of pointers and tells it to find the file each one names. The author assumed the lookup resolves cleanly; at run time each pointer matches fifty files, the step carries no branch, and the worker improvises to save the run.

- **Bad (unresolved + no branch):** "For each pointer in the roster, find its transcript file and read it."
- **Good (resolved + pinned):** run the lookup while authoring and write the roster as concrete paths — "Read `…/3f9a.jsonl`, lines 1–40." For any pointer that genuinely cannot resolve until run time, the step carries the exact command and the chosen branch: "Grep the marker in the transcript dir; if the result is not exactly one file, stop and record the pointer in a marker — do not guess." Either way the agent never decides: you resolved the lookup, or you handed it the branch.

**The cold-start overrun.** A human points a fresh agent at the plan and types "start the remediation." The plan opens with orientation and assumes the agent will read it, the sizing worksheet, and the audit REPORT, then launch Wave 0. The boot session does exactly that — and the heavy reads alone carry it over the wire before it spawns anything; it spends its budget discovering it should have handed those reads off, then hands off having launched nothing.

- **Bad (heavy + open):** the plan's top is prose for a human; the booting agent is left to "review the plan and its inputs, then begin Wave 0." It reads everything to find the start.
- **Good (lean + closed):** the plan opens with a cold-start contract — "You are the lean owner. Read only this contract and `wave-0-brief.md`. Do not read the REPORT, the sizing sheets, or the rest of this plan. Step 1: spawn the window-resolver leaf with the inline brief below. Step 2: on its done-marker, spawn Wave 0 from the slice list it wrote." The heavy reads are a leaf's job; the boot owner stays a coordinator and is launched on a bounded read.
