#!/usr/bin/env node
/*
 * context-tripwire.js
 * -------------------
 *
 * ============================================================================
 * TWO INVARIANTS — DO NOT VIOLATE WHEN EDITING THIS HOOK.
 * The product owner set these directly. They are not up for "improvement",
 * "modernization", or making the agent "smarter". If a change touches the words
 * an agent sees (buildInstruction / buildWarning), re-read these first.
 *
 *   1. NEVER make the hooked agent context-aware. NOTHING in any message an
 *      agent sees may reference its context budget, token position, or a
 *      countdown — no "you have ~20k left until...", no token counts, no
 *      threshold numbers, no "you're running low". The agent must not know it is
 *      governed by size at all. A number invites countdown math, and countdown
 *      math breeds the anxiety that makes agents rush, truncate, and cut quality.
 *      No context-aware agents, full stop. (Token figures live ONLY in the
 *      breadcrumb log, which no agent reads.)
 *
 *   2. EVERY message an agent sees must feel like being SHOWN A DOOR — and that
 *      walking through it is the BEST move available. NEVER a wall, a limit, a
 *      hard "stop", or anything that reads as slamming shut in front of them.
 *      The door framing IS the point: an agent shown a clean exit hands off at
 *      full quality; an agent that hits a "wall" is tempted to cheat its output
 *      to squeak under it. Calm baton-pass, never an alarm — no ⛔ in agent text,
 *      no "limit"/"wall" wording reaching the agent.
 *
 * SCOPE — invariants 1 & 2 govern the HANDOFF tiers (WARN/HARD/WALL), whose whole job
 * is to coax a clean, full-quality baton-pass. The FINAL KILL tier (>= KILL_THRESHOLD,
 * added later at the product owner's explicit instruction) is a deliberate exception to
 * invariant 2 ONLY: it IS a hard stop with no door, because past that ceiling the
 * session's context is blown and its output is being DISCARDED — there is no quality
 * left to protect, so door-framing serves nothing. Invariant 1 still holds even there:
 * the kill notice names no token figure and no countdown.
 *
 * The internal tier names (WARN/HARD/WALL/KILL) and the breadcrumb log are NOT
 * agent-facing and are exempt — but that wording must never leak into a string
 * an agent reads.
 * ============================================================================
 *
 * Context governor so no agent drifts into the "dumb" zone. Four ceilings, each
 * stricter than the last:
 *
 *   1. WARN  (>= WARN_THRESHOLD, default 55,000): one calm, non-blocking heads-up.
 *      It tells the agent it is nearing the handoff point, reassures it that it has
 *      room and should NOT rush or change quality, and asks only that its NEXT
 *      natural breakpoint be a tidy one — so that if the hard stop fires soon after,
 *      the successor inherits a clean picture. Fires AT MOST ONCE per session
 *      (guarded by a .warned marker). On PreToolUse it is delivered as a ONE-TIME
 *      soft deny — a single tool call is bounced so the message is guaranteed to
 *      land, then the agent re-issues and carries on. On UserPromptSubmit /
 *      PostToolUse it rides in as injected context, which is read reliably.
 *
 *   2. HARD  (>= HARD_THRESHOLD, default 75,000): forces the handoff. EVERY session —
 *      interactive or autonomous — hands off the SAME way: write a handoff note,
 *      spawn a replacement with spawn_session, write the completion marker, stop.
 *      There is no interactive exemption and no write-a-note-and-stop alternative:
 *      the spawn IS the handoff, standing in for a human manually opening a new
 *      session. While over this limit only the tools that perform the handoff run
 *      (see isHandoffAction): ToolSearch (loads the spawn schema), spawn_session, a
 *      Write to the handoff note or a marker, and a Read of this session's own note
 *      or transcript. Everything else is denied.
 *
 *   3. WALL  (>= WALL_THRESHOLD, default 90,000): the allow-list collapses to the spawn
 *      path only (see isWallAction) — ToolSearch, spawn_session, and the note + marker
 *      writes; only the self-reads HARD allows are dropped. ToolSearch is deliberately
 *      KEPT: spawn_session is a DEFERRED tool whose schema must be loaded by ToolSearch
 *      before it can be called, so stripping ToolSearch would brick the very spawn the
 *      wall exists to force (it did — sessions deadlocked here and ballooned to 130k–
 *      180k). Uniform for every session. NEVER strip ToolSearch from a governed tier.
 *
 *   4. KILL  (>= KILL_THRESHOLD, default 120,000): the final hard stop — no handoff, no
 *      door, no negotiation. Past this the session's context is blown well beyond the
 *      "dumb" zone, so its output is presumed poison: a handoff note would be unreliable
 *      and a spawned replacement would inherit the rot. EVERY tool is denied (including
 *      spawn_session and any note/marker write), the turn is allowed to end, and the
 *      session is treated as FAILED. Restart is owned out of band by the product owner —
 *      the hook's only job here is to stop a blown session polluting work downstream of
 *      it. Deny-all/let-stop shape mirrors the RETIRED no-op. This is the ONE tier that
 *      is not a calm "door" — see the SCOPE note under the invariants banner.
 *
 * MESSAGE TONE: every message the AGENT sees is framed as a calm baton-pass — being
 * shown the door and the clean way through it — never an alarm. No ⛔, no raw token
 * counts, and no "limit"/"wall" wording reaches the agent (WARN/HARD/WALL are internal
 * tier names only). Token figures live solely in the breadcrumb log. This is
 * deliberate: a number invites countdown math and a "wall" implies a crash, and both
 * breed the context anxiety that makes agents rush, truncate, or cut quality — the very
 * degradation this governor exists to prevent.
 *
 * NO EXEMPTIONS — EVERY SESSION IS GOVERNED, including fire-and-forget leaves. There
 * is deliberately NO leaf carve-out: a leaf that crosses a threshold gets the WARN
 * nudge and, at the hard limit, hands off exactly like any other session. A
 * worst-case redundant spawn is far cheaper than any session, leaf or not, rotting
 * past the ceiling. Do NOT re-introduce a leaf exemption.
 *
 * Batons land in ONE folder per project — the project root's `.handoffs` (found by
 * walking up to the nearest `.claude`/`.git` marker), regardless of which subfolder a
 * session sits in. Batons are RETAINED for manual review: the replacement reads its
 * predecessor's note but deletes nothing, and the 24h janitor sweep is held off too
 * (toggle RETAIN_BATONS to restore the old auto-cleanup). The product's own
 * "handoffs" folders (e.g. the Auditor's spec handoffs) are a different system and
 * are never touched by this hook.
 *
 * The hard zone is IDEMPOTENT about the note. A session that already wrote a valid
 * handoff note before the hard stop fired — e.g. while "capturing progress" after the
 * calm warn — is NOT ordered to write a second one. Every valid handoff note this
 * session writes is recorded (its exact path) in a `.notepath` marker, even under a
 * themed name the naming guard permits, so the hard instruction reuses it.
 *
 * DEDUP: the moment a spawn_session call lands, a `.spawned` marker is written
 * (PostToolUse). A second spawn is then denied and the handoff order switches to
 * "already spawned — write the marker and stop."
 *
 * STOP GATE: over the hard limit a turn cannot end until the replacement is spawned.
 * The gate releases as soon as the `.spawned` marker exists (proof the spawn happened);
 * if a spawn never lands it fails open after MAX_STOP_BLOCKS blocks (logged
 * FORCED_RELEASE) so a genuine spawn failure can never trap the session in a loop.
 *
 * RETIRED NO-OP: once this session's `.done` marker exists it has handed off and its
 * replacement owns the work. The governor does NOT disengage (that let a poked or
 * re-entered retired session run ungoverned); instead it denies every tool, lets the
 * turn end, and injects a terse "you are retired, do not act" notice.
 *
 * ORDER GUARD: the handoff steps must run in order — the `.done` completion marker
 * (step 3) may NOT be written before the `.spawned` marker exists (step 2). Writing
 * `.done` early flips on the RETIRED no-op above, which then denies the very spawn the
 * handoff still needs — stranding the work note-only. So a premature `.done` write is
 * bounced with a "spawn first, then mark done" redirect. With this guard a `.done`
 * marker can only ever exist once a spawn has already landed.
 *
 * NAMING GUARD: every handoff note in .handoffs/ is forced to the date-first
 * convention (handoff_YYYY-MM-DD_<label>.md) whether the hook or a session writes it.
 *
 * BREADCRUMB LOG: each meaningful fire appends one line to
 * ~/.claude/hooks/context-tripwire.log (see appendLog), wrapped in its own try/catch
 * so a full disk or locked file can never break the governor. Routine below-threshold
 * passes are not logged.
 *
 * Wired to five hook events in ~/.claude/settings.json:
 *   - UserPromptSubmit : injects the handoff/warn order at turn start, before the AI
 *                        speaks. Inject-only — it NEVER blocks your prompt.
 *   - PreToolUse       : blocks real work once over the limit (allows only the handoff actions)
 *   - PostToolUse      : re-measures the instant a result lands, so a turn that fans
 *                        out many/large reads can't leap a threshold unseen; also
 *                        records the `.spawned` marker the instant a spawn lands.
 *   - Stop             : blocks a turn from ending until the replacement is spawned
 *   - SubagentStop     : same, for sub-agents
 *
 * SAFETY: this script FAILS OPEN. Any error, unreadable file, or uncertainty results
 * in "allow" (exit 0). A bug here can never block your work.
 *
 * KILL SWITCH: create an (empty) file at  ~/.claude/hooks/DISABLE  to turn the whole
 * thing off instantly. Delete it to re-enable. (Affects new sessions.)
 *
 * TUNING: WARN_THRESHOLD / HARD_THRESHOLD / WALL_THRESHOLD / KILL_THRESHOLD set the four
 * ceilings (keep WARN < HARD < WALL < KILL). RETAIN_BATONS keeps handoffs on disk for
 * review; MAX_STOP_BLOCKS bounds the Stop-gate fail-open.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const WARN_THRESHOLD = 55000; // soft nudge: calm, non-blocking, fires once
const HARD_THRESHOLD = 75000; // hard stop: forces the handoff + spawn
const WALL_THRESHOLD = 90000; // wall: allow-list collapses to spawn/note/marker only
const KILL_THRESHOLD = 120000; // final hard stop: deny EVERY tool, no handoff path, session is failed/discarded

// Keep handoff notes + .done markers on disk for manual review — the replacement
// deletes nothing and the 24h janitor sweep is held off. Flip to false to restore
// the old hands-off cleanup (replacement deletes its predecessor's baton + janitor
// reaps stale batons after 24h).
const RETAIN_BATONS = true;

// Stop-gate fail-open ceiling. Over the hard limit the Stop gate blocks a turn from
// ending until the work is recoverable. A blocked Stop must never loop: each blocked
// Stop is a FRESH TURN that only ADDS tokens, so a high ceiling turns a stuck session
// into a token bomb (one rotted 138k -> 182k across 4 blocks). Kept deliberately LOW —
// one nudge plus a small margin — because blocking Stop cannot CONJURE a spawn, it can
// only burn context; past this many blocks we release with a logged FORCED_RELEASE. A
// normal handoff never reaches the counter (the spawn/note release fires first).
const MAX_STOP_BLOCKS = 2;

const HOME = os.homedir();
const HOOKS_DIR = path.join(HOME, '.claude', 'hooks');
const HANDOFF_DIR = path.join(HOME, '.claude', 'handoffs');
const DISABLE_FLAG = path.join(HOOKS_DIR, 'DISABLE');
const LOG_PATH = path.join(HOOKS_DIR, 'context-tripwire.log');

// The meta-agent tool that spawns a replacement session.
const SPAWN_TOOL = 'mcp__nimbalyst-meta-agent__spawn_session';

// Mutable context for the breadcrumb log, filled in by main() once stdin is parsed.
// appendLog keeps its (action, tokens, extra) signature and reads sess/event/tool
// from here.
const logCtx = { sessionId: 'unknown', event: '', toolName: '' };

// Append ONE breadcrumb line per meaningful fire. Wrapped in its own try/catch so a
// full disk, locked file, or missing directory can never break the governor.
// Line shape: <ISO ts>  sess=<id8>  event=<e>  tool=<t>  tokens=<n>  action=<A>  <extra>
function appendLog(action, tokens, extra) {
  try {
    const ts = new Date().toISOString();
    const id8 = String(logCtx.sessionId || 'unknown').slice(0, 8);
    const tok = (tokens === null || tokens === undefined) ? 'null' : tokens;
    let line = ts + '  sess=' + id8 + '  event=' + logCtx.event
      + '  tool=' + logCtx.toolName + '  tokens=' + tok + '  action=' + action;
    if (extra) line += '  ' + extra;
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch (e) {}
}

function allow() {
  // Emit nothing, exit 0 = "no objection, proceed".
  process.exit(0);
}

// Standard hook outputs (each writes JSON to stdout and exits 0). Centralized so the
// many decision branches below cannot drift in shape.
function denyPreToolUse(reason) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
      systemMessage: reason,
    }));
  } catch (e) {}
  process.exit(0);
}

function injectUserPrompt(reason) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: reason,
      },
    }));
  } catch (e) {}
  process.exit(0);
}

function blockTurn(reason) {
  // Stop / PostToolUse style block: surfaces the reason as feedback. (A PostToolUse
  // tool has already run; this cannot un-run it, only govern the NEXT action.)
  try {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: reason,
      systemMessage: reason,
    }));
  } catch (e) {}
  process.exit(0);
}

// Robust synchronous stdin read (works on Windows pipes).
function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  while (true) {
    let bytes = 0;
    try {
      bytes = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === 'EAGAIN') continue; // not ready yet, retry
      break; // EOF or anything else: stop reading
    }
    if (bytes === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, bytes)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Read the tail of the transcript and return the most recent context size,
// = input_tokens + cache_creation_input_tokens + cache_read_input_tokens.
// Returns null if it can't be determined (caller then fails open).
function computeTokens(transcriptPath) {
  const fd = fs.openSync(transcriptPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    // Find the most recent usage record by scanning the transcript tail, growing
    // the window (x4, up to the whole file) until one is found. With a fixed-size
    // tail, a single giant tool-result line near the end can crowd the latest
    // token count out of view, making us under-read — or read nothing and fail
    // open — so the hook fires late on heavy turns. The common case still only
    // touches the last 256 KB; we pay more I/O only when a heavy trailing line
    // forces it.
    for (let window = 262144; ; window *= 4) {
      const readBytes = Math.min(size, window);
      const buf = Buffer.alloc(readBytes);
      fs.readSync(fd, buf, 0, readBytes, size - readBytes);
      const lines = buf.toString('utf8').replace(/^﻿/, '').split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        let obj;
        try { obj = JSON.parse(lines[i]); } catch (e) { continue; }
        const u = obj && obj.message && obj.message.usage;
        if (u && typeof u.input_tokens === 'number') {
          const known = (u.input_tokens || 0)
            + (u.cache_creation_input_tokens || 0)
            + (u.cache_read_input_tokens || 0);
          // In-flight growth estimate. A usage record is stamped when the model
          // GENERATES its message, so it predates any tool results that have landed
          // since — within one turn every check would otherwise read the same stale
          // pre-turn number, letting a single fan-out (many/large reads, or one huge
          // tool output) leap a threshold invisibly. So add what has landed since:
          // sum the bytes of every transcript line AFTER this usage record and count
          // ~bytes/4 as estimated tokens. The number then reads "last known usage +
          // what has landed since." Over-estimating is the safe direction (an early
          // handoff costs far less than a missed one). Still fail-open: any problem
          // throws and the function returns null below, so the caller allows.
          let bytesSince = 0;
          for (let j = i + 1; j < lines.length; j++) {
            bytesSince += Buffer.byteLength(lines[j], 'utf8') + 1; // +1 for the split-stripped newline
          }
          return known + Math.floor(bytesSince / 4);
        }
      }
      // Nothing in this window. If we have already scanned the whole file, give
      // up (caller fails open); otherwise grow the window and retry from further back.
      if (readBytes >= size) break;
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}

// All sessions in one project write their batons to a SINGLE folder — the
// project root's `.handoffs` — no matter which subfolder a given session is
// sitting in. We find the root by walking up from cwd to the nearest ancestor
// holding a `.claude` or `.git` marker (HOME is skipped, since ~/.claude would
// otherwise masquerade as a project root). The dotted name keeps the folder
// hidden and distinct from any project's own "handoffs" folder (e.g. the
// Auditor's spec handoffs). Falls back gracefully when no root is found.
function projectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 40 && dir; i++) {
    if (dir !== HOME) {
      try {
        if (fs.existsSync(path.join(dir, '.claude')) ||
            fs.existsSync(path.join(dir, '.git'))) return dir;
      } catch (e) {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  return null;
}

function handoffDirFor(cwd) {
  if (cwd && typeof cwd === 'string') {
    const root = projectRoot(cwd);
    return path.join(root || cwd, '.handoffs');
  }
  return HANDOFF_DIR; // last-ditch: ~/.claude/handoffs
}

// A handoff NOTE is a .md file sitting DIRECTLY in the project's .handoffs/
// folder (markers live in the .markers/ subfolder and are exempt). Used by the
// naming guard and the path-scoped allow-list so they only treat real handoff
// notes as notes.
function isHandoffNotePath(filePath, handoffDir) {
  try {
    if (!/\.md$/i.test(filePath)) return false;
    const parent = path.resolve(path.dirname(filePath)).toLowerCase();
    return parent === path.resolve(handoffDir).toLowerCase();
  } catch (e) { return false; }
}

// Compare two filesystem paths for equality, resolved + case-insensitive (Windows).
function samePath(a, b) {
  try {
    if (!a || !b) return false;
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  } catch (e) { return false; }
}

// Is filePath a direct child of dir? Markers live flat in .markers/, so a direct-child
// test is exactly right (and stricter than a prefix test).
function isInside(filePath, dir) {
  try {
    if (!filePath || !dir) return false;
    const parent = path.resolve(path.dirname(filePath)).toLowerCase();
    return parent === path.resolve(dir).toLowerCase();
  } catch (e) { return false; }
}

// Path-scoped allow-list for the HARD zone (>= HARD_THRESHOLD). A tool runs only when
// it is actually doing handoff work — not merely because it shares a name with a
// handoff tool. ctx = { handoffDir, markerDir, notePath, transcriptPath, recordedNote }.
//   - ToolSearch     → allowed (loads the deferred spawn_session schema).
//   - spawn_session  → allowed (the dedup is enforced at the call sites in main()).
//   - Write          → allowed ONLY to a handoff note or inside .markers/.
//   - Read           → allowed ONLY for this session's note or its own transcript.
//   - everything else→ denied.
function isHandoffAction(toolName, toolInput, ctx) {
  if (toolName === 'ToolSearch') return true;
  if (toolName === SPAWN_TOOL) return true;
  if (toolName === 'Write') {
    const target = toolInput && toolInput.file_path;
    if (!target) return false;
    return isHandoffNotePath(target, ctx.handoffDir) || isInside(target, ctx.markerDir);
  }
  if (toolName === 'Read') {
    const target = toolInput && toolInput.file_path;
    if (!target) return false;
    return samePath(target, ctx.transcriptPath)
      || samePath(target, ctx.notePath)
      || (!!ctx.recordedNote && samePath(target, ctx.recordedNote));
  }
  return false;
}

// Stricter allow-list for the WALL zone (>= WALL_THRESHOLD): the spawn path only —
// ToolSearch, spawn_session, and the note + marker writes. The self-reads HARD allows
// are dropped, but ToolSearch is NOT: spawn_session is a DEFERRED tool whose schema must
// be loaded by ToolSearch before it can be called, so stripping ToolSearch here makes the
// spawn uncallable — bricking the exact handoff the wall exists to force (precisely how
// sessions deadlocked at the wall and ballooned to 130k–180k). Allowing ToolSearch is
// safe: it only loads schemas, and every non-handoff tool it could load is still denied.
function isWallAction(toolName, toolInput, ctx) {
  if (toolName === 'ToolSearch') return true;
  if (toolName === SPAWN_TOOL) return true;
  if (toolName === 'Write') {
    const target = toolInput && toolInput.file_path;
    if (!target) return false;
    return isHandoffNotePath(target, ctx.handoffDir) || isInside(target, ctx.markerDir);
  }
  return false;
}

// Required handoff note name: date-first, e.g. handoff_2026-06-11_1159_ab12cd34.md
// or handoff_2026-06-11_strategist-rewrite.md. Anything else (bare slugs like
// "strategist-80k-rewrite.md") is rejected so notes sort chronologically and stay
// consistent whether the hook wrote them or a session did by hand.
const HANDOFF_NAME_RE = /^handoff_\d{4}-\d{2}-\d{2}_.+\.md$/;

// Stable, human-readable base name for this session's handoff files, e.g.
// "handoff_2026-06-08_1348_70e88461". Derived from the transcript's creation
// time (which is fixed for the whole session) so the note + marker names never
// change between hook calls — that stability is what prevents handoff loops.
function handoffBase(transcriptPath, sessionId) {
  const shortId = (sessionId || 'unknown').slice(0, 8);
  let d = null;
  try { d = fs.statSync(transcriptPath).birthtime; } catch (e) { d = null; }
  if (!d || isNaN(d.getTime()) || d.getFullYear() < 2000) return 'handoff_' + shortId;
  const p = n => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + '_' + p(d.getHours()) + p(d.getMinutes());
  return 'handoff_' + stamp + '_' + shortId;
}

function buildInstruction(opts) {
  const notePath = opts.notePath;
  const markerPath = opts.markerPath;
  const transcriptPath = opts.transcriptPath;
  const existingNote = opts.existingNote;
  const alreadySpawned = !!opts.alreadySpawned;
  const atWall = !!opts.atWall;

  // If this session already wrote a valid handoff note, reuse THAT one rather than
  // ordering a duplicate; otherwise the note will be written at the canonical path.
  const noteForSpawn = existingNote || notePath;

  // The closing line of the spawn prompt depends on whether batons are retained.
  // When retained, the replacement is told to LEAVE the baton on disk (so it can
  // be reviewed by hand); otherwise it is told to delete it once read.
  const closing = RETAIN_BATONS
    ? 'specific missing detail, do NOT read it in full. LEAVE the note and its '
      + 'marker in place — they are being kept on disk for review — and simply '
      + 'continue the work."'
    : 'specific missing detail, do NOT read it in full. Once you have read the note '
      + 'and are ready to continue, DELETE both the note and its marker in one '
      + 'PowerShell call — Remove-Item -Force \'' + noteForSpawn + '\' , \'' + markerPath + '\' '
      + '— so the baton folder stays clean, then continue the work."';

  // Step 1 is idempotent: if a valid note already exists (e.g. written while
  // capturing progress after the calm warn), point at it and forbid a second one.
  const step1 = existingNote
    ? [
        '1. Your handoff note ALREADY EXISTS — do NOT write a new one:',
        '   ' + existingNote,
        '   Reuse it as-is. Only if it is missing something the successor needs,',
        '   APPEND to that same file. Do not create a second note.',
      ]
    : [
        '1. WRITE your handoff note to this exact path:',
        '   ' + notePath,
        '   Use this structure:',
        '     # Handoff',
        '     ## Task — the goal you are working toward',
        '     ## Done — what you have completed (be specific)',
        '     ## Remaining — what is left, in order',
        '     ## Files & locations — every path you created/edited + key inputs',
        '     ## Open decisions / gotchas — anything the next agent must know',
        '     ## Full record — your complete log is at:',
        '       ' + transcriptPath,
        '       (The next agent reads this ONLY to recover a detail the note missed.',
        '        It must NOT read it in full.)',
      ];

  // Step 2 is the spawn — the handoff itself. Once a spawn has landed (the `.spawned`
  // marker), it switches to forbidding a second one.
  const step2 = alreadySpawned
    ? [
        '2. Your replacement is ALREADY SPAWNED — do NOT spawn again (a second spawn',
        '   is blocked). Move straight to the marker.',
      ]
    : [
        '2. SPAWN your replacement with mcp__nimbalyst-meta-agent__spawn_session.',
        '   Set inheritModel: true. Use this prompt:',
        '   "You are picking up an in-progress task handed off from an earlier session.',
        '    Read your handoff note at ' + noteForSpawn + ' — it has your task and current',
        '    state. The earlier session\'s full log is at ' + transcriptPath + '; consult it',
        '    only for a ' + closing,
      ];

  // Header is a calm baton-pass, never an alarm: no ⛔, no token counts, no
  // "limit"/"wall" wording. The agent is shown the door and the clean way through it,
  // not told it crashed into something. (Token counts live only in the breadcrumb log.)
  const header = atWall
    ? [
        '🤝 Handoff point — time to pass the baton cleanly.',
        'To keep the handoff itself tidy, only the handoff actions run right now:',
        'writing the handoff note, spawning your replacement, and writing the',
        'completion marker. Walk these steps in order — that is the whole job.',
      ]
    : [
        '🤝 Handoff point — time to pass the baton cleanly.',
        'The clean way forward now is to hand this work to a fresh session. Walk',
        'these steps in order — that is the whole job. (Other tools are paused',
        'meanwhile, just so the handoff lands tidy.)',
      ];

  return [
    ...header,
    '',
    ...step1,
    '',
    ...step2,
    '',
    '3. WRITE a marker file (this signals the handoff is complete) to:',
    '   ' + markerPath,
    '   with the single word: done',
    '',
    '4. STOP. Your replacement owns the work now — you do not need to continue it yourself.',
  ].join('\n');
}

// The calm heads-up text for the WARN band (shared by both delivery paths). Tone
// is deliberate: reassure, give permission to keep working at full quality, and ask
// for exactly one thing — that the NEXT natural breakpoint be a tidy one. It
// explicitly tells the agent NOT to hand off now, to head off the "context anxiety"
// failure mode where an agent over-reacts to a limit warning by rushing. Carries NO
// token count and NO threshold number on purpose — a number invites countdown math,
// which is the budget anxiety we are avoiding. The agent never needs the figure.
function buildWarning() {
  return [
    'ℹ️ Heads-up: you are nearing the natural handoff point for this session.',
    '',
    'You still have room. There is NO need to rush, truncate, summarize early, or',
    'change how you are working — keep going at full quality.',
    '',
    'The only ask: when you next reach a NATURAL stopping point — a finished',
    'sub-task, a clean seam in the work — treat that as a good moment to make sure',
    'your progress is captured (notes written, files saved, state recorded). That',
    'way, if the hard handoff fires shortly after, your successor inherits a clean',
    'picture instead of a half-finished action.',
    '',
    'This is a calm heads-up, not a stop. Do NOT hand off now. Carry on normally;',
    'just aim your next breakpoint to be a tidy one.',
  ].join('\n');
}

// Janitor: delete any baton whose handoff is COMPLETE (its .done marker exists)
// and whose marker is older than MAX_AGE_MS. The takeover agent normally deletes
// its predecessor's baton the moment it has read it; this is the backstop for the
// times it forgets or crashes. Pairs only — a note with no marker is an in-flight
// handoff and is never touched. Fails silent: any error leaves files in place.
// HELD OFF while RETAIN_BATONS is true (batons are kept for manual review).
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
function reap(handoffDir) {
  const markerDir = path.join(handoffDir, '.markers');
  let entries;
  try { entries = fs.readdirSync(markerDir); } catch (e) { return; }
  for (const f of entries) {
    if (!f.endsWith('.done')) continue;
    const markerPath = path.join(markerDir, f);
    let mtimeMs;
    try { mtimeMs = fs.statSync(markerPath).mtimeMs; } catch (e) { continue; }
    if (Date.now() - mtimeMs < MAX_AGE_MS) continue;
    const base = f.slice(0, -5); // strip ".done"
    try { fs.unlinkSync(path.join(handoffDir, base + '.md')); } catch (e) {}
    try { fs.unlinkSync(markerPath); } catch (e) {}
  }
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin().replace(/^﻿/, '')); } catch (e) { allow(); }

  const event = input.hook_event_name || '';
  const sessionId = input.session_id || 'unknown';
  const transcriptPath = input.transcript_path || '';
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || '';

  // Fill the breadcrumb-log context for this invocation.
  logCtx.sessionId = sessionId;
  logCtx.event = event;
  logCtx.toolName = toolName;

  // Kill switch.
  try {
    if (fs.existsSync(DISABLE_FLAG)) { appendLog('KILL_SWITCH', null, ''); allow(); }
  } catch (e) {}

  // Where this session's handoff files live + their human-readable names.
  const handoffDir = handoffDirFor(cwd);

  // Backstop sweep of stale, already-discharged batons (fails silent). Held off
  // while batons are retained for manual review.
  if (!RETAIN_BATONS) { try { reap(handoffDir); } catch (e) {} }
  const base = handoffBase(transcriptPath, sessionId);
  const notePath = path.join(handoffDir, base + '.md');
  const markerDir = path.join(handoffDir, '.markers');
  const markerPath = path.join(markerDir, base + '.done');
  const warnMarkerPath = path.join(markerDir, base + '.warned');
  const stopCountPath = path.join(markerDir, base + '.stopblocks');
  const spawnedMarkerPath = path.join(markerDir, base + '.spawned');
  // Records the EXACT path of a valid handoff note this session wrote (which may be
  // a themed name, not the canonical base). Lets the hard zone recognize an
  // already-written note and skip ordering a duplicate. See the naming-guard block.
  const notePathMarker = path.join(markerDir, base + '.notepath');

  // ── RETIRED SESSION NO-OP (this session already handed off) ──
  // Once this session's .done marker exists it has handed off; its replacement owns
  // the work. Do NOT disengage the governor — a poked/re-entered retired session
  // would then run ungoverned. Deny every tool, let the turn end, and inject a terse
  // notice on prompt/result. Replacement sessions have a DIFFERENT base name, so this
  // only ever fires for the session that actually retired. Runs before the naming
  // guard so a retired write gets the retired notice, not a naming nag.
  let retired = false;
  try { retired = fs.existsSync(markerPath); } catch (e) {}
  if (retired) {
    const notice = 'This session is retired — it already handed off and your '
      + 'replacement owns the work. Do not act.';
    if (event === 'PreToolUse') {
      appendLog('RETIRED', null, 'denied ' + toolName);
      denyPreToolUse(notice);
    }
    if (event === 'UserPromptSubmit') {
      appendLog('RETIRED', null, 'prompt while retired');
      injectUserPrompt(notice);
    }
    if (event === 'PostToolUse') {
      // Govern a result that lands while retired (e.g. this session's own final
      // marker write) per spec. Not logged — the meaningful re-entry signals are
      // PreToolUse / UserPromptSubmit, so this avoids a RETIRED line on every clean
      // handoff's own marker-write PostToolUse.
      blockTurn(notice);
    }
    // Stop / SubagentStop / anything else: let it end.
    allow();
  }

  // ── HANDOFF NAMING GUARD (runs at every context level) ──
  // Force every handoff note in .handoffs/ to the date-first convention — both
  // the ones this hook orders AND any a session writes by hand — so they never
  // regress to arbitrary slugs. Only Write calls aimed at a .md note in the
  // handoff folder are checked; markers and all other writes pass untouched.
  if (event === 'PreToolUse' && toolName === 'Write') {
    const target = toolInput && toolInput.file_path;
    if (target && isHandoffNotePath(target, handoffDir)) {
      if (!HANDOFF_NAME_RE.test(path.basename(target))) {
        const reason = 'Handoff naming rule: notes in ' + handoffDir + ' must be '
          + 'named handoff_YYYY-MM-DD_<label>.md (date first) so they sort '
          + 'chronologically and stay consistent. The name "' + path.basename(target)
          + '" does not match. Easiest fix: name it ' + base + '.md (this session\'s '
          + 'canonical handoff name). For a themed handoff, '
          + 'handoff_<YYYY-MM-DD>_<short-label>.md is also fine. Rename and write again.';
        appendLog('NAMING_GUARD', null, 'rejected ' + path.basename(target));
        denyPreToolUse(reason);
      }
      // Valid handoff-note name → remember the EXACT path this session is writing to.
      // The hard zone reads this so a note already written under a THEMED name (not
      // the canonical base) is still recognized — preventing a duplicate "second"
      // handoff note when the hard stop fires right after a warn-time capture. If the
      // write never lands, the path simply won't exist and the hard zone falls back
      // to ordering a fresh note, so recording pre-write is safe.
      try { fs.mkdirSync(markerDir, { recursive: true }); } catch (e) {}
      try { fs.writeFileSync(notePathMarker, target); } catch (e) {}
    }
  }

  // How full are we? Unknown -> fail open.
  let tokens = null;
  try { if (transcriptPath) tokens = computeTokens(transcriptPath); } catch (e) { tokens = null; }
  if (tokens === null) { appendLog('FAIL_OPEN', null, 'tokens unknown'); allow(); }

  // ── FINAL KILL ZONE (>= KILL_THRESHOLD): hard stop, no handoff, no negotiation. ──
  // Past this ceiling the session is in blown-out context, far beyond the "dumb" zone,
  // and its output is presumed poison: a handoff note it writes would be unreliable and
  // a replacement it spawns would inherit the rot. So unlike the graded tiers below this
  // one offers NO door and NO handoff path — it denies EVERY tool (including spawn_session
  // and any note/marker write), lets the turn end, and treats the session as FAILED. The
  // product owner restarts it out of band; the hook's only job here is to stop a blown
  // session from polluting anything downstream of it. Shape mirrors the RETIRED no-op:
  // deny on action, inject on prompt, block on post-result, allow the stop. Honors
  // INVARIANT 1 (the notice names no token figure); INVARIANT 2's door framing is
  // deliberately void here — this tier IS the hard stop the owner asked for, and there is
  // no remaining quality to protect.
  if (tokens >= KILL_THRESHOLD) {
    const notice = 'This session has ended and is closing out. Do not take any further '
      + 'action — no more tool calls, no handoff, no spawn. Just stop here; the work is '
      + 'being picked up separately.';
    if (event === 'PreToolUse') {
      appendLog('KILL', tokens, 'denied ' + toolName);
      denyPreToolUse(notice);
    }
    if (event === 'UserPromptSubmit') {
      appendLog('KILL', tokens, 'prompt past kill');
      injectUserPrompt(notice);
    }
    if (event === 'PostToolUse') {
      appendLog('KILL', tokens, 'result past kill');
      blockTurn(notice);
    }
    // Stop / SubagentStop / anything else: let it end — we WANT a failed session to stop.
    appendLog('KILL', tokens, 'stop allowed — session failed/closed');
    allow();
  }

  // ── HARD ZONE (>= HARD_THRESHOLD): handoff not done -> force it. ──
  if (tokens >= HARD_THRESHOLD) {
    const atWall = tokens >= WALL_THRESHOLD;
    try { fs.mkdirSync(markerDir, { recursive: true }); } catch (e) {}

    // NO LEAF EXEMPTION: leaves hand off here exactly like any other session. A
    // worst-case redundant spawn is far cheaper than letting a leaf rot past 80k.
    // Did THIS session already write a valid handoff note? Prefer the canonical
    // path; otherwise honor the themed path it recorded in .notepath. Either way we
    // verify the file actually exists on disk before reusing it.
    let existingNote = null;
    try { if (fs.existsSync(notePath)) existingNote = notePath; } catch (e) {}
    if (!existingNote) {
      try {
        const rec = fs.readFileSync(notePathMarker, 'utf8').trim();
        if (rec && fs.existsSync(rec)) existingNote = rec;
      } catch (e) {}
    }

    let alreadySpawned = false;
    try { alreadySpawned = fs.existsSync(spawnedMarkerPath); } catch (e) {}

    const actionCtx = {
      handoffDir: handoffDir,
      markerDir: markerDir,
      notePath: notePath,
      transcriptPath: transcriptPath,
      recordedNote: existingNote,
    };
    const allowedAction = (t, i) => atWall
      ? isWallAction(t, i, actionCtx)
      : isHandoffAction(t, i, actionCtx);

    const msg = buildInstruction({
      notePath: notePath,
      markerPath: markerPath,
      transcriptPath: transcriptPath,
      existingNote: existingNote,
      alreadySpawned: alreadySpawned,
      atWall: atWall,
    });
    const blockAction = atWall ? 'WALL' : 'HARD_BLOCK';
    const injectAction = atWall ? 'WALL' : 'HARD_INJECT';

    if (event === 'UserPromptSubmit') {
      // Inject-only: plant the handoff order as context before the AI generates
      // anything. Deliberately does NOT block the prompt (that would eat the user's
      // message) — the actual blocking lives in PreToolUse / Stop below.
      appendLog(injectAction, tokens, 'handoff order injected');
      injectUserPrompt(msg);
    }

    if (event === 'PreToolUse') {
      // Dedup: one spawn only. A second spawn_session after .spawned exists is denied.
      if (toolName === SPAWN_TOOL && alreadySpawned) {
        appendLog(blockAction, tokens, 'dedup: second spawn denied');
        denyPreToolUse(msg);
      }
      // ORDER GUARD: the completion (.done) marker must not be written before the spawn
      // lands. Writing it flips the session to RETIRED, which then denies the very spawn
      // the handoff needs — stranding the work note-only (this is exactly how session
      // 199051e4 locked itself out). Force spawn-first: bounce a premature marker write
      // with a clear redirect. Sits before allowedAction so it applies in the wall zone too.
      if (toolName === 'Write') {
        const tgt = toolInput && toolInput.file_path;
        if (tgt && samePath(tgt, markerPath) && !alreadySpawned) {
          appendLog(blockAction, tokens, 'marker-before-spawn blocked');
          denyPreToolUse('Spawn your replacement FIRST, then write the completion marker. '
            + 'Call mcp__nimbalyst-meta-agent__spawn_session now (ToolSearch first if its '
            + 'schema is not loaded); the marker write goes straight through once the spawn '
            + 'has landed.');
        }
      }
      if (allowedAction(toolName, toolInput)) allow();
      appendLog(blockAction, tokens, 'denied ' + toolName);
      denyPreToolUse(msg);
    }

    if (event === 'Stop' || event === 'SubagentStop') {
      // Release the moment the work is RECOVERABLE — never grind. We only reach here
      // when .done is ABSENT (the retired no-op handles a finished session). Two proofs
      // of recoverability, in order:
      //   1. the .spawned marker — a replacement is already running (the ideal); or
      //   2. a valid handoff NOTE on disk — a human or fresh session can pick the work
      //      up from there even if the spawn never landed.
      // Blocking Stop cannot MAKE the agent spawn; each block is a fresh turn that only
      // ADDS tokens (this is how a stuck session rotted to 182k). So we give at most ONE
      // nudge-block while a note already exists, then release — quietly, recorded only in
      // the breadcrumb log — rather than burn more turns chasing a spawn that isn't
      // coming. If not even a note exists yet, block up to MAX_STOP_BLOCKS to force at
      // least that, then fail open.
      let spawned = false;
      try { spawned = fs.existsSync(spawnedMarkerPath); } catch (e) {}
      if (spawned) {
        appendLog('STOP_RELEASE', tokens, '.spawned present');
        allow();
      }

      let blocks = 0;
      try { blocks = parseInt(fs.readFileSync(stopCountPath, 'utf8'), 10) || 0; } catch (e) {}
      blocks += 1;
      try { fs.writeFileSync(stopCountPath, String(blocks)); } catch (e) {}

      // A recoverable note already exists and we have nudged once: stop grinding.
      if (existingNote && blocks > 1) {
        appendLog('NOTE_RELEASE', tokens, 'note on disk, no spawn, blocks=' + blocks);
        allow();
      }
      if (blocks >= MAX_STOP_BLOCKS) {
        appendLog('FORCED_RELEASE', tokens, 'blocks=' + blocks + ' no spawn');
        allow();
      }
      appendLog('STOP_BLOCK', tokens, 'blocks=' + blocks);
      blockTurn(msg);
    }

    if (event === 'PostToolUse') {
      // Record a completed spawn the instant it lands, so the Stop gate + dedup see it.
      if (toolName === SPAWN_TOOL) {
        try { fs.writeFileSync(spawnedMarkerPath, 'spawned\n'); } catch (e) {}
        appendLog('SPAWNED', tokens, 'marker written');
      }
      // The tool already RAN — PostToolUse cannot deny it. If the agent is mid-handoff
      // (an allowed action) stay silent; otherwise surface the order NOW so the agent
      // sees it before its next action instead of only at the next PreToolUse deny.
      if (allowedAction(toolName, toolInput)) allow();
      appendLog(injectAction, tokens, 'handoff order surfaced post-result');
      blockTurn(msg);
    }

    allow();
  }

  // ── WARN ZONE (WARN <= tokens < HARD): one calm, non-blocking nudge. ──
  if (tokens >= WARN_THRESHOLD) {
    // NO LEAF EXEMPTION: leaves get the calm nudge too. Fire at most once per session
    // — the .warned marker is the guard. If it's already there, stay silent.
    try { if (fs.existsSync(warnMarkerPath)) allow(); } catch (e) {}

    // Only deliver the nudge where the agent will actually read it in real time:
    // PreToolUse, PostToolUse, and UserPromptSubmit. Other events just pass through.
    if (event === 'PreToolUse' || event === 'PostToolUse' || event === 'UserPromptSubmit') {
      try { fs.mkdirSync(markerDir, { recursive: true }); } catch (e) {}
      try { fs.writeFileSync(warnMarkerPath, 'warned\n'); } catch (e) {}
      const msg = buildWarning();
      appendLog('WARN', tokens, '');

      if (event === 'UserPromptSubmit') {
        injectUserPrompt(msg);
      }

      if (event === 'PostToolUse') {
        // A result just landed and the in-flight estimate now reads inside the warn
        // band — this turn leapt past WARN on growth the PreToolUse checks could not
        // see yet. The tool already ran, so surface the calm nudge as feedback. If the
        // jump landed in the UPPER half of the band, add a measured "take stock before
        // gathering more" line — proportionate, without provoking a rushed handoff.
        let note = msg;
        if (tokens >= (WARN_THRESHOLD + HARD_THRESHOLD) / 2) {
          note += '\n\n'
            + '— — —\n'
            + 'A gentle note: that last step pulled in a lot at once. No need to hand off — '
            + 'this is just a good moment to work with what you already have before pulling '
            + 'in more, so your next breakpoint stays tidy.';
        }
        blockTurn(note);
      }

      // PreToolUse: deliver via a ONE-TIME soft deny. This is the only PreToolUse
      // channel the agent reliably reads — a non-blocking additionalContext was
      // silently lost in the routine reminder noise. We bounce exactly THIS one tool
      // call; the .warned marker was written just above, so the agent's immediate
      // re-issue sails straight through and it never fires again.
      const bounce = msg + '\n\n'
        + '— — —\n'
        + 'NOTE: nothing is wrong, and this is NOT the handoff. This single tool '
        + 'call was intentionally bounced ONCE, purely to guarantee this heads-up '
        + 'reached you (a silent notice gets lost in routine reminders). Simply '
        + 'RE-ISSUE the exact same tool call now — it will go straight through — '
        + 'and continue working normally. This will not happen again this session.';
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: bounce,
        },
        systemMessage: msg,
      }));
      process.exit(0);
    }

    allow();
  }

  allow();
}

try { main(); } catch (e) { allow(); }
