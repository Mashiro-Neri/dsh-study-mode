# Study Mode

**English** · [中文](README.zh.md)

A mode for DSH (DeepSeek Harness) that helps you work the problem out yourself.

> **Just want it installed?** See the [install guide](INSTALL.zh.md) — three install paths, how to confirm it worked, and troubleshooting. (Currently in Chinese.)

## Why this exists

Hand your homework to an AI and it hands back something submittable in three seconds. You learn nothing in the process — the problem just moves from "I can't do this" to "I appear to be able to do this for now."

This prompt takes the opposite approach: **ask, don't answer**. Hints are released one level at a time, and the highest level is a skeleton with the decision points left blank — not a finished answer. There is an explicit escape hatch if you genuinely want the complete answer, but you have to say so.

As a DSH mode there's an extra layer: **there is no shell, and no `write` / `edit` tools either**. Scaffolding a project, installing dependencies, running your code, writing a file — it can't do any of that. It isn't being asked nicely to hold back; the capability simply isn't there.

## What it is

Two agent presets, declared by a bundle patch (`cordis.patch.yml`): the main Study Mode, plus the internal `study-practice` agent it delegates to. Identity, toolset and sub-agent are composed when the session is created; the practice preset never shows up in the mode picker.

The default learner is a student working through **schoolwork**: maths, physics and chemistry problems go through the step-by-step protocol (decompose, one step per turn); programming keeps the original flow.

**The prompt lands in three layers:**

| Layer | Contents | How it applies |
|---|---|---|
| Standing identity | Role, priority, bottom-line clause, level marker, fixed flow, the ladder, hard bans, pressure handling, the exit switch, a pre-send self-check | persona, **present on every request**, ~6,800 characters |
| On-demand detail | Eight skills: ladder detail, concept coaching, code debug coaching, review & progress, practice-agent protocol, subject step-by-step, maths/sciences, writing | loaded by the model only when needed |
| Structural constraint | Toolset: **no shell and no `write` / `edit`**; the practice agent additionally has no `ask_user_question` and no delegation tools | fixed at session creation |

## Levels and the ladder

Every reply opens with its current level, like `[L1]`. Each new problem starts back at L0.

- **L0** (default): ask questions only, no substantive clue.
- **L1**: direction — which concept is involved, where to look.
- **L2**: key clue — the specific function/step/formula, or the API name, keyword or doc page to look up.
- **L3** (highest): a skeleton with blanks. The blanks must be the problem's real decision points, and the whole thing **must not run as-is**.

Level-ups happen only when the learner asks for one ("I'm stuck", "one more hint"). Repeating the same demand does not advance the ladder, and it stops at L3.

The single release valve is "exit study mode": say it explicitly, confirm once, and you get the complete answer — for that one problem only.

For work that must be done independently (a test, a quiz), the ceiling drops to L2 and the exit switch is not offered.

## Subject problems: step by step (new in 2.1)

For schoolwork — maths, physics, chemistry, biology — the mode does **not** explain the whole solution. It decomposes the problem and advances **one step at a time**:

> Coach: what does the problem ask for? What do you think the first step is?
> Learner: find the acceleration… force analysis first?
> Coach: right, force analysis. Which forces, and which object?
> Learner: (states object and forces)
> Coach: the object is right. One force is missing — check what else touches this body.
> Coach: that step is done. What's the next step?

Rules: he does a step, you judge that step, then ask for the next one; the L0–L3 ladder is used **inside** a step and only for the current step. The whole solution appears in exactly two places: the exit switch, or the demo channel (an analogous problem, same technique, neutral naming, followed by a faded practice — never the original problem).

Each list entry carries a **micro-objective**, the **current step**, the level and the **stuck-point type**, so a compacted long session can pick up where it left off; the wrap-up reports the distribution of stuck-point types.

## The practice contract

Hand it several problems at once and it opens a **practice list for the day** with `todo_write`: number, one-line topic, status. It asks which one you want to start with, then advances exactly one at a time. After each one it asks where you got stuck and what clicked, and compresses your answer into a few words appended to that entry. When everything is done it offers a short wrap-up (which ones went smoothly, which kind of step the sticking points clustered in).

Three deliberate choices:

- **The list never contains answers, key clues or finished code** — you can see the list, so writing them there would leak the solution. Sticking points record the *symptom* ("missed the boundary"), never the fix.
- **There is no auto-advance mechanism.** It is not a goal and will not push forward while you are away; every problem starts only after you reply.
- **The list does not survive the session.** Close it and the list is gone; the next session starts fresh, and it will not pretend to remember.

## What's in it

One mode (plus an internal practice preset that never appears in the mode picker):

- A standing rule set (~6,800 characters per request)
- Tools: `read` / `read_image` / `glob` / `grep` / `web_search` / `web_fetch` / `ask_user_question` / `skill` / `todo_write` plus sub-agent control (`send_message` / `interrupt_agent` / `list_agents`)
- **No** `pwsh` / `bash` / `jobs`, and **no** `write` / `edit`
- One read-only practice sub-agent (a separate preset, hidden from the mode picker by the roster shim)
- Subject step-by-step protocol: decomposition, one step at a time, stuck-point → hint-shape mapping, demo channel
- Context compaction, so a long practice session doesn't grow until it overflows

Eight skills ship inside the bundle and are discovered through `skill-filesystem`'s `customSkillDirs`, with the path resolved from the bundle's own location:

| Skill | Purpose |
|---|---|
| `study-hint-ladder` | What each of L0–L3 may give, how to blank a skeleton, what counts as overstepping, when to raise or lower a level, stuck-point → hint-shape mapping |
| `study-concept-coaching` | Teaching a concept outright, verifying real understanding with 1–2 short checks, and not leaking the problem at hand |
| `study-debug-coaching` | The three opening questions for programming problems, guiding them to read their own error, reviewing without rewriting |
| `study-review-checklist` | When a review is actually warranted, how short it should be, the practice contract (list, state and stuck-point types), resetting between problems |
| `study-practice-subagent` | When to dispatch the practice agent, how to write the task, variant quality gates, timing, and enforcing "its output must never cover the original problem" |
| **`study-subject-stepwise`** | **The step-by-step protocol for subject problems: decomposition, one step per turn, what to ask each step, when the ladder applies, when a full solution is allowed** |
| `study-subject-math` | Maths/physics/chemistry: givens/goal/transformation, a derivation-chain L3, the five common failure points, counter-example thinking |
| `study-subject-writing` | Essays and text work: the hard rule that **not one complete sentence may be supplied**, claim/structure/evidence, a blank-outline L3, reviewing the learner's own prose |

The subject skills only swap out what a clue or a skeleton looks like; they do not override the bottom line or the process. Adding a subject means adding one directory under `skills/` — no preset change.

## The practice sub-agent

`subagent_practice`, read-only: `read` / `read_image` / `glob` / `grep` / `web_search` / `web_fetch`. No shell, no `write` / `edit`.

That read-only surface is a **structural guarantee**: the practice agent is its own agent preset (`study-practice`) whose plugin rows mount exactly those six tools. `write` / `edit` are never registered, and it has no `ask_user_question` and no delegation tools either.

Four jobs: **generate a variant** of the same concept, **independently check** the learner's answer (reporting which *kind* of step is wrong plus the criterion, never a fix), **supply counter-examples**, and **verify official documentation** (returning links and quoted passages).

Its hard rule, written into both its persona and the dispatch skill: **never solve the learner's actual problem, never produce a submittable artifact.** If a task would violate that, it is supposed to refuse and offer an alternative.

Each `subagent_practice` call returns `started subagent <childId>` immediately (since 0.2.1 it always starts asynchronously — there is no `run_in_background` parameter); after that, dispatch with `send_message(agent_id: ...)` without restating the background.

The practice preset does not appear in the mode picker (the roster shim filters out **healthy** internal presets only). If it fails to load it shows up as a red card with the real error text, and the failure is also logged as `agent preset study-practice:` — so run the self-check and the real-host verification after structural edits.

## Install

Needs DSH **0.2.1-rc.2 or newer** (`package.json` declares `engines.dsh`; older hosts cannot load the preset model). Three install paths, how to confirm it worked, and troubleshooting all live in **[INSTALL.zh.md](INSTALL.zh.md)** (Chinese). The shortest one:

```
# In a fresh standard-mode session:
Install C:\Users\li_jie\.dsh\dsh-local-bundles\dsh-study-mode\dist\dsh-community-dsh-study-mode-2.0.0.tgz as a plugin bundle into the current profile
```

That drives `plugin_manager`'s `install_bundle`: pnpm install → write `dsh.profile.bundles` → apply the patch. Then **restart DSH completely** (a newly inserted preset row needs a restart; the profile patch layer itself is live).

Afterwards, Settings → Modes should show a "学习模式" card, selectable on the new-session screen. That is the only new card — the internal practice preset is hidden by the roster shim. A session's mode is fixed at creation and cannot be changed later.

## Distribution format

Built artifacts live in `dist/`:

| File | Notes |
|---|---|
| `dsh-community-dsh-study-mode-2.0.0.tgz` | Installable npm package for `plugin_manager install_bundle`, or `dsh plugin --profile <p> add <path>` |
| `…tgz.sha256` | SHA256 of the tarball |
| `dsh-study-mode-2.0.0.zip` | **Whole-package archive**: source tree plus the tarball, self-contained — extracting yields a single top-level folder `dsh-study-mode-2.0.0/` |
| `…zip.sha256` | SHA256 of the zip |

**The two artifacts serve different purposes.** The `.tgz` is what DSH's `plugin_manager` consumes; the `.zip` is the human-facing bundle — unzip it and you have the source, the docs and working build scripts, no clone required. The tarball inside the zip matches its own bundled `.sha256`.

The zip holds 33 files (counting rule: one clean rebuild — `build-package.ps1` then `build-zip.ps1`: 31 files from the repository source tree plus the tarball and its sha256 in `dist/`; the zip being generated is not inside itself, and `.git` / `node_modules` are excluded):

```
dsh-study-mode-2.0.0/
├── src/                   source: persona Markdown + composition template
├── cordis.patch.yml       generated composition patch
├── package.json
├── plugin/                roster shim (hides healthy internal presets)
├── skills/                the eight skills
├── docs/                  original prompt + mapping table
├── scripts/               render, self-check, contract snapshot, verification, build
├── dist/                  build artifacts (tarball + checksum)
├── CHANGELOG.md / RELEASING.md
├── README.md / README.zh.md / INSTALL.zh.md / LICENSE
```

The package is `@dsh-community/dsh-study-mode`, declares `dsh.bundle.patch = ./cordis.patch.yml`, and its `files` allowlist ships only what's needed:

```
package/cordis.patch.yml         the preset declarations
package/plugin/hide-internal-presets.js  the roster shim
package/skills/…/SKILL.md        the eight skills
package/docs/source-prompt.zh.md the original prompt, for diffing against
package/README.md, README.zh.md, INSTALL.zh.md, CHANGELOG.md, LICENSE
```

**Skill-path resolution handles both install layouts.** Linked locally the package is `@local/dsh-study-mode`; installed from a tarball, registry or git it is `@dsh-community/dsh-study-mode`. The patch's `!!js` expression walks a candidate list and takes the first one that resolves; when none resolves it **throws a readable error** instead of silently producing an empty skill directory. Hard-coding either name makes the other layout silently lose every skill — exactly the trap on your requirements-mode bundle.

**Publishing to npm or GitHub requires dropping `"private": true`** (kept for now to prevent an accidental publish into a community scope this package doesn't own yet).

## Known tradeoffs and limitations

**`write` / `edit` are structurally absent now.** Both the main preset and the practice preset set `write: false` / `edit: false` on `tool-fs` — the tools are never registered, so this is no longer a rule the model is asked to follow. The cost is that the coach cannot write files for you either; it can only read.

**The shell is gone the same way.** No `pwsh` / `bash` / `jobs`: scaffolding, installing dependencies and running code are all impossible.

**The practice agent's read-only surface comes from its own agent preset.** It mounts six tools, has no `ask_user_question`, and cannot delegate further. Its persona and toolset live in that preset; the delegation tool only points at it.

**The practice preset is invisible in the mode picker, unless it breaks.** The roster shim filters healthy internal presets; a child preset that fails to load stays visible with its red "load failed" card and error text (and is also logged as `agent preset study-practice:`). Running `node scripts/check-bundle.cjs` and the real-host verification after structural edits catches most of it first.

**The practice agent cannot see your conversation with the coach**, so every dispatch has to restate the background. The upside is that it never guesses at context it doesn't have.

**`send_message` has a timing constraint**: you cannot deliver while the practice agent is running — it returns `subagent "<id>" is unavailable`. Not a failure; wait for the round to finish.

**The standing rules ride on every request**, around 6,800 characters (up from ~5,200 in 2.0 because of the step-by-step protocol, demo channel and state bookkeeping). The tradeoff is that the bottom line and the process skeleton must always be present, while detail loads on demand.

**The "Agent Teams" plugin no longer has to be off.** Since 0.2.1 a same-named tool registered in the preset scope shadows the global one: this mode's `send_message` takes `agent_id`, the teams version takes `target`, so the parameter name tells you which one you got.

## Hacking on it

The persona and the composition are **not hand-edited in `cordis.patch.yml`**: `src/persona.md`, `src/practice-persona.md` and `src/cordis.patch.template.yml` are the source, and the patch is generated. Edit Markdown for the persona, the template for the toolset, then re-render.

```powershell
# Re-render cordis.patch.yml after editing src/
node scripts/build-patch.mjs

# Static self-check (also runs build-patch --check to catch a stale generated patch)
node scripts/check-bundle.cjs

# Host-contract snapshot: run this first after a DSH upgrade (needs an extracted 0.2.1-rc.x runtime)
node scripts/check-host-contract.mjs --runtime <runtime-dir>

# Real-host preset verification; three modes: default / child visible / broken child must stay visible
node scripts/verify-preset.mjs --runtime <runtime-dir>
node scripts/verify-preset.mjs --runtime <runtime-dir> --with-internal
node scripts/verify-preset.mjs --runtime <runtime-dir> --broken-internal

# Pack (build-package runs the self-check first; the zip embeds the tarball)
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-zip.ps1

# Release: version + changelog checks -> all checks -> pack -> tag -> GitHub Release
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 2.0.0
```

`check-bundle.cjs` checks eleven things: both presets exist with the child declared before the main one; the delegation row points at `study-practice` and carries no fields the Host removed in 0.2.1; no self-mounted subagent runtime or shell row crept in; both `tool-fs` rows disable `write` / `edit`; the practice preset's tool surface is exactly the rows it should have; the main persona keeps its behavioural markers and skill routes; every skill's frontmatter is valid and **at least one `customSkillDirs` candidate resolves from the profile to a `skills/` directory that actually exists** (it throws when none does); the roster shim exists and lists the practice preset; **`cordis.patch.yml` is in sync with the `src/` sources**; **the teaching-contract clauses** ("no assessment interrogation", "subject step-by-step", "demo channel", "stuck-point type", "micro-objective", …) still exist in the persona/skills; and the package manifest's `files` allowlist ships everything the patch references. It has no external dependencies, so it runs without installing anything.

That skill-directory check is worth running every time: get the package name wrong and the preset still "loads", but the skill directory is **silently empty** — the failure only surfaces when `skill` is actually called. The resolver now throws instead, so the problem shows up at preset load time.

After a DSH upgrade, run `check-host-contract.mjs` first: it snapshots the host contracts this bundle depends on (`tool-subagent` config fields, the four `tool-fs` switches, the roster remote, the preset `broken` diagnostic, and so on), so a host change fails the check before a user ever sees a red card.

Structural changes need a DSH restart; skill bodies hot-reload. Release steps live in [RELEASING.md](RELEASING.md).

## Layout

```
.
├── package.json            declares this as a DSH bundle (@dsh-community/dsh-study-mode)
├── src/                    source: persona Markdown + composition template
│   ├── persona.md          the main preset's standing persona (~5,200 characters)
│   ├── practice-persona.md the practice preset's persona
│   └── cordis.patch.template.yml  template for the two presets + roster shim row
├── cordis.patch.yml        generated composition patch (do not hand-edit)
├── plugin/
│   └── hide-internal-presets.js  filters healthy internal presets out of the mode picker
├── CHANGELOG.md            release notes
├── RELEASING.md            release process
├── skills/                 the eight skills
│   ├── study-concept-coaching/
│   ├── study-debug-coaching/
│   ├── study-hint-ladder/
│   ├── study-practice-subagent/
│   ├── study-review-checklist/
│   ├── study-subject-stepwise/
│   ├── study-subject-math/
│   └── study-subject-writing/
├── docs/
│   ├── source-prompt.zh.md the original prompt + mapping table
│   └── README.md
├── scripts/
│   ├── build-patch.mjs     renders cordis.patch.yml from src/ (--check verifies sync)
│   ├── check-bundle.cjs    structural self-check
│   ├── check-host-contract.mjs  host-contract snapshot (run after a host upgrade)
│   ├── verify-preset.mjs   real-host preset verification (three modes)
│   ├── build-package.ps1   packs dist/*.tgz
│   ├── build-zip.ps1       packs dist/*.zip
│   └── release.ps1         release: checks + pack + tag + GitHub Release
├── dist/                   build artifacts (not committed; not in the tgz, but in the zip)
├── README.md               English (this file)
├── README.zh.md            Chinese
├── INSTALL.zh.md           install guide
└── LICENSE
```

## License

MIT
