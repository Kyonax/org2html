#!/usr/bin/env node
/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 *
 * precheck.mjs — composite gate. Runs every always-on check.
 * Exit 0 → all passed, exit 1 → at least one failed.
 *
 * Run: node scripts/precheck.mjs [--skip=id1,id2]
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { c, head, ok, REPO_ROOT } from './_lib.mjs';

const skipFlag = process.argv.find((a) => a.startsWith('--skip='));
const skip = new Set(skipFlag ? skipFlag.split('=')[1].split(',') : []);

const CHECKS = [
  { id: 'licenses', script: 'scripts/check-license-headers.mjs', label: 'CCS license headers (GPL-3.0-only)' },
];

const results = [];
head('precheck — running all gates');
for (const ch of CHECKS) {
  if (skip.has(ch.id)) {
    ok(`SKIP  ${ch.id} (${ch.label})`);
    continue;
  }
  const abs = join(REPO_ROOT, ch.script);
  if (!existsSync(abs)) {
    ok(`SKIP  ${ch.id} — script not present yet`);
    continue;
  }
  console.log(`\n──── ${c('cyan', ch.id)} :: ${ch.label}`);
  const r = spawnSync('node', [abs], { stdio: 'inherit' });
  results.push({ id: ch.id, code: r.status });
}

console.log('');
head('precheck — summary');
let allPass = true;
for (const r of results) {
  const tag = r.code === 0 ? c('green', 'PASS') : c('red', 'FAIL');
  console.log(`  ${tag}  ${r.id}`);
  if (r.code !== 0) {
    allPass = false;
  }
}
process.exit(allPass ? 0 : 1);
