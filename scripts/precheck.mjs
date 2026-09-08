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
  { id: 'lockfile', script: 'scripts/check-lockfile.mjs', label: 'package-lock.json installs under npm 10 (needs network for npx)' },
  /* The version is hand-maintained in SIX literals across four files, and the pushed TAG is
   * checked against package.json here too — publish.yml is tag-driven, so a mistyped tag is a
   * mis-published release. Neither is expressible as a unit test. */
  { id: 'version', script: 'scripts/check-version.mjs', label: 'Version literals + tag agreement' },
  /* A `^0.x` range can never leave its minor, so it is a PIN wearing a caret. This gate does not
   * forbid one — it forbids an UNACKNOWLEDGED one, so a dependency held four majors back has to
   * say why in writing. Not expressible as a unit test: it reads package.json as shipped. */
  { id: 'pins', script: 'scripts/check-pins.mjs', label: '0.x production ranges are acknowledged pins' },
  /* The comment thread, its content policy and the avatar sprite geometry USED to live here,
   * because they were host-side scripts under examples/site/ and therefore outside vitest.
   * They are engine code now (src/comments/) and are covered by `npm test` — so listing them
   * here would run the same assertions twice and, worse, claim a composite gate is broader
   * than it is. This list holds what genuinely cannot run under vitest, and nothing else. */
];

/*
 * A DECLARED CHECK THAT CANNOT BE FOUND IS A FAILURE, NOT A SKIP.
 *
 * This loop used to `continue` past a missing script without recording anything, so the
 * check vanished from `results` and `allPass` stayed true. A composite gate that reports
 * PASS because it ran nothing is worse than no gate: it is a green light with no evidence
 * behind it. Deleting or renaming a checked path would have quietly taken this from three
 * checks to one and still exited 0.
 *
 * `--skip=` is different and stays: that is an operator saying "not this run", on purpose,
 * and it is printed in the summary so the omission is visible rather than assumed.
 */
const results = [];
const skipped = [];
const missing = [];
head('precheck — running all gates');
for (const ch of CHECKS) {
  if (skip.has(ch.id)) {
    ok(`SKIP  ${ch.id} (${ch.label}) — skipped by --skip`);
    skipped.push(ch.id);
    continue;
  }
  const abs = join(REPO_ROOT, ch.script);
  if (!existsSync(abs)) {
    missing.push({ id: ch.id, script: ch.script });
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
for (const id of skipped) {
  console.log(`  ${c('yellow', 'SKIP')}  ${id} (--skip)`);
}
for (const m of missing) {
  console.log(`  ${c('red', 'MISSING')}  ${m.id} — ${m.script} does not exist`);
  allPass = false;
}
/* Nothing ran and nothing was deliberately skipped: the gate has no evidence to report. */
if (results.length === 0 && skipped.length === 0) {
  console.log(`  ${c('red', 'FAIL')}  no checks executed`);
  allPass = false;
}
process.exit(allPass ? 0 : 1);
