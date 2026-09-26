/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 *
 * corpus-scan.mjs — deep-test instrument.
 *
 * Renders a whole directory of real-world .org documents
 * in-process and reports every anomaly the harness cannot see:
 * crashes, unexpanded macros, leaked keywords, silent content
 * loss, unresolved file-layer keywords, metadata gaps. Read-only
 * — it never writes into the corpus or the repo.
 *
 * The Vitest harness proves the constructs we thought to write a
 * fixture for. This proves the ones a real corpus actually uses.
 *
 * Run: npm run build && npm run scan:corpus [-- <dir>]
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { c, fail, head, line, ok, walk, warn } from './_lib.mjs';

/*
 * Anomaly classes. `fatal` ones fail the scan: they mean the engine
 * either died or silently changed what the document said — the two
 * outcomes [D-26] forbids. The rest are reported and counted.
 */
const CLASSES = {
  crash:              { fatal: true,  label: 'crashed during parse/render' },
  unexpandedMacro:    { fatal: true,  label: 'unexpanded {{{macro}}} in body' },
  emptyBody:          { fatal: true,  label: 'body rendered (near-)empty from real content' },
  keywordLeak:        { fatal: false, label: 'raw #+KEYWORD: leaked into body' },
  unresolvedSetupfile:{ fatal: false, label: '#+SETUPFILE: not resolved' },
  unresolvedInclude:  { fatal: false, label: '#+INCLUDE: not resolved' },
  ignoredStartup:     { fatal: false, label: '#+STARTUP: not interpreted' },
  noTitle:            { fatal: false, label: 'no #+TITLE and no usable filename fallback' },
  badDate:            { fatal: false, label: '#+DATE: present but not normalized to ISO' },
  recovered:          { fatal: false, label: 'parser recovered from malformed input' },
  slow:               { fatal: false, label: 'render slower than the budget' },
};

const SLOW_MS = 750;
// A body under this many characters of visible text is "empty" — but only
// counts as content loss if the SOURCE had real prose to begin with.
const EMPTY_TEXT = 40;
const SOURCE_CONTENT_LINES = 8;

function parseArgs(argv) {
  const opts = { dir: null, json: false, limit: 0, quiet: false, top: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--limit') opts.limit = Number(argv[++i]) || 0;
    else if (a === '--top') opts.top = Number(argv[++i]) || 12;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (!a.startsWith('-')) opts.dir = a;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(`
corpus-scan — render a corpus of .org documents and report anomalies

Usage:
  npm run scan:corpus [-- <dir>] [--json] [--limit N] [--top N] [--quiet]

  <dir>      Directory to scan (default: $BRAIN_DIR, else ~/.brain.d)
  --json     Emit the full report as JSON on stdout
  --limit N  Scan only the first N files (quick pass)
  --top N    Show at most N files per anomaly class (default 12)
  --quiet    Summary only

Exit codes:
  0  no fatal anomalies
  1  at least one crash, unexpanded macro, or content-loss case
  2  the corpus directory does not exist or holds no .org files
`);
  process.exit(0);
}

const corpusDir = resolve(
  opts.dir || process.env.BRAIN_DIR || join(homedir(), '.brain.d'),
);

let engine;
try {
  engine = await import('../dist/index.mjs');
} catch (err) {
  fail(`cannot load dist/index.mjs — run \`npm run build\` first (${err.message})`);
  process.exit(2);
}
const { parse, renderToHtml, resolveOrgFileKeywords, startupToOptions, titleFromFilename } = engine;

let files;
try {
  files = walk(corpusDir, { ext: '.org' }).sort();
} catch {
  files = [];
}
if (files.length === 0) {
  fail(`no .org files under ${corpusDir}`);
  process.exit(2);
}
if (opts.limit > 0) files = files.slice(0, opts.limit);

/*
 * Strip the regions where Org syntax is legitimately quoted — a document
 * ABOUT org-mode is full of `#+BEGIN_SRC` and `{{{macro}}}` inside code, and
 * flagging those would drown the real signal.
 */
function visibleBody(html) {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/gi, '')
    .replace(/<code[\s\S]*?<\/code>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

const visibleText = (html) => visibleBody(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// Lines of the SOURCE that carry actual content (not keywords, drawers, blanks).
function sourceContentLines(src) {
  return src.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith('#+')) return false;
    if (t.startsWith('#')) return false;
    if (/^:[A-Za-z_@]+:/.test(t)) return false;
    return true;
  }).length;
}

/*
 * A keyword sitting inside #+BEGIN_…/#+END_… is a code SAMPLE, not a directive —
 * a guide that shows readers how to write #+SETUPFILE must not be reported as
 * having an unresolved one. Mirrors the resolver's own block awareness.
 */
function hasLiveKeyword(src, keyword) {
  const open = /^\s*#\+BEGIN[_:]/i;
  const close = /^\s*#\+END[_:]/i;
  const target = new RegExp(`^\\s*#\\+${keyword}:\\s*(.+)$`, 'i');
  let depth = 0;
  for (const line of src.split('\n')) {
    if (open.test(line)) { depth++; continue; }
    if (close.test(line)) { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    const m = line.match(target);
    if (m) return m[1].trim();
  }
  return null;
}

const findings = Object.fromEntries(Object.keys(CLASSES).map((k) => [k, []]));
const record = (cls, file, detail) => findings[cls].push({ file, detail });

const rel = (p) => relative(corpusDir, p) || p;

head(`corpus-scan — ${files.length} .org files under ${corpusDir}`);

const realError = console.error;
const t0 = Date.now();
let rendered = 0;
let totalBytes = 0;

for (const file of files) {
  const short = rel(file);
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch (err) {
    record('crash', short, `unreadable: ${err.message}`);
    continue;
  }

  // Capture engine warnings (recovery paths write to stderr) per file instead
  // of letting them scroll past as untraceable noise.
  const warnings = [];
  console.error = (...args) => warnings.push(args.join(' '));

  const started = Date.now();
  let result;
  let resolvedSrc = src;
  try {
    const resolution = await resolveOrgFileKeywords(src, {
      baseDir: dirname(file),
      roots: [corpusDir],
    });
    for (const w of resolution.warnings) warnings.push(`resolve: ${w}`);
    resolvedSrc = resolution.content;
    result = await renderToHtml(parse(resolvedSrc), { sanitize: true, codeHighlight: false });
  } catch (err) {
    console.error = realError;
    record('crash', short, err.message);
    continue;
  }
  const elapsed = Date.now() - started;
  console.error = realError;

  rendered++;
  const { html, metadata } = result;
  totalBytes += html.length;

  for (const w of warnings) record('recovered', short, w.trim());

  const body = visibleBody(html);
  const text = visibleText(html);

  const macros = body.match(/\{\{\{[^}\n]*\}\}\}/g);
  if (macros) record('unexpandedMacro', short, [...new Set(macros)].slice(0, 3).join(' '));

  const keywords = body.match(/#\+[A-Za-z_@]+:/g);
  if (keywords) record('keywordLeak', short, [...new Set(keywords)].join(' '));

  if (text.length < EMPTY_TEXT && sourceContentLines(resolvedSrc) >= SOURCE_CONTENT_LINES) {
    record('emptyBody', short, `${sourceContentLines(resolvedSrc)} source content lines -> ${text.length} chars out`);
  }

  const liveSetupfile = hasLiveKeyword(resolvedSrc, 'SETUPFILE');
  if (liveSetupfile) record('unresolvedSetupfile', short, liveSetupfile);
  const liveInclude = hasLiveKeyword(resolvedSrc, 'INCLUDE');
  if (liveInclude) record('unresolvedInclude', short, liveInclude);
  const liveStartup = hasLiveKeyword(src, 'STARTUP');
  if (liveStartup && startupToOptions([liveStartup]).length === 0) {
    record('ignoredStartup', short, liveStartup);
  }

  if (!metadata.title && !titleFromFilename(file)) record('noTitle', short, '');
  if (metadata.date && !metadata.dateIso) record('badDate', short, String(metadata.date));
  if (elapsed > SLOW_MS) record('slow', short, `${elapsed}ms`);
}

const duration = Date.now() - t0;

if (opts.json) {
  console.log(JSON.stringify({
    corpusDir, files: files.length, rendered, durationMs: duration, findings,
  }, null, 2));
}

const fatalCount = Object.entries(findings)
  .filter(([cls]) => CLASSES[cls].fatal)
  .reduce((n, [, list]) => n + list.length, 0);

if (!opts.json) {
  line(`rendered ${rendered}/${files.length} in ${duration}ms · ${Math.round(totalBytes / 1024)} KB of HTML`);

  for (const [cls, meta] of Object.entries(CLASSES)) {
    const list = findings[cls];
    if (list.length === 0) continue;
    const tag = meta.fatal ? c('red', 'FATAL') : c('yellow', ' WARN');
    console.log(`\n${tag} ${c('bold', cls)} — ${meta.label} (${list.length})`);
    if (opts.quiet) continue;
    for (const f of list.slice(0, opts.top)) {
      line(f.detail ? `${f.file} :: ${f.detail}` : f.file);
    }
    if (list.length > opts.top) line(`… and ${list.length - opts.top} more`);
  }

  console.log('');
  if (fatalCount === 0) {
    ok(`corpus-scan clean — no crashes, no unexpanded macros, no content loss (${rendered} documents)`);
  } else {
    fail(`corpus-scan found ${fatalCount} fatal anomal${fatalCount === 1 ? 'y' : 'ies'}`);
  }
  const warnCount = Object.entries(findings)
    .filter(([cls]) => !CLASSES[cls].fatal)
    .reduce((n, [, list]) => n + list.length, 0);
  if (warnCount > 0) warn(`${warnCount} non-fatal anomal${warnCount === 1 ? 'y' : 'ies'} reported above`);
}

process.exit(fatalCount === 0 ? 0 : 1);
