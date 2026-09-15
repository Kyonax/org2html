/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * scripts/check-pins.mjs — every 0.x production range is a deliberate one.
 *
 * A caret range on a 0.x version does not mean what a caret usually means.
 * `^0.14.5` can never leave 0.14, because npm treats a 0.x minor as a breaking
 * boundary. So a dependency written that way is PINNED — and it goes on looking
 * like an open range in package.json while the world moves several majors away.
 * shiki sat at 0.14.7 (December 2023) behind `^0.14.5` while 1.0, 2, 3 and 4
 * shipped, and nothing in this repository said so.
 *
 * This gate does not forbid those ranges. It forbids UNACKNOWLEDGED ones: every
 * 0.x production dependency must be listed below with the reason it is held and
 * where the migration is written down. A new one fails the build until somebody
 * writes that sentence.
 *
 * devDependencies are out of scope: they are not part of what a consumer
 * installs, and their drift is visible in CI rather than in a published package.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A 0.x range that is held ON PURPOSE, why, and where the way out is written.
 * The reason is the point: an entry without one is not an acknowledgement.
 */
const ACKNOWLEDGED = {
  shiki: {
    reason:
      'The css-variables theme this engine binds to (--shiki-* in templates/styles.css, ' +
      'code-highlight.ts) was REMOVED in shiki 1.0, and getHighlighter was renamed. ' +
      'Upgrading is a rewrite of the theme contract, not a version bump.',
    migration: 'docs/shiki-migration.md',
  },
  temml: {
    reason:
      'temml 0.13 is the API this engine renders MathML against. It also declares the ' +
      "package's real Node floor (>=18.13.0), which engines.node now states.",
    migration: 'docs/shiki-migration.md',
  },
};

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const deps = pkg.dependencies ?? {};

const zeroRange = /^[~^]?0\./;
const held = Object.entries(deps).filter(([, range]) => zeroRange.test(range));

console.log('check-pins — 0.x production ranges');
console.log('');

let failures = 0;

for (const [name, range] of held) {
  const ack = ACKNOWLEDGED[name];
  if (!ack) {
    console.error(`✗ ${name}@${range} — a 0.x range can never leave its minor, so this is a PIN.`);
    console.error(`  Add it to ACKNOWLEDGED in scripts/check-pins.mjs with the reason it is held`);
    console.error(`  and where the migration is written, or move it to a 1.x range.`);
    failures++;
    continue;
  }
  console.log(`✓ ${name}@${range}`);
  console.log(`  ${ack.reason}`);
  console.log(`  migration: ${ack.migration}`);
}

// An acknowledgement for something that is no longer pinned is stale bookkeeping
// claiming a decision nobody is making any more.
for (const name of Object.keys(ACKNOWLEDGED)) {
  if (!held.some(([held_]) => held_ === name)) {
    console.error(`✗ ${name} is listed as an acknowledged 0.x pin but is not one any more.`);
    console.error(`  Remove it from ACKNOWLEDGED in scripts/check-pins.mjs.`);
    failures++;
  }
}

console.log('');
if (failures > 0) {
  console.error(`check-pins — ${failures} unacknowledged or stale 0.x pin(s)`);
  process.exit(1);
}
console.log(`check-pins — ${held.length} 0.x range(s), every one acknowledged`);
