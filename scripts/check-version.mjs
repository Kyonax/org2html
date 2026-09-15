#!/usr/bin/env node
/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 *
 * check-version.mjs — the version literals agree with each other, and with the pushed tag.
 *
 * WHY THIS EXISTS. `1.1.0` is hand-maintained in SIX places across four files, and until now
 * nothing compared them. A release could ship a package.json at 1.1.0 behind a README badge
 * still reading 1.0.2, or a Style Book declaring a version the engine no longer is — and every
 * gate would stay green, because no gate was looking.
 *
 * WORSE: NOTHING CHECKED THE TAG. .github/workflows/publish.yml triggers on `v*.*.*` and
 * publishes to npm. Pushing `v1.2.0` at a tree whose package.json said 1.1.0 would publish
 * 1.1.0 under a tag claiming otherwise, or fail deep inside `npm publish` after the gates had
 * already passed. Under GITHUB_REF_TYPE=tag this script refuses the mismatch up front.
 *
 * The CLI's own --version is NOT checked here and does not need to be: tsup injects
 * __PACKAGE_VERSION__ from package.json at build time, so it is derived rather than written,
 * and smoke-install.mjs already asserts the built binary reports package.json's version.
 *
 * A DECLARED CHECK THAT CANNOT BE FOUND IS A FAILURE, NOT A SKIP [#37] — the same law
 * precheck.mjs follows. A source file that has moved or been renamed fails loudly here rather
 * than silently reducing what is verified.
 *
 * Run: node scripts/check-version.mjs
 * Exit: 0 everything agrees · 1 a disagreement, listed
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pkg = JSON.parse(read('package.json'));
const VERSION = pkg.version;

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(VERSION ?? '')) {
  console.error(red('✗'), `package.json version is not a semver: ${JSON.stringify(VERSION)}`);
  process.exit(1);
}

/*
 * Each source states WHERE it is and HOW to read the version out of it. A `find` returning
 * null means "the shape this file is supposed to have is gone" — which is a failure, because
 * the literal it was guarding is then unguarded.
 */
const SOURCES = [
  {
    id: 'package.json',
    file: 'package.json',
    find: (s) => JSON.parse(s).version,
    note: 'the single source of truth',
  },
  {
    id: 'README.org #+VERSION',
    file: 'README.org',
    find: (s) => s.match(/^#\+VERSION:\s*v?(\d+\.\d+\.\d+)/m)?.[1],
  },
  {
    id: 'README.org figlet banner',
    file: 'README.org',
    // The ASCII banner carries the version in its last row.
    find: (s) => s.match(/^#.*?\bv(\d+\.\d+\.\d+)\s*$/m)?.[1],
  },
  {
    id: 'README.org shields badge',
    file: 'README.org',
    // The badge repeats it three times (URL path, label, alt) — all three must agree.
    find: (s) => {
      const hits = [...s.matchAll(/badge\/version-v(\d+\.\d+\.\d+)-|alt="v(\d+\.\d+\.\d+)"/g)]
        .map((m) => m[1] ?? m[2])
        .filter(Boolean);
      if (hits.length === 0) return undefined;
      return hits.every((h) => h === hits[0]) ? hits[0] : `MIXED(${[...new Set(hits)].join(', ')})`;
    },
  },
  {
    id: 'stylebook.json (kwo)',
    file: 'templates/style-book/stylebook.json',
    find: (s) => JSON.parse(s).version,
  },
  {
    id: 'stylebook.json (o2h)',
    file: 'templates/style-book/o2h/stylebook.json',
    find: (s) => JSON.parse(s).version,
  },
];

console.log(`check-version — package.json declares ${green(VERSION)}\n`);

const failures = [];
for (const src of SOURCES) {
  if (!existsSync(join(ROOT, src.file))) {
    failures.push(`${src.id}: ${src.file} does not exist`);
    console.log(red('✗'), `${src.id.padEnd(28)} MISSING FILE ${src.file}`);
    continue;
  }
  let found;
  try {
    found = src.find(read(src.file));
  } catch (err) {
    failures.push(`${src.id}: could not be read (${err.message})`);
    console.log(red('✗'), `${src.id.padEnd(28)} UNREADABLE`);
    continue;
  }
  if (found === undefined || found === null) {
    // Not "no version here, fine" — the literal this row guards is now unguarded.
    failures.push(`${src.id}: no version literal found in ${src.file}`);
    console.log(red('✗'), `${src.id.padEnd(28)} NOT FOUND in ${src.file}`);
    continue;
  }
  if (found !== VERSION) {
    failures.push(`${src.id}: ${found} ≠ ${VERSION}`);
    console.log(red('✗'), `${src.id.padEnd(28)} ${found}`);
    continue;
  }
  console.log(green('✓'), `${src.id.padEnd(28)} ${found}`, src.note ? dim(`(${src.note})`) : '');
}

/*
 * THE CHANGELOG MUST NAME THIS RELEASE. Publishing a version with no heading of its own leaves
 * consumers reading "[Unreleased]" for something that is very much released.
 */
const changelog = read('CHANGELOG.org');
const heading = new RegExp(`^\\*\\s*\\[v${VERSION.replace(/\./g, '\\.')}\\]`, 'm');
if (heading.test(changelog)) {
  console.log(green('✓'), `${'CHANGELOG.org heading'.padEnd(28)} [v${VERSION}]`);
  const line = changelog.match(new RegExp(`^\\*\\s*\\[v${VERSION.replace(/\./g, '\\.')}\\].*$`, 'm'))[0];
  // A heading left as a placeholder is not a released heading.
  if (/<DATE>|<TITLE>|TBD/i.test(line)) {
    failures.push(`CHANGELOG.org: [v${VERSION}] still carries a placeholder — ${line.trim()}`);
    console.log(red('✗'), `${'CHANGELOG.org placeholder'.padEnd(28)} ${line.trim()}`);
  }
} else {
  failures.push(`CHANGELOG.org: no [v${VERSION}] heading — the release is still under [Unreleased]`);
  console.log(red('✗'), `${'CHANGELOG.org heading'.padEnd(28)} no [v${VERSION}]`);
}

/*
 * THE TAG. publish.yml is TAG-DRIVEN, so this is the last thing standing between a mistyped
 * tag and a published mismatch. Only meaningful in a tag build; locally there is no tag and
 * nothing to compare.
 */
const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;
if (refType === 'tag') {
  const tagVersion = (refName ?? '').replace(/^v/, '');
  if (tagVersion === VERSION) {
    console.log(green('✓'), `${'pushed tag'.padEnd(28)} ${refName}`);
  } else {
    failures.push(`tag ${refName} does not match package.json ${VERSION}`);
    console.log(red('✗'), `${'pushed tag'.padEnd(28)} ${refName} ≠ v${VERSION}`);
  }
} else {
  console.log(dim(`  ${'pushed tag'.padEnd(28)} not a tag build — skipped`));
}

console.log('');
if (failures.length) {
  console.error(red(`✗ check-version — ${failures.length} disagreement(s):`));
  for (const f of failures) console.error(`    ${f}`);
  process.exit(1);
}
console.log(green(`✓ check-version — every version literal agrees on ${VERSION}`));
