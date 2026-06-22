---
doc: Cross-session context discipline — how a multi-session topology stays under budget by design
audience: anyone planning a multi-session topology (spawners, collectors, doers)
status: living
---
# Cross-Session Context Discipline

Context across a multi-session topology is solved in planning, not improvised at runtime. The never-self-monitor principle that makes this possible — fixed integer counts instead of felt thresholds, every session retiring on a count it never weighs against a budget — lives in [role-authoring-budget-guide](./role-authoring-budget-guide.md). This doc covers what that principle leaves open: how the sessions in a live topology divide labor, offload, and tear down.

## Topology roles: spawner, collector, doer

Split a multi-session run into three role shapes, each retiring on a fixed count set in planning:

- **Spawners** fire their children and retire. They do not wait.
- **Collectors** do the waiting — by counted `Glob`-glances for disk completion-flags, never by polling a child for status.
- **Doers** run one fixed quantum of work and retire.

The split exists because waiting is what bloats a session. A session told to launch a team and then *wait* by polling `get_session_status` in a loop bloated itself to 182k — each status reply piled onto its context. Separating the waiter from the spawner keeps that cost off both: the spawner is already gone, and the collector's glances are existence checks, not content reads.

## Child-to-disk offload for context-heavy planning

When a planning sub-task is context-expensive — enumerating many files, large-doc skims, multi-stage recon — it does not run in the parent planning session. A child runs it and writes its deliverable to a stable on-disk path; a successor session reads that artifact fresh and continues the larger thread. The spawn cost, the poll cost, and the child's output never land in any single session's budget.

Use this only when the child's deliverable is reusable across sessions — a report, a map, a digest — not for a one-shot side errand. The child's brief is self-contained: it will not see the parent's context, so the brief restates goal, constraints, output format, and the disk path. The parent retires at the spawn; it does not poll-then-synthesize.

## Waiter mechanics and teardown order

A disk-glance waiter has two non-obvious properties, and both drive how a topology is torn down:

- **It must hold its loop open with a real `schedule_wakeup`, not passive idling.** The wakeup is what carries the orchestration forward between glances.
- **It reads a flag's *absence* as a signal too.** So teardown order matters: deleting a live orchestrator's expected wait-flags or scratch while it is still on its loop makes its next wake read "flag missing" as failure and spuriously re-run the whole pipeline. An orchestrator is stood down and confirmed idle *before* its flags are deleted — never while it can still wake.

---

The context tripwire is the hard backstop ([context-tripwire-hook](./context-tripwire-hook.md)); the counts, offloads, and role splits above are what keep a session from ever drifting there.
