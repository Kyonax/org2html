/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/renderer/style-book.ts — Style Book format, resolver & validation ([D-29]).
 *
 * A Style Book is a swappable bundle (a stylebook.json manifest +
 * referenced tokens / styles / template / components) that REPLACES the
 * default O2H look wholesale — no merge. The resolver loads a book from a
 * local directory, an installed npm package (files READ, never imported /
 * run — [D-28]), or a remote URL (fetched + content-hash cached, opt-in).
 * It reads the referenced CSS/template, validates engineCompat + declared
 * construct coverage, and returns a shape the template layer consumes.
 * Reference-don't-build: a book's scripts are surfaced as <script src>
 * references, never executed.
 */

import { readFile, mkdir, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { createHash } from "crypto"
import { tmpdir } from "os"
import { join, dirname, isAbsolute, resolve as resolvePath } from "path"

export interface StyleBookManifest {
  name: string
  version: string
  /** Semver-ish range the book targets, e.g. "^1" or "1.x". */
  engineCompat?: string
  /** Class-hook namespace the book styles against. Default 'org-'. */
  classPrefix?: string
  /** Referenced files (relative to the manifest). */
  /** Browser chrome accent for <meta name="theme-color">. Should match the
   *  book's --o2h-theme-color; the document's #+THEME_COLOR still wins. */
  themeColor?: string
  tokens?: string
  /** One stylesheet, or several concatenated in cascade order. A book that
   *  reuses the shared construct sheet and layers its own delta on top names
   *  both: ["../styles.css", "mybook.css"]. */
  styles?: string | string[]
  template?: string
  layouts?: Record<string, string>
  /** Component name → import source (host wires the runtime — [D-22]). */
  components?: Record<string, string>
  assets?: string[]
  /** Webfont FILENAMES this book wants preloaded, e.g. ["MyBody.woff2"].
   *  Intersected with the faces the build actually copied, so a book can ask for a
   *  preload it does not ship and get silence rather than a 404 ([#41]). Name only the
   *  faces that paint FIRST: preloading every weight fetches the bold before anything
   *  needs it, which costs the very render the preload was meant to protect. */
  preload?: string[]
  /** Referenced scripts — emitted as <script src>, NEVER executed ([D-28]). */
  scripts?: string[]
  /** Declared .org-* construct coverage (for the coverage warning). */
  constructs?: string[]
}

export interface ResolvedStyleBook {
  manifest: StyleBookManifest
  /** Template HTML contents, if the book ships one (else the default is used). */
  template?: string
  /** tokens + styles concatenated for inlining. */
  css: string
  classPrefix?: string
  componentMap?: Record<string, string>
  /** Script hrefs to reference via <script src> (never run). */
  scripts: string[]
  /** Non-fatal validation notes (engineCompat / coverage / missing pieces). */
  warnings: string[]
}

/** The stable .org-* hooks a STRONG book should cover — drives the coverage warning. */
export const KNOWN_CONSTRUCTS = [
  "org-root",
  "org-heading",
  "org-paragraph",
  "org-code",
  "org-verbatim",
  "org-src",
  "org-quote",
  "org-example",
  "org-verse",
  "org-center",
  "org-ul",
  "org-ol",
  "org-dl",
  "org-table",
  "org-link",
  "org-figure",
  "org-toc",
  "org-footnotes",
  "org-hr",
  "org-drawer",
  "org-timestamp",
  "org-tag",
]

const isUrl = (ref: string) => /^https?:\/\//i.test(ref)

// Compare the book's engineCompat range against the running engine version.
// Naive major-version check — enough to catch a book built for a different major.
function checkEngineCompat(range: string | undefined, version: string | undefined): string | null {
  if (!range || !version) return null
  const wantMajor = (range.match(/(\d+)/) ?? [])[1]
  const haveMajor = (version.match(/(\d+)/) ?? [])[1]
  if (wantMajor && haveMajor && wantMajor !== haveMajor) {
    return `engineCompat "${range}" may not match engine v${version}`
  }
  return null
}

// Locate the manifest path for a local dir / file / npm package ref.
function resolveLocalManifestPath(ref: string): string {
  const abs = isAbsolute(ref) ? ref : resolvePath(process.cwd(), ref)
  if (abs.endsWith(".json") && existsSync(abs)) return abs
  const inDir = join(abs, "stylebook.json")
  if (existsSync(inDir)) return inDir
  // npm package: node_modules/<ref>/stylebook.json (read-only — never imported).
  const inPkg = resolvePath(process.cwd(), "node_modules", ref, "stylebook.json")
  if (existsSync(inPkg)) return inPkg
  throw new Error(`style book not found: "${ref}" (looked for stylebook.json in the dir, the path, and node_modules)`)
}

// Fetch a URL body with a content-hash disk cache under the OS temp dir.
async function fetchCached(url: string): Promise<string> {
  const key = createHash("sha256").update(url).digest("hex").slice(0, 16)
  const cacheDir = join(tmpdir(), "o2h-stylebook-cache")
  const cachePath = join(cacheDir, key)
  if (existsSync(cachePath)) return readFile(cachePath, "utf-8")
  const res = await fetch(url)
  if (!res.ok) throw new Error(`style book fetch failed (${res.status}): ${url}`)
  const body = await res.text()
  await mkdir(cacheDir, { recursive: true })
  await writeFile(cachePath, body, "utf-8")
  return body
}

/**
 * Resolve a Style Book reference into its template + inlined CSS + component map.
 * The selected book REPLACES the default wholesale; pieces it omits degrade to
 * bare semantic output with a warning (never a silent fallback to O2H — [D-26]).
 */
export async function resolveStyleBook(
  ref: string,
  opts: { engineVersion?: string } = {},
): Promise<ResolvedStyleBook> {
  const warnings: string[] = []

  let manifest: StyleBookManifest
  let read: (rel: string) => Promise<string>

  if (isUrl(ref)) {
    const manifestUrl = ref.endsWith(".json") ? ref : `${ref.replace(/\/$/, "")}/stylebook.json`
    const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1)
    manifest = parseManifest(await fetchCached(manifestUrl), manifestUrl)
    read = (rel: string) => fetchCached(new URL(rel, base).toString())
  } else {
    const manifestPath = resolveLocalManifestPath(ref)
    const baseDir = dirname(manifestPath)
    manifest = parseManifest(await readFile(manifestPath, "utf-8"), manifestPath)
    read = (rel: string) => readFile(join(baseDir, rel), "utf-8")
  }

  // engineCompat check (warning, never fatal).
  const compatMsg = checkEngineCompat(manifest.engineCompat, opts.engineVersion)
  if (compatMsg) warnings.push(compatMsg)

  // Read the referenced token + style layers; a missing piece degrades to bare
  // output with a warning rather than a silent O2H fallback.
  const cssParts: string[] = []
  const layers: Array<[string, string]> = [
    ...(manifest.tokens ? [["tokens", manifest.tokens] as [string, string]] : []),
    ...(Array.isArray(manifest.styles)
      ? manifest.styles.map((rel) => ["styles", rel] as [string, string])
      : manifest.styles
        ? [["styles", manifest.styles] as [string, string]]
        : []),
  ]
  for (const [label, rel] of layers) {
    try {
      cssParts.push(await read(rel))
    } catch {
      warnings.push(`style book "${manifest.name}": ${label} file "${rel}" could not be read`)
    }
  }

  let template: string | undefined
  if (manifest.template) {
    try {
      template = await read(manifest.template)
    } catch {
      warnings.push(`style book "${manifest.name}": template "${manifest.template}" could not be read`)
    }
  }

  // Coverage warning: list the known hooks the book does not declare.
  if (manifest.constructs && manifest.constructs.length > 0) {
    const declared = new Set(manifest.constructs)
    const missing = KNOWN_CONSTRUCTS.filter((c) => !declared.has(c))
    if (missing.length > 0) {
      warnings.push(`style book "${manifest.name}": undeclared construct coverage → ${missing.join(", ")}`)
    }
  } else {
    warnings.push(`style book "${manifest.name}": no declared construct coverage`)
  }

  return {
    manifest,
    template,
    css: cssParts.join("\n"),
    classPrefix: manifest.classPrefix,
    componentMap: manifest.components,
    scripts: manifest.scripts ?? [],
    warnings,
  }
}

function parseManifest(raw: string, where: string): StyleBookManifest {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    throw new Error(`style book manifest is not valid JSON: ${where}`)
  }
  const m = obj as StyleBookManifest
  if (!m || typeof m.name !== "string" || typeof m.version !== "string") {
    throw new Error(`style book manifest missing required "name"/"version": ${where}`)
  }
  return m
}
