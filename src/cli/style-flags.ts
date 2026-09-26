/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/style-flags.ts — CLI styling-flag resolver ([D-28]).
 *
 * Turns the raw Commander options for the styling knobs (--css /
 * --css-append / --link-css / --css-var / --font / --no-default-styles)
 * into a StyleOptions the template layer consumes. --css/--css-append
 * are read from disk here so the render loop stays synchronous over the
 * resolved CSS. Shared by the build and filter commands.
 */

import { readFile } from "fs/promises"
import type { StyleOptions } from "../types.js"
import { resolveStyleBook } from "../renderer/style-book.js"

export interface StyleFlagInput {
  css?: string
  cssAppend?: string
  linkCss?: string[]
  cssVar?: string[]
  font?: string
  // Commander maps --no-default-styles to `defaultStyles: false`.
  defaultStyles?: boolean
  // --link-styles: host the default sheet at /styles.css instead of inlining it.
  linkStyles?: boolean
  // Commander maps --no-scripts to `scripts: false` (drop the default o2h.js).
  scripts?: boolean
  // --asset-base: path prefix for every root-absolute asset reference. Empty (the
  // default) leaves output byte-identical; see normaliseAssetBase in template.ts.
  assetBase?: string
}

async function readCssOrThrow(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8")
  } catch {
    throw new Error(`CSS file not found: ${path}`)
  }
}

/** Parse `name=value` pairs (from --css-var) into a record. */
export function parseCssVars(pairs: string[] = []): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of pairs) {
    const eq = pair.indexOf("=")
    if (eq < 0) continue
    const key = pair.slice(0, eq).trim()
    const val = pair.slice(eq + 1).trim()
    if (key) out[key] = val
  }
  return out
}

/** Resolve CLI styling flags into a StyleOptions (reads --css/--css-append files). */
export async function resolveStyleOptions(opts: StyleFlagInput): Promise<StyleOptions> {
  let customCss: string | undefined
  let styleMode: "replace" | "append" | undefined
  // --css-append wins over --css when both are given; append preserves defaults.
  // A missing file surfaces a clear message, not a raw ENOENT stack ([D-28]).
  if (opts.cssAppend) {
    customCss = await readCssOrThrow(opts.cssAppend)
    styleMode = "append"
  } else if (opts.css) {
    customCss = await readCssOrThrow(opts.css)
    styleMode = "replace"
  }
  const cssVars = parseCssVars(opts.cssVar)
  return {
    injectDefaultStyles: opts.defaultStyles !== false,
    styleMode,
    customCss,
    linkedStylesheets: opts.linkCss,
    linkDefaultStyles: opts.linkStyles === true,
    linkDefaultScripts: opts.scripts !== false,
    cssVars: Object.keys(cssVars).length ? cssVars : undefined,
    fontStack: opts.font,
    assetBase: opts.assetBase,
  }
}

export interface ResolvedStyling {
  styleOptions: StyleOptions
  classPrefix?: string
  componentMap?: Record<string, string>
  /** Extra files the active Style Book declares. Copied by build, each path confined. */
  bookAssets?: string[]
}

/**
 * Resolve the full styling picture for a CLI command: the granular flags plus an
 * optional --style-book. The book is the BASE (full swap); explicit granular
 * flags OVERRIDE it ([D-29]). Book validation warnings are printed to stderr.
 */
export async function resolveStyling(
  opts: StyleFlagInput & {
    styleBook?: string
    classPrefix?: string
    componentMap?: Record<string, string>
  },
): Promise<ResolvedStyling> {
  const styleOptions = await resolveStyleOptions(opts)
  let classPrefix = opts.classPrefix
  let componentMap = opts.componentMap
  let bookAssets: string[] | undefined

  if (opts.styleBook) {
    const engineVersion = typeof __PACKAGE_VERSION__ !== "undefined" ? __PACKAGE_VERSION__ : undefined
    const book = await resolveStyleBook(opts.styleBook, { engineVersion })
    for (const w of book.warnings) console.error(`org2html: style book warning — ${w}`)
    // Book supplies the base; a granular flag already set wins.
    if (book.template && !styleOptions.templateHtml) styleOptions.templateHtml = book.template
    if (book.css && !styleOptions.customCss) {
      styleOptions.customCss = book.css
      styleOptions.styleMode = "replace"
    }
    if (book.scripts.length) {
      styleOptions.linkedScripts = [...(styleOptions.linkedScripts ?? []), ...book.scripts]
    }
    // The browser-chrome accent follows the book, so swapping the look also
    // swaps <meta name="theme-color"> instead of leaving the previous brand's
    // colour painting the address bar.
    if (book.manifest.themeColor) styleOptions.bookThemeColor = book.manifest.themeColor
    // Which faces the book wants preloaded, and which extra files it ships. Both are
    // honoured only as far as the build can verify: preload is intersected with the fonts
    // actually copied, and every asset path is confined by resolveInside at copy time.
    if (book.manifest.preload) styleOptions.preloadFonts = book.manifest.preload
    bookAssets = book.manifest.assets
    classPrefix = classPrefix ?? book.classPrefix
    componentMap = { ...(book.componentMap ?? {}), ...(componentMap ?? {}) }
  }

  return { styleOptions, classPrefix, componentMap, bookAssets }
}
