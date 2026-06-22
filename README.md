# The Context-Budget Playbook

A small set of working docs and one hook centered on context-budgeting and session-sizing — the methodology that came out of running multi-agent pipelines in Nimbalyst and Claude Code. The core idea: an agent should never have to watch its own context window or improvise around a budget. Instead, you do the sizing math up front, keep every session under a fixed target, and bake all the lookups and decisions into the steps so each session runs to its end on the literal instructions alone. These notes are shared with the Nimbalyst Discord community — take what's useful.

## The docs

- **[context-budget-model.md](./context-budget-model.md)** — the core sizing reference: per-action cost anchors, the 70k switch target, and the 1.5× variance multiplier you plan against.
- **[sizing-worksheet-template.md](./sizing-worksheet-template.md)** — a copy-per-orchestration worksheet for doing the budget math before you launch anything.
- **[role-authoring-budget-guide.md](./role-authoring-budget-guide.md)** — how to write pipeline role docs so sessions stay under budget without ever self-monitoring.
- **[cross-session-context-discipline.md](./cross-session-context-discipline.md)** — how a multi-session topology (spawners, collectors, doers) stays under budget by design.
- **[context-tripwire-hook.md](./context-tripwire-hook.md)** — reference for the four-stage hook that forces a clean handoff before quality degrades. The runnable hook itself ships alongside it as **[context-tripwire.js](./context-tripwire.js)** (a Claude Code hook; drop it in `~/.claude/hooks/` and wire it up per the reference).
