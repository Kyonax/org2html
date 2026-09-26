#!/usr/bin/env node
/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 *
 * check-license-headers.mjs — assert every src/ + scripts/ source
 * file carries the GPL-3.0-only preamble.
 *
 * Run: node scripts/check-license-headers.mjs
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { exitWith, fail, hasCcsHeader, head, ok, read, rel, REPO_ROOT, walk } from './_lib.mjs';

const ROOTS = ['src', 'scripts'].map((r) => join(REPO_ROOT, r)).filter(existsSync);
if (ROOTS.length === 0) {
  ok('no src/ or scripts/ yet. Skipping.');
  process.exit(0);
}

const files = ROOTS.flatMap((r) => walk(r, { ext: ['.ts', '.tsx', '.js', '.mjs'] }));

const failures = [];

head(`check-license-headers — ${files.length} files`);

for (const f of files) {
  const src = read(f);
  if (!hasCcsHeader(src)) {
    failures.push(`${rel(f)}: missing CCS license header`);
  }
}

if (failures.length) {
  console.log('');
  for (const f of failures) {
    fail(f);
  }
}
exitWith({ failures, name: 'check-license-headers' });
