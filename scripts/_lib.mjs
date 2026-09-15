/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 *
 * Shared helpers for validation scripts.
 * Pure Node built-ins, no deps. ESM only.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const COLORS = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};

const tty = () => process.stdout.isTTY && !process.env.NO_COLOR;
export const c = (color, s) => tty() ? `${COLORS[color]}${s}${COLORS.reset}` : s;
export const ok    = (msg) => console.log(`${c('green', '✓')} ${msg}`);
export const warn  = (msg) => console.warn(`${c('yellow', '!')} ${msg}`);
export const fail  = (msg) => console.error(`${c('red', '✘')} ${msg}`);
export const head  = (msg) => console.log(`\n${c('bold', msg)}`);
export const line  = (msg) => console.log(`  ${c('dim', msg)}`);

export function walk(dir, { ext = null, ignore = [] } = {}) {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.cache', ...ignore]);
  const _walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (skip.has(name)) {
        continue;
      }
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        _walk(p);
      } else if (!ext || (Array.isArray(ext) ? ext.includes(extname(p)) : extname(p) === ext)) {
        out.push(p);
      }
    }
  };
  _walk(dir);
  return out;
}

export const read = (p) => readFileSync(p, 'utf8');
export const rel  = (p) => relative(REPO_ROOT, p);

export function exitWith({ failures, name }) {
  console.log('');
  if (failures.length === 0) {
    ok(`${name} — passed`);
    process.exit(0);
  }
  fail(`${name} — ${failures.length} issue(s)`);
  process.exit(1);
}

/* Test if file content carries the CCS license header in the first 8 lines. */
export function hasCcsHeader(content) {
  const head_lines = content.split('\n').slice(0, 8).join('\n');
  return /Copyright/i.test(head_lines)
    && /(@Kyonax|Kyonax|Cristian)/i.test(head_lines)
    && /(GPL|MPL|Apache|Mozilla Public License)/i.test(head_lines);
}

/* ISO YYYY-MM-DD for the current UTC moment. */
export const today = () => new Date().toISOString().slice(0, 10);

/* True when dst_path is missing, older than src_path, or force is set. */
export function isOutdated(src_path, dst_path, { force = false } = {}) {
  if (force) {
    return true;
  }
  if (!existsSync(dst_path)) {
    return true;
  }
  const src_mtime = statSync(src_path).mtimeMs;
  const dst_mtime = statSync(dst_path).mtimeMs;
  return src_mtime > dst_mtime;
}
