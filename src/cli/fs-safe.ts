/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/fs-safe.ts — Filesystem safety helpers.
 *
 * writeFileAtomic writes to a sibling temp file then renames, so a
 * crash or SIGINT mid-write never leaves a half-written output.
 * resolveInside rejects any path that escapes the output root, so a
 * stray "../" in a slug or folder can never write outside --output.
 */

import { mkdir, rename, rm, writeFile } from "fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "path"

export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  const tmp = join(
    dir,
    `.org2html-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
  )
  try {
    await writeFile(tmp, data, "utf-8")
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

export function resolveInside(root: string, candidate: string): string {
  const rootResolved = resolve(root)
  const candidateResolved = resolve(root, candidate)
  const rel = relative(rootResolved, candidateResolved)
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new Error(
      `refusing to write outside --output (${root}): resolved to ${candidateResolved}`,
    )
  }
  return candidateResolved
}
