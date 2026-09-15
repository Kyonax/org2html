/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/comments/sprite.ts — composite a thread's avatars into ONE image.
 *
 * WHY. Each avatar is its own request. Twenty comments is twenty round trips for pictures that
 * total a few kilobytes, and on a cold connection the handshakes cost more than the bytes. A
 * sprite collapses them into one: the page loads a single strip and each avatar is a WINDOW
 * onto it, positioned by CSS. Measured on the four sample identicons — one 4-cell WebP sheet is
 * 1452 bytes against 3106 bytes as separate files, and one request against four. The gap widens
 * with every comment, which is when it starts to matter.
 *
 * It also protects the property the whole comment feature was built around: a reader makes ZERO
 * requests to X. The sheet is composed here, from already-vendored bytes.
 *
 * THIS IS THE ONE MODULE IN src/comments/ THAT TOUCHES DISK, and it is deliberate: everything
 * else here is pure so it can be proven with data alone, while a sprite is by definition a file.
 * The geometry and the composition are still kept pure and injectable (`tileOf` / `composeSheet`
 * take `sharp` as an argument), so the arithmetic that the stylesheet depends on can be tested
 * without an image library present at all.
 *
 * sharp is an OPTIONAL install, NOT a dependency of this package ([#42]): it appears zero times
 * in either built bundle and weighs ~32 MB with @img, so every consumer downloading it for a
 * feature most will never use is not a trade this package makes for them. Without it the sprite
 * is skipped and the individual avatars still work — but the degradation is always PRINTED by
 * the caller, never silent.
 */

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type { Thread } from "./types.js"

/* 64px of picture for a 32px box, so the sheet still looks right on a 2x display. */
const CELL = 64

/* The size the page actually draws a cell at. It lives here rather than only in the CSS because
 * every offset below is a DISPLAY-space number derived from it, and the component reads those
 * numbers back out of the JSON — so the sheet and the stylesheet cannot drift apart. */
const DISPLAY = 32

/*
 * A GUTTER OF COPIED EDGE PIXELS AROUND EVERY CELL.
 *
 * The sheet is drawn smaller than it is stored, and a scaler does not sample one pixel — it
 * samples a neighbourhood. At an exact 2:1 reduction that neighbourhood stays inside the cell,
 * but a viewer at 1.25x or 1.5x device scaling makes the ratio fractional and the kernel can
 * reach across a cell boundary and pull in the NEXT PERSON'S FACE along the seam.
 *
 * Padding each cell with a copy of its own edge row is the standard texture-atlas answer:
 * whatever the filter reaches into is the same avatar's colour, so contamination is not
 * mitigated, it is impossible. Transparent padding would not do — the filter would blend toward
 * transparency and leave a bright or dark hairline instead.
 */
const GUTTER = 4
const PITCH = CELL + GUTTER * 2
/* Display-space geometry, derived once. */
const SCALE = DISPLAY / CELL
const STEP = PITCH * SCALE
const INSET = GUTTER * SCALE

/* The whole contract in one object, so a test can check the arithmetic without an image
 * library and a component can be checked against the same numbers. */
export const GEOMETRY = { CELL, GUTTER, PITCH, DISPLAY, SCALE, STEP, INSET }

/*
 * A vector stand-in declares a 5-unit viewBox, and sharp believes it — without an explicit
 * density every sample cell rasterises at FIVE PIXELS and is then upscaled to mush. Density is
 * ignored for raster input, so it is safe to pass for every file.
 */
const DENSITY = 1200

/** The sharp surface this module uses. Structural, so no @types/sharp import is needed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SharpLike = any

/**
 * Resolve `sharp` if the operator installed it, else null. NEVER throws: a missing optional
 * install is an expected state, not an error. The CALLER reports it — see the module header.
 */
export async function loadSharp(): Promise<SharpLike | null> {
  try {
    /* A bare dynamic import of a package that may not exist would be resolved statically by the
     * bundler and turned into a hard dependency. The indirection keeps it a runtime lookup, which
     * is the whole point of an optional install. */
    const name = "sharp"
    return (await import(/* @vite-ignore */ name)).default
  } catch {
    return null
  }
}

/*
 * The cell order is the SORTED list of distinct avatar files. Sorting is what makes the sheet
 * reproducible: the same set of avatars must produce byte-identical output on every run, or a
 * scheduled job commits a new binary every night for no reason.
 */
export function cellsFor(thread: Thread): string[] {
  const names = (thread.comments ?? [])
    .map((c) => (c as { avatar?: string }).avatar)
    .filter((n): n is string => Boolean(n))
  return [...new Set(names)].sort()
}

/*
 * Content-addressed, so a new comment changes the URL. A sprite referenced by a stable name
 * would be served from cache after the thread grew, and the second half of the strip would show
 * the wrong faces — an off-by-one that looks like a privacy bug rather than a caching one.
 */
export function sheetName(cells: string[]): string {
  /* Hashing the INPUT LIST, not the output bytes. Every source file is itself content-addressed,
   * so the list determines the picture — while hashing the output would rename the sheet on a
   * libvips upgrade and rewrite the JSON for an image nobody can tell apart. */
  const hash = createHash("sha256").update(`${CELL}|${GUTTER}|v2|${cells.join("\n")}`)
  return `sprite-${hash.digest("hex").slice(0, 16)}.webp`
}

/* One cell: square, opaque, and padded with a copy of its own edge. */
export function tileOf(sharp: SharpLike, buf: Buffer): Promise<Buffer> {
  return (
    sharp(buf, { density: DENSITY })
      /* Always resized to the same square, whatever came in. Geometry is fixed by this call
       * rather than by how the source declared itself, which is what makes a 5-unit viewBox and a
       * 73px JPEG interchangeable here. */
      .resize(CELL, CELL, { fit: "cover", position: "centre" })
      /* A transparent avatar would otherwise punch a hole in the sheet and show whatever the page
       * put behind it. Flatten onto the same well the empty plate uses. */
      .flatten({ background: "#0a0a0a" })
      /* The edge-clamped gutter. `copy` replicates the outermost row rather than filling with a
       * colour, which is what makes a stray sample by the scaler harmless. */
      .extend({ top: GUTTER, bottom: GUTTER, extendWith: "copy" })
      .png()
      .toBuffer()
  )
}

/*
 * ONE COLUMN. A vertical strip lets the CSS scale on width alone and shift only on Y — correct
 * for any number of cells, with no width arithmetic to keep in step with the sheet and therefore
 * no way for the two to disagree.
 */
export async function composeSheet(sharp: SharpLike, sources: Buffer[]): Promise<Buffer> {
  const tiles = await Promise.all(sources.map((buf) => tileOf(sharp, buf)))
  return sharp({
    create: {
      width: CELL,
      height: PITCH * tiles.length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(tiles.map((input, i) => ({ input, left: 0, top: i * PITCH })))
    .webp({ quality: 88 })
    .toBuffer()
}

export interface SpriteResult {
  /** Set when nothing was composed, with the reason — the caller PRINTS it. */
  skipped?: string
  cells?: number
  name?: string
  bytes?: number
}

export interface SpriteOptions {
  /** Directory holding <postId>.json and the avatars/ it references. */
  cacheDir: string
  force?: boolean
  /** Injected in tests so the composition can be exercised without the optional install. */
  sharp?: SharpLike | null
}

/**
 * Composite one thread's avatars and record the geometry back into its cache file.
 *
 * The sprite URL written into the JSON is ROOT-ABSOLUTE (`/comments/<sheet>`) because a host
 * serves this directory at a public path it alone knows; `--asset-base` is the engine-side
 * answer to sub-path deploys and is not this tool's to guess.
 */
export async function buildSpriteFor(postId: string, options: SpriteOptions): Promise<SpriteResult> {
  const { cacheDir, force = false } = options
  const sharp = options.sharp !== undefined ? options.sharp : await loadSharp()
  if (!sharp) return { skipped: "sharp is not installed" }

  const cachePath = join(cacheDir, `${postId}.json`)
  if (!existsSync(cachePath)) return { skipped: "no cache" }
  const thread = JSON.parse(readFileSync(cachePath, "utf8")) as Thread & {
    sprite?: unknown
    comments?: Array<Record<string, unknown>>
  }

  const cells = cellsFor(thread)
  if (cells.length === 0) {
    /* Nobody has a picture. Drop any stale sheet rather than leaving a dangling reference. */
    delete thread.sprite
    for (const c of thread.comments ?? []) delete c.avatarIndex
    writeFileSync(cachePath, `${JSON.stringify(thread, null, 2)}\n`)
    return { cells: 0 }
  }

  const avatarsDir = join(cacheDir, "avatars")
  const sources = cells.map((name) => readFileSync(join(avatarsDir, name)))
  const name = sheetName(cells)
  const dest = join(cacheDir, name)

  if (!existsSync(dest) || force) {
    const sheet = await composeSheet(sharp, sources)
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(dest, sheet)
  }

  /* One sheet per thread at a time — a superseded one is dead weight in the repo. */
  for (const f of readdirSync(cacheDir)) {
    if (f.startsWith("sprite-") && f.endsWith(".webp") && f !== name) {
      const stillUsed = readdirSync(cacheDir).some((other) => {
        if (!other.endsWith(".json") || other === `${postId}.json`) return false
        try {
          const parsed = JSON.parse(readFileSync(join(cacheDir, other), "utf8")) as {
            sprite?: { url?: string }
          }
          return parsed.sprite?.url?.endsWith(f) === true
        } catch {
          /* A corrupt neighbour must not cost a live sheet: treat it as still using the file. */
          return true
        }
      })
      if (!stillUsed) rmSync(join(cacheDir, f))
    }
  }

  const index = new Map(cells.map((cell, i) => [cell, i]))
  for (const comment of thread.comments ?? []) {
    /* null, not absent: a commenter with no picture keeps the reserved empty plate. */
    const avatar = comment.avatar as string | undefined
    comment.avatarIndex = avatar ? (index.get(avatar) ?? null) : null
  }
  /* Every number the stylesheet needs, in DISPLAY pixels, computed from the same constants that
   * built the image. The CSS reads these rather than hardcoding them, so a change to CELL or
   * GUTTER cannot leave the page shifted by a few pixels into somebody else's avatar. */
  thread.sprite = {
    url: `/comments/${name}`,
    cells: cells.length,
    cell: CELL,
    gutter: GUTTER,
    size: DISPLAY,
    step: STEP,
    inset: INSET,
  }
  writeFileSync(cachePath, `${JSON.stringify(thread, null, 2)}\n`)

  return { cells: cells.length, name, bytes: readFileSync(dest).length }
}
