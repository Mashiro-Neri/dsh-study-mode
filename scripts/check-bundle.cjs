/*
 * Structural checks for dsh-study-mode's cordis.patch.yml and package manifest.
 *
 * These target the failures that only show up after a DSH restart, where a
 * broken preset disappears from the mode picker or shows a red "加载失败" card
 * with the real error text buried in the Host log. Every check here has already
 * caught (or would have caught) a real regression:
 *
 *   1. two presets: child `study-practice` declared before the main `study`
 *   2. delegation row points at the child preset and carries no removed fields
 *   3. no self-mounted subagent runtime / shell rows (the Host provides them)
 *   4. both tool-fs rows are structurally read-only (write/edit disabled)
 *   5. the practice child cannot ask, delegate, or load skills
 *   6. the main persona still carries the required behavioural markers
 *   7. every skill on disk is routed to, and at least one install-layout
 *      candidate for customSkillDirs can be resolved from the profile
 *   8. the roster shim exists and lists the child preset
 *   9. cordis.patch.yml is the rendered src/ output (personas live in Markdown)
 *  10. the teaching contract clauses still exist in persona/skills (pedagogy drift)
 *  11. the package manifest ships everything the patch references
 *
 * Deliberately regex/indentation based: the bundle has no dependencies of its
 * own and must stay installable from a single tarball.
 *
 * Run:  node scripts/check-bundle.cjs
 * Exit: 0 clean, 1 on any finding.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PATCH = path.join(ROOT, 'cordis.patch.yml');
const text = fs.readFileSync(PATCH, 'utf8');
const lines = text.split('\n');

const findings = [];
const warnings = [];
const note = (line, msg) => findings.push(`cordis.patch.yml:${line}  ${msg}`);
const warn = (msg) => warnings.push(msg);
const str = (v) => (v === undefined ? '' : String(v));

/** Lines belonging to a row: `- id: <rowId>` plus every deeper line. */
function collectRows() {
  const found = [];
  const starts = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)- id:\s*(\S+)\s*$/.exec(line);
    if (m) starts.push({ rowId: m[2], indent: m[1].length, start: i + 1, at: i });
  });
  for (const s of starts) {
    const body = [lines[s.at]];
    for (let i = s.at + 1; i < lines.length; i += 1) {
      const line = lines[i];
      const indent = (line.match(/^\s*/) || [''])[0].length;
      if (line.trim() !== '' && indent <= s.indent) break;
      body.push(line);
    }
    found.push({ rowId: s.rowId, indent: s.indent, start: s.start, lines: body });
  }
  return found;
}
const rows = collectRows();
const rowById = new Map();
for (const row of rows) if (!rowById.has(row.rowId)) rowById.set(row.rowId, row);

/** Nested plugin rows of one preset block. */
function presetBlock(row) {
  return row.lines.join('\n');
}

/** True when the row's own `name:` line (not a nested row) mounts the package. */
function mounts(row, packageName) {
  const want = row.indent + 2;
  return row.lines.some((l) => {
    const m = /^(\s*)name:\s*'([^']+)'\s*$/.exec(l);
    return m !== null && m[1].length === want && m[2] === packageName;
  });
}

// ── 1) the two presets and the shim, in the required order ─────────────────
const insertOrder = rows.filter((r) => r.indent === 4).map((r) => r.rowId);
if (insertOrder.join(',') !== 'preset-study-practice,preset-study,study-hide-internal-presets') {
  findings.push(`insert order is [${insertOrder.join(', ')}]; expected the child preset ` +
    'first, then the main preset, then the roster shim');
}

const childRow = rowById.get('preset-study-practice');
const mainRow = rowById.get('preset-study');
const shimRow = rowById.get('study-hide-internal-presets');
if (!childRow) findings.push('no child preset row `preset-study-practice`');
if (!mainRow) findings.push('no main preset row `preset-study`');
if (!shimRow) findings.push('no roster-shim row `study-hide-internal-presets`');

const declared = new Map(); // preset id -> line
for (const [rowId, info] of rowById) {
  if (!rowId.startsWith('preset-')) continue;
  const idm = /^\s{8}id:\s*([\w-]+)\s*$/m.exec(info.lines.join('\n'));
  if (!idm) { note(info.start, `preset row ${rowId} has no id`); continue; }
  declared.set(idm[1], info.start);
}
if (!declared.has('study-practice')) findings.push('preset id `study-practice` is not declared');
if (!declared.has('study')) findings.push('preset id `study` is not declared');

// ── 2) delegation rows ─────────────────────────────────────────────────────
const delegationRows = rows.filter((r) => mounts(r, '@deepseek-ai/dsh-tool-subagent'));
if (delegationRows.length !== 1) {
  findings.push(`expected exactly one delegation row, found ${delegationRows.length}`);
}
const REMOVED = ['persona', 'toolFilter', 'backgroundMode', 'enableRunInBackground'];
for (const row of delegationRows) {
  const body = row.lines;
  for (const field of REMOVED) {
    if (body.some((l) => new RegExp(`^\\s+${field}:`).test(l))) {
      note(row.start, `delegation row still configures removed field "${field}" ` +
        '— move persona/tools into a child preset and use agentPreset');
    }
  }
  for (const field of ['provider', 'toolName', 'agentPreset']) {
    if (!body.some((l) => new RegExp(`^\\s+${field}:`).test(l))) {
      note(row.start, `delegation row is missing required "${field}"`);
    }
  }
  const presetRef = body.map((l) => /^\s+agentPreset:\s*([\w-]+)\s*$/.exec(l)).find(Boolean);
  if (presetRef && !declared.has(presetRef[1])) {
    note(row.start, `agentPreset "${presetRef[1]}" is not declared in this file`);
  }
  if (presetRef && presetRef[1] !== 'study-practice') {
    note(row.start, `agentPreset should be study-practice, got ${presetRef[1]}`);
  }
  if (!body.some((l) => /^\s+provider:\s*'?spawn'?\s*$/.test(l))) {
    note(row.start, 'delegation provider must be spawn (agentPreset requires in-process spawn)');
  }
  if (!body.some((l) => /^\s+toolName:\s*subagent_practice\s*$/.test(l))) {
    note(row.start, 'delegation toolName must stay subagent_practice (persona/skills call it)');
  }
}

// ── 3) no self-mounted runtime / shell rows ────────────────────────────────
const code = lines.filter((l) => !/^\s*#/.test(l)).join('\n');
const BANNED = [
  ['dsh-subagent', 'self-mounted subagent runtime (the Host base bundle already provides `subagents` + `spawn`)'],
  ['dsh-subagent-spawn-in-process', 'self-mounted spawn provider (collides with the Host root)'],
  ['dsh-subagent-fork-in-process', 'self-mounted fork provider (collides with the Host root)'],
  ['dsh-pwsh-sandbox', 'shell executor row (Host root owns `shell`)'],
  ['dsh-bash-sandbox', 'shell executor row (Host root owns `shell`)'],
  ['dsh-tool-pwsh', 'shell tool row (the study mode must not have a shell)'],
  ['dsh-tool-bash', 'shell tool row (the study mode must not have a shell)'],
  ['dsh-tool-jobs', 'job tool row (the study mode must not run commands)'],
];
for (const [needle, why] of BANNED) {
  if (code.includes(needle)) findings.push(`forbidden row: ${needle} — ${why}`);
}

// ── 4) structural read-only: both presets' tool-fs disable write/edit ─────
const toolFsRows = rows.filter((r) => mounts(r, '@deepseek-ai/dsh-tool-fs'));
if (toolFsRows.length !== 2) {
  findings.push(`expected 2 tool-fs rows (main + practice), found ${toolFsRows.length}`);
}
for (const row of toolFsRows) {
  for (const field of ['write', 'edit']) {
    if (!row.lines.some((l) => new RegExp(`^\\s+${field}:\\s*false\\s*$`).test(l))) {
      note(row.start, `tool-fs must set ${field}: false — otherwise the tool is registered`);
    }
  }
}

// ── 5) the practice child preset's tool surface ───────────────────────────
if (childRow) {
  const body = presetBlock(childRow);
  const childIds = [...body.matchAll(/^\s{10}- id:\s*([\w-]+)\s*$/gm)].map((m) => m[1]);
  const EXPECTED = ['persona', 'tool-fs', 'tool-fs-search', 'tool-web'];
  if (childIds.join(',') !== EXPECTED.join(',')) {
    findings.push(`practice preset rows are [${childIds.join(', ')}]; expected ` +
      `[${EXPECTED.join(', ')}] (read-only surface: read/read_image/glob/grep/web_search/web_fetch)`);
  }
  for (const forbidden of ['tool-ask-user', 'tool-todo', 'tool-skill', 'skill-filesystem',
    'tool-subagent', 'tool-subagent-control', 'tool-subagent-list-agents', 'compaction']) {
    if (childIds.includes(forbidden)) {
      findings.push(`practice preset must not mount ${forbidden}`);
    }
  }
  if (!/你是学习模式里的\*\*练习员\*\*/.test(body)) {
    findings.push('practice preset persona text is missing (expected the 练习员 identity)');
  }
}

// ── 6) the main preset's tool surface and persona ─────────────────────────
if (mainRow) {
  const body = presetBlock(mainRow);
  const mainIds = [...body.matchAll(/^\s{10}- id:\s*([\w-]+)\s*$/gm)].map((m) => m[1]);
  const REQUIRED = ['persona', 'tool-fs', 'tool-fs-search', 'tool-web', 'tool-ask-user',
    'tool-skill', 'skill-filesystem', 'tool-todo', 'compaction',
    'tool-subagent-control', 'tool-subagent-list-agents', 'tool-subagent-practice'];
  for (const id of REQUIRED) {
    if (!mainIds.includes(id)) findings.push(`main preset is missing row ${id}`);
  }
  const persona = /-\s+id:\s*persona\b[\s\S]*?prefix:\s*\|([\s\S]*?)\n\s+complete:\s*true/.exec(body);
  if (!persona) {
    findings.push('main persona block with `complete: true` was not found');
  } else {
    const p = persona[1];
    for (const marker of ['[L1]', 'L3', '退出学习模式', '绝不允许', '发送前自检', '结构上的事实',
      '卡点类型', '示范通道', '逐步引导']) {
      if (!p.includes(marker)) findings.push(`main persona is missing required marker: ${marker}`);
    }
    const SKILLS = ['study-hint-ladder', 'study-concept-coaching', 'study-debug-coaching',
      'study-review-checklist', 'study-practice-subagent', 'study-subject',
      'study-subject-writing'];
    for (const s of SKILLS) if (!p.includes(s)) findings.push(`main persona does not route to ${s}`);
  }
  if (!/includeRuntimeContext:\s*true/.test(body)) findings.push('main persona must keep includeRuntimeContext: true');
}

// ── 7) skills: dirs, frontmatter, routing, and customSkillDirs resolution ─
const skillsDir = path.join(ROOT, 'skills');
const skillDirs = fs.existsSync(skillsDir)
  ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
if (skillDirs.length === 0) findings.push('skills/ has no skill directories');
for (const dir of skillDirs) {
  const file = path.join(skillsDir, dir, 'SKILL.md');
  if (!fs.existsSync(file)) { findings.push(`skills/${dir} has no SKILL.md`); continue; }
  const body = fs.readFileSync(file, 'utf8');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  if (!fm) { findings.push(`skills/${dir}/SKILL.md has no frontmatter`); continue; }
  const name = /^name:\s*(\S+)\s*$/m.exec(fm[1]);
  const desc = /^description:\s*(.+)\s*$/m.exec(fm[1]);
  if (!name) findings.push(`skills/${dir}/SKILL.md frontmatter has no name`);
  else if (name[1] !== dir) findings.push(`skills/${dir}/SKILL.md name "${name[1]}" != directory`);
  if (!desc) findings.push(`skills/${dir}/SKILL.md frontmatter has no description`);
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > 16384) warnings.push(`skills/${dir}/SKILL.md is ${bytes} bytes — consider splitting`);
  if (mainRow && !presetBlock(mainRow).includes(dir)) warnings.push(`skill ${dir} is never routed to by the main persona`);
}
const customSkillDirs = /customSkillDirs:\s*\n\s*-\s*!!js[\s\S]*?names\s*=\s*\[([^\]]*)\]/.exec(text);
if (!customSkillDirs) {
  findings.push('skill-filesystem customSkillDirs resolver block was not found');
} else {
  const names = [...customSkillDirs[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const expected of ['@dsh-community/dsh-study-mode', '@local/dsh-study-mode']) {
    if (!names.includes(expected)) findings.push(`customSkillDirs resolver is missing candidate ${expected}`);
  }
  if (!/throw new Error\('study-mode: cannot locate its own installed package/.test(text)) {
    findings.push('customSkillDirs resolver must throw a readable error when no candidate resolves ' +
      '(a silently empty skill directory is the classic failure)');
  }
}

// Optional but valuable: prove at least one candidate resolves from a real local
// DSH profile. A link install lives in <profile>/node_modules, so resolving from
// the profile patch anchor is the same resolution the runtime will do.
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profilesDir = path.join(dshHome, 'profiles');
const candidates = ['@dsh-community/dsh-study-mode', '@local/dsh-study-mode'];
const resolvedFrom = [];
if (fs.existsSync(profilesDir)) {
  const { createRequire } = require('node:module');
  for (const profileName of fs.readdirSync(profilesDir)) {
    const anchor = path.join(profilesDir, profileName, 'cordis.patch.yml');
    if (!fs.existsSync(anchor)) continue;
    let req;
    try { req = createRequire(anchor); } catch { continue; }
    for (const spec of candidates) {
      try {
        const pkgJson = req.resolve(spec + '/package.json');
        resolvedFrom.push({ profile: profileName, spec, dir: path.dirname(pkgJson) });
      } catch { /* candidate not installed in this profile */ }
    }
  }
}
if (resolvedFrom.length === 0) {
  warn(`bundle is not resolvable from any profile under ${profilesDir}; ` +
    'install-layout resolution check skipped (link it into a profile, then re-run)');
} else {
  for (const hit of resolvedFrom) {
    if (!fs.existsSync(path.join(hit.dir, 'skills'))) {
      findings.push(`customSkillDirs candidate "${hit.spec}" resolves in profile ` +
        `"${hit.profile}" but its package has no skills/ directory`);
    }
  }
  console.log(`resolves:         ${resolvedFrom.map((h) => `${h.profile}:${h.spec}`).join(', ')}`);
}

// ── 8) roster shim ─────────────────────────────────────────────────────────
const shimPath = path.join(ROOT, 'plugin', 'hide-internal-presets.js');
if (!fs.existsSync(shimPath)) {
  findings.push('plugin/hide-internal-presets.js is missing (the practice preset would leak into the mode picker)');
} else {
  const shim = fs.readFileSync(shimPath, 'utf8');
  if (!shim.includes("'study-practice'")) findings.push("roster shim INTERNAL_PRESETS does not list 'study-practice'");
  if (!shim.includes('remoteExportList')) findings.push('roster shim does not wrap remoteExportList');
  if (/throw new Error/.test(shim)) warnings.push('roster shim throws — a DSH roster rename would then break the whole preset');
}

// ── 9) cordis.patch.yml must be the rendered src/ output ──────────────────
// The personas live in src/*.md and the composition in src/cordis.patch.template.yml;
// a hand-edited generated file drifts from its source the moment someone edits
// the other half. `build-patch.mjs --check` re-renders in memory and compares.
const buildPatch = path.join(ROOT, 'scripts', 'build-patch.mjs');
for (const rel of ['src/persona.md', 'src/practice-persona.md', 'src/cordis.patch.template.yml']) {
  if (!fs.existsSync(path.join(ROOT, rel))) findings.push(`missing source file ${rel}`);
}
if (!fs.existsSync(buildPatch)) {
  findings.push('scripts/build-patch.mjs is missing (cordis.patch.yml is generated from src/)');
} else if (!findings.some((f) => f.includes('missing source file src/'))) {
  const { execFileSync } = require('node:child_process');
  try {
    execFileSync(process.execPath, [buildPatch, '--check'], { stdio: 'pipe' });
    console.log('patch source:     src/ in sync');
  } catch (error) {
    findings.push('cordis.patch.yml is out of sync with src/ — run `node scripts/build-patch.mjs`');
    const output = String(error.stdout || '') + String(error.stderr || '');
    for (const line of output.trim().split('\n').slice(0, 4)) if (line) findings.push('  ' + line);
  }
}

// ── 10) teaching-contract assertions ──────────────────────────────────────
// The pedagogy is the product. These clauses are the promises that make the
// mode what it is: no proactive assessment interrogation, subject stepwise
// flow, the demo channel, bypass markers, list bookkeeping, practice-agent
// quality gates. A skill edit must not silently drop one of them.
function skillText(name) {
  const file = path.join(skillsDir, name, 'SKILL.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
const TEACHING_CONTRACT = [
  ['src/persona.md', fs.existsSync(path.join(ROOT, 'src', 'persona.md'))
    ? fs.readFileSync(path.join(ROOT, 'src', 'persona.md'), 'utf8') : '',
    ['不要为此盘问', '学科逐步引导', '一次只推进一步', '示范通道', '卡点类型',
      '微目标', '[概念]', '[环境]', '[退出]', '只认本模式规则', '难度锚点']],
  ['skills/study-subject/SKILL.md', skillText('study-subject'),
    ['一次只推进一步', '当前步骤', '卡点类型', '示范通道', '考核', '五类', '反例']],
  ['skills/study-hint-ladder/SKILL.md', skillText('study-hint-ladder'),
    ['卡点类型', '升格软门', '示范通道']],
  ['skills/study-review-checklist/SKILL.md', skillText('study-review-checklist'),
    ['微目标', '卡点类型分布', '当前步骤']],
  ['skills/study-practice-subagent/SKILL.md', skillText('study-practice-subagent'),
    ['难度锚点', '自检', '验算']],
  ['skills/study-concept-coaching/SKILL.md', skillText('study-concept-coaching'),
    ['[概念]', '不改变']],
];
for (const [file, body, clauses] of TEACHING_CONTRACT) {
  if (!body) { findings.push(`teaching contract source is missing: ${file}`); continue; }
  for (const clause of clauses) {
    if (!body.includes(clause)) {
      findings.push(`${file} is missing teaching-contract clause: "${clause}"`);
    }
  }
}

// A 2.2 merge removed two skills; a stale name would route the model to a skill
// that no longer exists (the `skill` call would fail at runtime).
for (const stale of ['study-subject-stepwise', 'study-subject-math']) {
  if (text.includes(stale)) findings.push(`cordis.patch.yml still references removed skill: ${stale}`);
}

// ── 11) package manifest ──────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkg.name !== '@dsh-community/dsh-study-mode') {
  findings.push(`package name is "${pkg.name}"; the shipped bundle must be @dsh-community/dsh-study-mode`);
}
if (!/^\d+\.\d+\.\d+$/.test(str(pkg.version))) findings.push('package version is not plain semver');
if (!pkg.engines || !str(pkg.engines.dsh)) {
  findings.push('package.json must declare engines.dsh (>=0.2.1-rc.2) — older hosts cannot load the preset model');
}
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') findings.push('package.json dsh.bundle.patch is wrong');
for (const f of ['cordis.patch.yml', 'plugin', 'skills', 'README.md', 'README.zh.md', 'INSTALL.zh.md', 'CHANGELOG.md', 'LICENSE']) {
  if (!pkg.files.includes(f)) findings.push(`package.json files[] does not ship ${f}`);
}
if (pkg.private !== true) warnings.push('package.json is not private — double-check before any registry publish');

// dist artifacts, when present, must match the current version.
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  const slug = pkg.name.replace(/^@/, '').replace('/', '-');
  const tgz = path.join(dist, `${slug}-${pkg.version}.tgz`);
  if (!fs.existsSync(tgz)) warnings.push(`dist/ has no ${path.basename(tgz)} for the current version — run scripts/build-package.ps1`);
}

console.log(`presets:          ${[...declared.keys()].join(', ') || '(none)'}`);
console.log(`delegation rows:  ${delegationRows.map((r) => r.rowId).join(', ') || '(none)'}`);
console.log(`skills:           ${skillDirs.join(', ') || '(none)'}`);
console.log(`package:          ${pkg.name}@${pkg.version} (engines.dsh ${str(pkg.engines?.dsh) || 'missing'})`);
console.log('');

for (const w of warnings) console.log('WARN  ' + w);
if (warnings.length) console.log('');

if (findings.length) {
  for (const f of findings) console.log('FAIL  ' + f);
  console.log('');
  console.log(`${findings.length} finding(s). Fix these before restarting DSH:`);
  console.log('a broken preset disappears from the mode picker or shows a red load-failure card.');
  process.exit(1);
}
console.log('bundle checks passed');
