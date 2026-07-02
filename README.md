# The Context-Budget Playbook

A skill and a hook for context-budgeting and session-sizing — the methodology that came out of running multi-agent pipelines in Claude Code. The core idea: an agent should never have to watch its own context window or improvise around a budget. Instead, you do the sizing math up front, keep every session under a fixed target, and bake all the lookups and decisions into the steps so each session runs to its end on the literal instructions alone.

Two pieces work together:

- **`plan-authoring/`** — a Claude Code skill that carries the authoring discipline: how to design, size, and write a plan (or role doc, wave plan, sizing worksheet, or kickoff/spawn prompt) so every session it spawns stays under budget and runs without improvising.
- **`context-tripwire.js`** — a Claude Code hook that enforces the same target at run time: a four-stage governor that nudges early and forces a clean handoff before a session drifts into the degraded, high-context zone.

The skill is the authoring side; the hook is the safety belt. Take what's useful.

## What's here

- **[plan-authoring/SKILL.md](./plan-authoring/SKILL.md)** — the entry card: the one rule, the thresholds, the two modes (author-new and audit-then-remediate), and the authoring checklist.
- **[plan-authoring/reference.md](./plan-authoring/reference.md)** — the single source of truth for the cost model: per-action cost anchors, the 70k switch target, the 1.5× variance multiplier, the structural toolkit, and the red-flag list.
- **[plan-authoring/sizing-worksheet-template.md](./plan-authoring/sizing-worksheet-template.md)** — a copy-per-orchestration worksheet for doing the budget math before you launch anything.
- **[context-tripwire-hook.md](./context-tripwire-hook.md)** — reference for the four-stage hook that forces a clean handoff before quality degrades, plus its tunable thresholds.
- **[context-tripwire.js](./context-tripwire.js)** — the runnable hook itself (Node).

## Install

- **Skill:** copy the `plan-authoring/` folder into `~/.claude/skills/`, so you end up with `~/.claude/skills/plan-authoring/SKILL.md`. It triggers whenever you write, size, or repair a plan, role doc, wave plan, sizing worksheet, or spawn/kickoff prompt.
- **Hook:** copy `context-tripwire.js` into `~/.claude/hooks/`, then register it in `~/.claude/settings.json` on the `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `SubagentStop` events (matcher `*`). See `context-tripwire-hook.md` for the exact wiring, the four stages, and the thresholds you can tune.
