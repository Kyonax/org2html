/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/utils.ts — Shared CLI helpers.
 *
 * Slug / path manipulation used by the build pipeline. Slug
 * convention: `<YYYY-MM-DD>-<slugified-title>` (date sourced
 * from #+DATE metadata, falls back to wall-clock when absent).
 */

import type { OrgMetadata } from "../types.js"
import slugify from "slugify"
import { createHash } from "crypto"
import { basename, relative, dirname, sep } from "path"

/**
 * Human-readable title for a document that declares no #+TITLE, taken from its
 * file name — the same fallback Org uses. Date and ordering prefixes common in
 * note-taking conventions (`2026-08-21-`, `03-`) are dropped so the title reads
 * as a title rather than a filing code.
 */
export function titleFromFilename(filePath: string): string {
  const stem = basename(filePath).replace(/\.org$/i, "")
  const withoutPrefix = stem
    .replace(/^\d{4}-\d{2}-\d{2}(?:-\d{6})?[-_]/, "")
    .replace(/^\d{1,3}[-_](?=\D)/, "")
  const words = (withoutPrefix || stem).replace(/[-_]+/g, " ").trim()
  if (!words) return stem
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function generateSlugFromMetadata(metadata: OrgMetadata, fallbackStem?: string): string {
  // Extract date or generate current timestamp
  let datePrefix = ""

  // Prefer the already-normalized ISO date; for a raw YYYY-MM-DD string use it
  // verbatim (a `new Date("2026-07-01")` parses as UTC midnight and can slip a
  // day under a negative-offset local zone — the known TZ off-by-one). Only fall
  // back to Date parsing for non-ISO date text, reading LOCAL components.
  const isoSource = metadata.dateIso || metadata.date
  if (isoSource) {
    const iso = String(isoSource).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) {
      datePrefix = `${iso[1]}-${iso[2]}-${iso[3]}`
    } else {
      const date = new Date(String(metadata.date))
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, "0")
        const day = String(date.getDate()).padStart(2, "0")
        datePrefix = `${year}-${month}-${day}`
      }
    }
  }

  // Generate slug from title. slugify(strict) keeps only ASCII word characters, so
  // a title written in any non-Latin script — or made only of punctuation, an em
  // dash or an emoji — comes back EMPTY. An empty slug is not a slug: it resolves
  // the page to the output ROOT, and the next build's prune then reads "" back out
  // of the manifest and deletes everything in --output. Fall through instead: the
  // file's own stem, then a stable hash of the title, and never "".
  const slugOf = (text: string) => slugify(text, { lower: true, strict: true })
  const titleSlug =
    (metadata.title ? slugOf(metadata.title) : "") ||
    (fallbackStem ? slugOf(fallbackStem) : "") ||
    (metadata.title ? `untitled-${createHash("sha1").update(metadata.title).digest("hex").slice(0, 8)}` : "") ||
    "untitled"

  // No wall-clock fallback: a missing #+DATE yields a title-only slug so the same
  // input always produces the same output path (idempotent builds + stable
  // canonicals). A date, when present, still prefixes for ordering.
  return datePrefix ? `${datePrefix}-${titleSlug}` : titleSlug
}

export function generatePathFromFile(filePath: string, baseDir: string): string {
  // Get relative path from base directory
  const relativePath = relative(baseDir, filePath)

  // Remove .org extension
  const withoutExt = relativePath.replace(/\.org$/, "")

  // Normalize path separators to forward slashes for URLs
  const normalizedPath = withoutExt.split(sep).join("/")

  return normalizedPath
}

export function extractFolderPath(filePath: string, baseDir: string): string {
  // Get relative path from base directory
  const relativePath = relative(baseDir, filePath)

  // Get directory name (without filename)
  const folderPath = dirname(relativePath)

  // Normalize path separators to forward slashes for URLs
  const normalizedPath = folderPath.split(sep).join("/")

  // Return empty string if it's the root (current directory)
  return normalizedPath === "." ? "" : normalizedPath
}

export function extractBaseDir(pattern: string): string {
  // If it's a specific file, return its directory
  if (pattern.endsWith(".org")) {
    return dirname(pattern)
  }

  // If it's a glob pattern like "content/**/*.org", extract "content"
  const parts = pattern.split("/")
  const globIndex = parts.findIndex((part) => part.includes("*"))

  if (globIndex > 0) {
    return parts.slice(0, globIndex).join("/")
  }

  // Default to the pattern itself (directory)
  return pattern.replace(/\/?\*\*?\/?\*?\.org$/, "") || "."
}
