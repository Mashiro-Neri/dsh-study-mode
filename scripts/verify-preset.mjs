// Runtime verification harness for this bundle against a real DSH host.
//
// It boots a real DSH host (an extracted 0.2.1-rc.x runtime) in a throwaway
// DSH_HOME, links this bundle into a throwaway profile, starts the web app
// without opening a browser, exchanges the launch token for a session cookie,
// and calls the `agentPresets/list` remote — the same roster the Web UI's mode
// picker reads. A preset that fails to mount shows up there under `broken`,
// which is exactly what the red "加载失败" card renders.
//
// Modes:
//   (default)          main preset mounts cleanly; the internal child preset is
//                      hidden from the roster
//   --with-internal    disables the roster shim (via a --patch overlay) and
//                      asserts the child preset itself mounts cleanly
//   --broken-internal  makes a temp copy with one deliberately invalid child
//                      row and asserts the shim does NOT hide the broken child
//                      (so its red card and error text stay visible)
//
// Runtime location (one of):
//   --runtime <dir>    a directory containing node_modules/@deepseek-ai/dsh
//                      (extract it from the Desktop app's resources/app.asar)
//   DSH_RUNTIME=<dir>  environment variable with the same meaning
//
// Node binary (one of):
//   --node <exe>       default: $DSH_HOME/dsh-runtimes/*/dependencies/node/bin/node*
//                      when present, else the current process.execPath
//
// Usage:
//   node scripts/verify-preset.mjs --runtime <dir>
//   node scripts/verify-preset.mjs --runtime <dir> --with-internal
//   node scripts/verify-preset.mjs --runtime <dir> --broken-internal
//   node scripts/verify-preset.mjs --runtime <dir> --keep   (leave the host up)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(HERE, '..');
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const fail = (msg) => { console.error('\nVERIFY FAILED: ' + msg); process.exit(1); };
const pass = (msg) => console.log('ok   ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const presetId = String(arg('preset', 'study'));
const withInternal = argv.includes('--with-internal');
const brokenInternal = argv.includes('--broken-internal');
const keep = argv.includes('--keep');
const port = Number(arg('port', String(56000 + Math.floor(Math.random() * 900))));

let bundleDir = BUNDLE;
const bundlePkg = JSON.parse(fs.readFileSync(path.join(bundleDir, 'package.json'), 'utf8'));
const bundleName = bundlePkg.name;

// ---- runtime / node discovery ---------------------------------------------
function findNode() {
  const explicit = arg('node', null);
  if (explicit) return String(explicit);
  if (process.env.DSH_NODE) return process.env.DSH_NODE;
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const runtimes = path.join(home, 'dsh-runtimes');
  if (fs.existsSync(runtimes)) {
    for (const entry of fs.readdirSync(runtimes)) {
      const base = path.join(runtimes, entry, 'dependencies', 'node', 'bin');
      for (const name of ['node.exe', 'node']) {
        const candidate = path.join(base, name);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return process.execPath;
}

let runtimeDir = arg('runtime', null) || process.env.DSH_RUNTIME || null;
if (!runtimeDir) {
  fail('no DSH runtime given.\n' +
    '  Pass --runtime <dir> (or set DSH_RUNTIME) where <dir> contains\n' +
    '  node_modules/@deepseek-ai/dsh/lib/bin.js.\n' +
    '  On the Desktop app, extract it from resources/app.asar:\n' +
    '    npx @electron/asar extract "C:/.../resources/app.asar" <dir>\n' +
    '    cp -r "C:/.../resources/app.asar.unpacked/dsh/node_modules/." <dir>/node_modules/');
}
runtimeDir = path.resolve(String(runtimeDir));
const bin = path.join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
if (!fs.existsSync(bin)) fail('host CLI not found at ' + bin);
const nodeExe = findNode();
if (!fs.existsSync(nodeExe)) fail('node executable not found at ' + nodeExe);

// ---- temp workspace + profile ---------------------------------------------
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-study-mode-verify-'));
const home = path.join(work, 'home');
const profileName = 'verify';
const profileDir = path.join(home, 'profiles', profileName);
console.log('runtime   ' + runtimeDir);
console.log('node      ' + nodeExe);
console.log('workdir   ' + work);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

// `--broken-internal` tests the shim's failure-visibility contract on a copy.
if (brokenInternal) {
  const copy = path.join(work, 'bundle');
  copyDir(bundleDir, copy);
  const patchFile = path.join(copy, 'cordis.patch.yml');
  const text = fs.readFileSync(patchFile, 'utf8');
  const marker = '          - id: tool-fs\n            name: \'@deepseek-ai/dsh-tool-fs\'';
  const at = text.indexOf(marker);
  if (at === -1) fail('--broken-internal: could not locate the child preset tool rows');
  const brokenRow = '          - id: broken-on-purpose\n' +
    '            name: \'@deepseek-ai/dsh-tool-does-not-exist\'\n';
  fs.writeFileSync(patchFile, text.slice(0, at) + brokenRow + text.slice(at));
  bundleDir = copy;
  console.log('mode      broken-internal (temp bundle copy)');
}

const profilePkgPath = path.join(profileDir, 'package.json');
const profilePkg = {
  name: 'dsh-profile-verify',
  private: true,
  dependencies: {},
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', bundleName] } },
};
fs.mkdirSync(path.join(profileDir, 'node_modules', '@dsh-community'), { recursive: true });
fs.mkdirSync(path.join(profileDir, 'node_modules', '@local'), { recursive: true });
if (!fs.existsSync(profilePkgPath)) {
  fs.writeFileSync(profilePkgPath, JSON.stringify(profilePkg, null, 2) + '\n');
  fs.writeFileSync(path.join(profileDir, 'cordis.yml'), '[]\n');
  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '[]\n');
  fs.writeFileSync(path.join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\n');
}

// Link the bundle under both its canonical name and the @local alias, so the
// patch's customSkillDirs candidate list can resolve either install layout.
const leaf = bundleName.startsWith('@') ? bundleName.split('/')[1] : bundleName;
for (const name of [bundleName.startsWith('@') ? bundleName : null, '@local/' + leaf].filter(Boolean)) {
  const [scopeName, pkgName] = name.split('/');
  const scopeDir = path.join(profileDir, 'node_modules', scopeName);
  fs.mkdirSync(scopeDir, { recursive: true });
  const link = path.join(scopeDir, pkgName);
  fs.rmSync(link, { recursive: true, force: true });
  fs.symlinkSync(bundleDir, link, 'junction');
}
const profileNow = JSON.parse(fs.readFileSync(profilePkgPath, 'utf8'));
if (!profileNow.dsh.profile.bundles.includes(bundleName)) profileNow.dsh.profile.bundles.push(bundleName);
fs.writeFileSync(profilePkgPath, JSON.stringify(profileNow, null, 2) + '\n');

// `--with-internal` disables the roster shim through an extra patch overlay;
// this bundle's row id is stable (`study-hide-internal-presets`).
const overlayArgs = [];
if (withInternal) {
  const overlay = path.join(work, 'no-shim.patch.yml');
  fs.writeFileSync(overlay, '- id: study-hide-internal-presets\n  disabled: true\n');
  overlayArgs.push('--patch', overlay);
  console.log('mode      with-internal (roster shim disabled)');
}

// ---- boot the host ---------------------------------------------------------
let stopping = false;
const child = spawn(nodeExe, [bin, '--profile', profileName, ...overlayArgs, '--no-open', '--port', String(port)], {
  cwd: work,
  env: { ...process.env, DSH_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });
child.on('exit', (code) => {
  if (!stopping) fail('host exited early (' + code + ')\n' + out.slice(-4000));
});

async function waitForToken(timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const m = /dsh web:\s+(http:\/\/\S+\?token=\S+)/.exec(out);
    if (m) return m[1];
    await sleep(250);
  }
  return null;
}

async function callRoster(cookie) {
  const rpcId = randomUUID();
  const res = await fetch(`http://127.0.0.1:${port}/api/agentPresets/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'agentPresets/list', payload: { args: {} } }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = await res.json();
  if (body.type !== 'server-response') throw new Error('bad envelope');
  if (!body.result.ok) throw new Error(body.result.error?.message ?? 'remote error');
  return body.result.value;
}

// Internal preset ids come from the roster shim itself: it is the single source
// of truth for what must stay out of the mode picker.
const shimFile = path.join(bundleDir, 'plugin', 'hide-internal-presets.js');
let internalPresets = [];
if (fs.existsSync(shimFile)) {
  const block = /INTERNAL_PRESETS\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(fs.readFileSync(shimFile, 'utf8'));
  if (block) internalPresets = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

(async () => {
  try {
    const url = await waitForToken();
    if (!url) fail('web host did not print a token URL in 120s\n' + out.slice(-4000));
    console.log('web host  ' + url.replace(/token=[^&]+/, 'token=<redacted>'));

    const res = await fetch(url, { redirect: 'manual' });
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    if (!cookie) fail('token exchange returned no session cookie (HTTP ' + res.status + ')');
    pass('launch token exchanged for a session cookie');

    const roster = await callRoster(cookie);
    const label = (p) => p.id + (p.broken ? '(broken)' : '');
    console.log('roster    ' + roster.presets.map(label).join(', '));

    const main = roster.presets.find((p) => p.id === presetId);
    if (!main) fail(`preset "${presetId}" is not in the roster`);
    if (main.broken) {
      console.error('\nPRESET BROKEN:\n' + main.broken);
      fail(`preset "${presetId}" is marked broken`);
    }
    pass(`preset "${presetId}" mounts cleanly (${main.name || ''})`);

    const failures = out.split('\n').filter((line) => /agent preset [\w-]+:/.test(line));

    if (brokenInternal) {
      const child = roster.presets.find((p) => internalPresets.includes(p.id));
      if (!child) fail('broken internal preset is missing from the roster — the shim hid it, ' +
        'so its error would be invisible in the UI');
      if (!child.broken) fail('internal preset was expected to be broken in this mode');
      pass(`broken internal preset stays visible with its error: ${child.id}`);
    } else {
      const leaked = roster.presets.filter((p) => internalPresets.includes(p.id));
      if (withInternal) {
        for (const id of internalPresets) {
          const entry = roster.presets.find((p) => p.id === id);
          if (!entry) fail(`child preset "${id}" is missing from the unfiltered roster`);
          if (entry.broken) fail(`child preset "${id}" is broken:\n${entry.broken}`);
        }
        pass('internal child presets mount cleanly: ' + internalPresets.join(', '));
      } else {
        if (leaked.length) fail('internal child preset(s) leaked into the mode picker: ' + leaked.map((p) => p.id).join(', '));
        pass('internal child presets hidden from the roster: ' + internalPresets.join(', '));
      }
      if (failures.length) fail('host logged preset activation failures:\n' + failures.join('\n'));
      pass('no preset activation failure in the host log');
    }

    if (/no skills directory resolved|cannot locate its own installed package/.test(out)) {
      fail('skill directory resolution failed: ' +
        out.match(/.{0,120}(no skills directory resolved|cannot locate its own installed package).{0,200}/)?.[0]);
    }
    pass('bundled skill directory resolved');

    console.log('\nVERIFY PASSED');
    process.exitCode = 0;
  } catch (error) {
    console.error('\nVERIFY ERROR: ' + (error instanceof Error ? error.stack : String(error)));
    process.exitCode = 1;
  } finally {
    stopping = true;
    if (!keep) {
      try { child.kill(); } catch {}
      await sleep(500);
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
      try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    } else {
      console.log('--keep: host left running on port ' + port + ' (workdir ' + work + ')');
    }
  }
})();
