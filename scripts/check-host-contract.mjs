// Host-contract snapshot test.
//
// This bundle is coupled to a handful of DSH 0.2.1 host contracts. When the host
// upgrades, the failure mode is not a compile error: the preset mounts with a
// broken row and the UI only shows a red "加载失败" card (or, for the hidden
// child preset, nothing at all). This test reads the installed host sources and
// fails as soon as one of those contracts moves, BEFORE a user sees the bug.
//
// It is deliberately source-pattern based rather than an import: the host tree
// ships compiled ESM with pinned internal layouts, and a stable textual
// contract ("this Config still has these fields", "this error string still
// exists") survives formatting churn while catching real API removals.
//
// Runtime location (one of):
//   --runtime <dir>     directory containing node_modules/@deepseek-ai/dsh
//   DSH_RUNTIME=<dir>
//
// Usage:
//   node scripts/check-host-contract.mjs --runtime <dir>
//   node scripts/check-host-contract.mjs --runtime <dir> --strict-versions
//
// Exit: 0 contracts hold, 1 drift found, 2 runtime missing.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const strictVersions = argv.includes('--strict-versions');

const runtime = arg('runtime', null) || process.env.DSH_RUNTIME;
if (!runtime) {
  console.error('check-host-contract: no DSH runtime given.\n' +
    '  Pass --runtime <dir> (or set DSH_RUNTIME) where <dir> contains\n' +
    '  node_modules/@deepseek-ai/dsh/lib/bin.js.');
  process.exit(2);
}
const NODE_MODULES = path.join(path.resolve(String(runtime)), 'node_modules', '@deepseek-ai');
if (!fs.existsSync(NODE_MODULES)) {
  console.error('check-host-contract: ' + NODE_MODULES + ' does not exist');
  process.exit(2);
}

const PACKAGES = [
  'dsh-tool-subagent',
  'dsh-tool-subagent-control',
  'dsh-agent-preset',
  'dsh-agent-preset-registry',
  'dsh-persona',
  'dsh-tool-fs',
  'dsh-skill-filesystem',
  'dsh-base',
  'dsh-web-app',
];

const read = (pkg, rel) => {
  const file = path.join(NODE_MODULES, pkg, rel);
  if (!fs.existsSync(file)) throw new Error('missing host file: ' + file);
  return fs.readFileSync(file, 'utf8');
};
const readJson = (pkg, rel) => JSON.parse(read(pkg, rel));

const findings = [];
const notes = [];
const check = (label, ok, detail) => {
  if (ok) console.log('ok   ' + label);
  else findings.push(label + (detail ? ' — ' + detail : ''));
};

// ── versions: one coherent cohort ─────────────────────────────────────────
const versions = [];
for (const pkg of PACKAGES) {
  try { versions.push([pkg, readJson(pkg, 'package.json').version]); }
  catch { findings.push('host package missing: ' + pkg); }
}
const distinct = [...new Set(versions.map(([, v]) => v))];
check('host packages form one version cohort: ' + distinct.join(', '), distinct.length === 1,
  'mixed versions: ' + versions.map(([p, v]) => p + '@' + v).join(', '));
if (strictVersions) {
  const declared = readJson('dsh', 'package.json').version;
  check('dsh CLI version matches cohort (' + declared + ')', distinct.length === 1 && distinct[0] === declared);
}
const version = distinct[0] ?? 'unknown';
const vParts = version.split('.');
const atLeast = (major, minor, patch) => {
  const [a, b, c] = vParts.map((n) => parseInt(n, 10));
  return a > major || (a === major && (b > minor || (b === minor && c >= patch)));
};
check('host is DSH >= 0.2.1-rc.2 (engines.dsh floor)', atLeast(0, 2, 1), 'got ' + version);

// ── dsh-tool-subagent: the delegation-tool config we depend on ────────────
try {
  const src = read('dsh-tool-subagent', 'lib/index.js');
  const configBlock = /const Config = z\.object\(\{([\s\S]*?)\n\}\);/.exec(src);
  const fields = configBlock ? [...configBlock[1].matchAll(/^\s+([A-Za-z][\w]*):/gm)].map((m) => m[1]) : [];
  const expected = ['provider', 'toolName', 'modelSelectionSettings', 'agentOptions',
    'agentPreset', 'allowedAgentPresets', 'maxDepth'];
  for (const field of expected) {
    check('tool-subagent Config still has "' + field + '"', fields.includes(field));
  }
  check('tool-subagent still rejects persona/toolFilter with the migration error',
    /for \(const field of \["persona", "toolFilter"\]\)/.test(src) &&
    /is no longer supported; configure persona and tool plugins in an Agent Preset and select it with agentPreset \(spawn only\)/.test(src));
  check('tool-subagent still returns a child id (activation result)', /kind: "activation", subagentId/.test(src) ||
    /subagentId/.test(src));
  check('tool-subagent requires the agentPresets service for agentPreset',
    /agent preset selection requires the agent-presets service/.test(src));
} catch (error) { findings.push('dsh-tool-subagent: ' + error.message); }

// ── dsh-tool-subagent-control: control tools + list-agents subpath ────────
try {
  const pkg = readJson('dsh-tool-subagent-control', 'package.json');
  check('tool-subagent-control still exports ./list-agents', Boolean(pkg.exports?.['./list-agents']));
  const src = read('dsh-tool-subagent-control', 'lib/index.js');
  check('send_message still takes agent_id', /agent_id:\s*\{/.test(src));
  const listAgents = read('dsh-tool-subagent-control', 'lib/types/list-agents.js');
  check('list_agents package still registers a tool', /register|defineTool/.test(listAgents));
} catch (error) { findings.push('dsh-tool-subagent-control: ' + error.message); }

// ── dsh-agent-preset / registry: declaration + roster + broken diagnostics ─
try {
  const src = read('dsh-agent-preset', 'lib/index.js');
  const configBlock = /static Config = z\.object\(\{([\s\S]*?)\n\t\}\);/.exec(src) ||
    /static Config = z\.object\(\{([\s\S]*?)\n\}\);/.exec(src);
  const fields = configBlock ? [...configBlock[1].matchAll(/^\s+([A-Za-z][\w]*):/gm)].map((m) => m[1]) : [];
  for (const field of ['id', 'name', 'description', 'order', 'plugins']) {
    check('agent-preset Config still has "' + field + '"', fields.includes(field));
  }
  check('agent-preset still registers through ctx.agentPresets.register', /agentPresets\.register\(/.test(src));
} catch (error) { findings.push('dsh-agent-preset: ' + error.message); }
try {
  const src = read('dsh-agent-preset-registry', 'lib/index.js');
  check('roster remote method still exists', /Remote\("list"\)/.test(src) && /remoteExportList/.test(src));
  check('roster entries still carry a broken diagnostic', /broken = error\.message/.test(src));
  check('preset audit still rejects service leaks', /Preset services require isolate realms/.test(src));
} catch (error) { findings.push('dsh-agent-preset-registry: ' + error.message); }

// ── dsh-persona: the four config fields the persona rows use ──────────────
try {
  const src = read('dsh-persona', 'lib/index.js');
  for (const field of ['prefix', 'suffix', 'complete', 'includeRuntimeContext']) {
    check('persona Config still has "' + field + '"', new RegExp('\\b' + field + ':').test(src));
  }
} catch (error) { findings.push('dsh-persona: ' + error.message); }

// ── dsh-tool-fs: the structural read-only switches ────────────────────────
try {
  const src = read('dsh-tool-fs', 'lib/index.js');
  const configBlock = /const Config = z\.object\(\{([\s\S]*?)\n\}\);/.exec(src);
  const fields = configBlock ? [...configBlock[1].matchAll(/^\s+([A-Za-z][\w]*):/gm)].map((m) => m[1]) : [];
  for (const field of ['read', 'readImage', 'write', 'edit']) {
    check('tool-fs Config still has "' + field + '" (structural read-only)', fields.includes(field));
  }
  check('tool-fs still skips registering write/edit when disabled',
    /if \(resolved\.write \|\| resolved\.edit\)/.test(src));
} catch (error) { findings.push('dsh-tool-fs: ' + error.message); }

// ── dsh-skill-filesystem: custom skill directories ────────────────────────
try {
  const src = read('dsh-skill-filesystem', 'lib/index.js');
  check('skill-filesystem still has customSkillDirs', /customSkillDirs/.test(src));
} catch (error) { findings.push('dsh-skill-filesystem: ' + error.message); }

// ── dsh-base: the Host already provides the subagent runtime ──────────────
try {
  const src = read('dsh-base', 'cordis.patch.yml');
  check('base bundle still mounts the subagent service', /name: '@deepseek-ai\/dsh-subagent'/.test(src));
  check('base bundle still mounts the spawn provider as "spawn"',
    /dsh-subagent-spawn-in-process/.test(src) && /providerName: spawn/.test(src));
} catch (error) { findings.push('dsh-base: ' + error.message); }

// ── dsh-web-app: canonical preset reference (shape sanity) ────────────────
try {
  const dir = path.join(NODE_MODULES, 'dsh-web-app', 'presets');
  const presets = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.patch.yml')) : [];
  check('web-app still ships canonical presets (' + presets.join(', ') + ')', presets.length > 0);
} catch (error) { findings.push('dsh-web-app: ' + error.message); }

console.log('');
if (notes.length) { for (const note of notes) console.log('NOTE  ' + note); console.log(''); }
if (findings.length) {
  for (const finding of findings) console.log('FAIL  ' + finding);
  console.log('');
  console.log(findings.length + ' host-contract finding(s) on host ' + version + '.');
  console.log('If the host changed on purpose, update cordis.patch.yml / plugin code and this snapshot together.');
  process.exit(1);
}
console.log('host contracts intact on DSH ' + version);
