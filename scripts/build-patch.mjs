// Render cordis.patch.yml from src/ sources.
//
// Why: the standing persona is ~5,200 characters of prose. Keeping it inline in
// a YAML block scalar makes review and migration diffs unreadable (the migration
// from v1.0.0 had to move the text by script), and a hand-edited scalar is easy
// to break. So src/persona.md + src/practice-persona.md + a template are the
// source of truth, and this script renders the patch that DSH actually loads.
//
// Usage:
//   node scripts/build-patch.mjs          # write cordis.patch.yml
//   node scripts/build-patch.mjs --check  # exit 1 if the checked-in patch is stale
//
// Never hand-edit cordis.patch.yml: edit src/* and re-render.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const TEMPLATE = path.join(SRC, 'cordis.patch.template.yml');
const PERSONAS = {
  '@@MAIN_PERSONA@@': path.join(SRC, 'persona.md'),
  '@@PRACTICE_PERSONA@@': path.join(SRC, 'practice-persona.md'),
};
const OUT = path.join(ROOT, 'cordis.patch.yml');

/** Indent a Markdown file as a YAML block-scalar body (blank lines stay blank). */
function bodyOf(markdownPath, indent) {
  const text = fs.readFileSync(markdownPath, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  if (text.trim() === '') throw new Error(path.basename(markdownPath) + ' is empty');
  return text
    .split('\n')
    .map((line) => (line === '' ? '' : ' '.repeat(indent) + line))
    .join('\n');
}

/** The body indent is the indent of the `prefix: |` key plus two spaces. */
function bodyIndentFor(templateLines, placeholderIndex) {
  for (let i = placeholderIndex - 1; i >= 0; i -= 1) {
    const m = /^(\s*)prefix:\s*\|/.exec(templateLines[i]);
    if (m) return m[1].length + 2;
  }
  throw new Error('no `prefix: |` line found before placeholder at line ' + (placeholderIndex + 1));
}

const template = fs.readFileSync(TEMPLATE, 'utf8').replace(/\r\n/g, '\n');
let rendered = template;
for (const [placeholder, markdownPath] of Object.entries(PERSONAS)) {
  const templateLines = rendered.split('\n');
  const at = templateLines.findIndex((line) => line === placeholder);
  if (at === -1) throw new Error('placeholder missing from template: ' + placeholder);
  const indent = bodyIndentFor(templateLines, at);
  rendered = rendered.replace(placeholder, bodyOf(markdownPath, indent));
}
if (rendered.includes('@@')) throw new Error('unexpanded placeholder left in rendered patch');

const check = process.argv.includes('--check');
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
if (check) {
  if (current !== rendered) {
    console.error('cordis.patch.yml is stale: run `node scripts/build-patch.mjs` and commit the result.');
    process.exit(1);
  }
  console.log('cordis.patch.yml is up to date');
} else if (current !== rendered) {
  fs.writeFileSync(OUT, rendered);
  console.log('rendered cordis.patch.yml (' + rendered.split('\n').length + ' lines, ' +
    rendered.length + ' chars) from src/');
} else {
  console.log('cordis.patch.yml already up to date');
}
