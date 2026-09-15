/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 *
 * smoke-install.mjs — install-smoke gate.
 *
 * Packs the package with `npm pack`, installs the tarball into a
 * throwaway ESM consumer (proving node_modules-depth resolution),
 * then asserts the CLI runs (--version parity, --help), renders a
 * fixture using the BUNDLED templates, and that the library entry
 * resolves through the exports map. Run per Node major in CI.
 *
 * Run: npm run build && node scripts/smoke-install.mjs
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fail, head, line, ok, REPO_ROOT, walk } from './_lib.mjs';

const failures = [];
const check = (cond, msg) => {
  if (cond) {
    ok(msg);
  } else {
    fail(msg);
    failures.push(msg);
  }
};

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const { version } = pkg;

head(`smoke-install — @kyonax/org2html@${version} (node ${process.version})`);

if (!existsSync(join(REPO_ROOT, 'dist', 'cli', 'index.mjs'))) {
  fail('dist/cli/index.mjs missing — run `npm run build` first.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'o2h-smoke-'));
const consumer = join(work, 'consumer');
const packDir = join(work, 'pack');
mkdirSync(consumer, { recursive: true });
mkdirSync(packDir, { recursive: true });

try {
  const packed = run('npm', ['pack', REPO_ROOT, '--pack-destination', packDir]);
  if (packed.status !== 0) {
    fail(`npm pack failed: ${(packed.stderr || packed.stdout || '').trim()}`);
    failures.push('npm pack');
    throw new Error('pack');
  }
  const tgz = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
  check(Boolean(tgz), `packed tarball created (${tgz || 'none'})`);
  const tarball = join(packDir, tgz);

  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      { name: 'o2h-smoke-consumer', version: '1.0.0', type: 'module', private: true },
      null,
      2,
    )}\n`,
  );

  const install = run(
    'npm',
    ['install', '--engine-strict', '--no-audit', '--no-fund', '--loglevel', 'error', tarball],
    { cwd: consumer },
  );
  check(install.status === 0, 'tarball installs into a clean ESM consumer');
  if (install.status !== 0) {
    line((install.stderr || '').trim());
    throw new Error('install');
  }

  const binPath = join(consumer, 'node_modules', '@kyonax', 'org2html', 'dist', 'cli', 'index.mjs');
  check(existsSync(binPath), 'installed CLI entry exists at the declared bin path');

  const ver = run('node', [binPath, '--version']);
  check(
    ver.status === 0 && ver.stdout.trim() === version,
    `org2html --version === ${version} (got "${ver.stdout.trim()}")`,
  );

  const help = run('node', [binPath, '--help']);
  check(help.status === 0 && /org2html/.test(help.stdout), 'org2html --help runs and mentions org2html');

  const fixture = join(consumer, 'post.org');
  writeFileSync(
    fixture,
    '#+TITLE: Smoke Post\n#+DATE: 2026-07-01\n#+DESCRIPTION: install-smoke fixture\n\n* Heading\n\nBody with *bold* and ~code~.\n',
  );
  const outDir = join(consumer, 'out');
  const build = run('node', [binPath, 'build', fixture, '-o', outDir]);
  check(build.status === 0, 'org2html build exits 0 on a valid fixture');

  const htmlFile = existsSync(outDir) ? walk(outDir, { ext: '.html' })[0] : undefined;
  check(Boolean(htmlFile), 'build emitted an .html file');
  if (htmlFile) {
    const html = readFileSync(htmlFile, 'utf8');
    check(/<title>Smoke Post<\/title>/.test(html), 'output uses the bundled default.html (real <title>)');
    check(/og:title/.test(html), 'output carries the SEO <head> from the bundled template');
  }
  check(
    existsSync(join(outDir, 'styles.css')),
    'bundled templates/styles.css resolved from the installed package',
  );

  const libTest = join(consumer, 'lib-test.mjs');
  writeFileSync(
    libTest,
    [
      'import * as m from "@kyonax/org2html";',
      'const want = ["applyTemplate", "org2html", "parse", "renderToHtml"];',
      'const missing = want.filter((k) => !(k in m));',
      'process.stdout.write(missing.length ? "LIB-MISSING:" + missing.join(",") : "LIB-OK");',
      '',
    ].join('\n'),
  );
  const lib = run('node', [libTest], { cwd: consumer });
  check(
    lib.status === 0 && lib.stdout.includes('LIB-OK'),
    `library import resolves via the exports map (${(lib.stdout || lib.stderr || '').trim()})`,
  );
} catch (err) {
  if (failures.length === 0) {
    failures.push(err.message);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log('');
if (failures.length === 0) {
  ok('smoke-install — passed');
  process.exit(0);
}
fail(`smoke-install — ${failures.length} issue(s)`);
process.exit(1);
