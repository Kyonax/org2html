#!/usr/bin/env node
/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 *
 * check-lockfile.mjs — package-lock.json installs under npm 10.
 *
 * npm 11 (this machine, Node 25) tolerates a lock that omits vitest's nested
 * esbuild@0.28.2. npm 10 (setup-node on Node 18/20/22) does not: `npm ci`
 * exits 1 with "Missing: esbuild@0.28.2 from lock file", so every CI and
 * publish job dies before a test runs and a tag would not publish.
 *
 * This check copies package.json + package-lock.json into a temp dir and
 * runs `npm ci --ignore-scripts` under npm@10.9.9. Needs the network for
 * npx. A gate you have not seen fail is not a gate.
 *
 * Run: node scripts/check-lockfile.mjs
 * Exit: 0 lock installs under npm 10 · 1 it does not
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fail, head, ok, REPO_ROOT } from './_lib.mjs';

head('check-lockfile — npm 10 ci against this lock');

const work = mkdtempSync(join(tmpdir(), 'o2h-lock-'));
copyFileSync(join(REPO_ROOT, 'package.json'), join(work, 'package.json'));
copyFileSync(join(REPO_ROOT, 'package-lock.json'), join(work, 'package-lock.json'));

const r = spawnSync(
  'npx',
  ['-y', '-p', 'npm@10.9.9', 'npm', 'ci', '--ignore-scripts', '--dry-run'],
  { cwd: work, encoding: 'utf8' },
);

rmSync(work, { recursive: true, force: true });

const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
if (r.status === 0) {
  ok('check-lockfile — npm 10 ci succeeds');
  process.exit(0);
}

fail(`check-lockfile — npm 10 ci exited ${r.status}`);
const missing = log.split('\n').find((line) => /Missing:/.test(line));
if (missing) {
  console.error(`  ${missing.trim()}`);
} else {
  const tail = log.trim().split('\n').slice(-8);
  for (const line of tail) {
    console.error(`  ${line}`);
  }
}
process.exit(1);
