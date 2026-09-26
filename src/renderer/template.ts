/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/renderer/template.ts — Mustache template engine.
 *
 * Resolves the active template (caller-supplied path →
 * --template-dir/default.html → bundled default.html), then
 * substitutes {{var}} expressions and {{#if foo}}…{{/if}}
 * block helpers against the metadata + injected slots
 * ({{content}}, {{styles}}, {{structuredData}}).
 */

import { readFile } from "fs/promises"
import { join, dirname } from "path"
import type { OrgMetadata, StyleOptions } from "../types.js"
import { getTemplatesDir } from "../paths.js"
import { resolveSeo, buildJsonLd, escapeJsonForScript, absoluteUrl } from "./seo.js"

export async function applyTemplate(
  html: string,
  metadata: OrgMetadata,
  templatePath?: string,
  templateDir?: string,
  style: StyleOptions = {},
): Promise<string> {
  // Resolve the template + its default stylesheet with PER-FILE fallback: a
  // custom default.html must survive even when styles.css is absent ([D-28]/§3d).
  // An inline templateHtml (from a resolved Style Book) wins over any file.
  const base_ = normaliseAssetBase(style.assetBase)
  const { template, defaultStyles } = style.templateHtml
    ? { template: style.templateHtml, defaultStyles: await getDefaultStyles(base_, style.copiedFonts) }
    : await resolveTemplateAndStyles(templatePath, templateDir, base_, style.copiedFonts)

  // Compose the inline <style> content per the styling knobs. --no-default-styles
  // drops the engine CSS; --css replaces it; --css-append appends after it;
  // --link-styles keeps the default OUT of the inline block and links it instead.
  const injectDefaults = style.injectDefaultStyles !== false && !style.linkDefaultStyles
  const base = injectDefaults ? defaultStyles : ""
  let styles: string
  if (style.customCss) {
    styles = style.styleMode === "append" ? `${base}\n${style.customCss}` : style.customCss
  } else {
    styles = base
  }

  // Override block (:root{}) from --css-var / --font — emitted AFTER {{styles}} so
  // a direct --o2h-* override wins the cascade; --host-* overrides work regardless.
  const themeVars = buildThemeVars(style)

  // Referenced (not inlined) stylesheets — reference-don't-build ([D-28]). When
  // --link-styles is on, the engine's own default sheet leads the list (hosted at
  // /styles.css; build.ts writes the full bundle there).
  const assetBase = base_
  const stylesheetLink = [
    ...(style.linkDefaultStyles
      ? [`<link rel="stylesheet" href="${assetUrl("/styles.css", assetBase)}">`]
      : []),
    ...(style.linkedStylesheets ?? []).map(
      (href) => `<link rel="stylesheet" href="${escapeHtml(String(href))}">`,
    ),
  ].join("\n")

  // Referenced Style-Book scripts — emitted as <script src>, executed by the
  // browser but NEVER by the engine ([D-28]).
  const bookScripts = (style.linkedScripts ?? [])
    .map((src) => `<script src="${escapeHtml(String(src))}" defer></script>`)
    .join("\n")

  // Shared SEO resolution — the static head and the Vue head consume the same
  // fields so the two outputs cannot drift ([D-22]).
  const seo = resolveSeo(metadata, style.bookThemeColor)

  // Arbitrary head injection (#+HTML_HEAD / #+HTML_HEAD_EXTRA). Trusted-author,
  // emitted raw into the {{headExtra}} slot ([D-12]).
  const headExtra = (metadata.htmlHead ?? []).join("\n")

  // The default interactive runtime is referenced (never engine-run, [D-28]) by
  // default so the shipped design system is interactive out of the box; opt out
  // with --no-scripts (linkDefaultScripts:false).
  const defaultScript =
    style.linkDefaultScripts === false
      ? ""
      : `<script src="${assetUrl("/o2h.js", assetBase)}" defer></script>`

  /*
   * THE FONT PRELOAD IS A LIST, NOT TWO LITERALS.
   *
   * templates/default.html used to hardcode two <link rel=preload> for Geomanist and
   * SpaceMono. org2html does NOT redistribute those faces ([#41]) — the licensing is the
   * consuming project's call — so from a real npm install the tarball ships ZERO .woff2 and
   * every page emitted two preload 404s, silently, forever.
   *
   * THE DEFECT WAS NEVER THE ABSENCE, IT WAS THE UNCONDITIONAL PRELOAD. This builds the slot
   * from the faces the build ACTUALLY COPIED, so an install without fonts preloads nothing and
   * an install WITH them (--font-dir, or a vendored templates/fonts/) preloads exactly what is
   * there. A face the book never asked to preload is copied but not preloaded: preloading
   * every weight would fetch the bold before anything needs it.
   */
  const copied = new Set(style.copiedFonts ?? [])
  const fontPreload = (style.preloadFonts ?? [])
    .filter((face) => copied.has(face))
    .map(
      (face) =>
        `<link rel="preload" href="${assetUrl(`/fonts/${face}`, assetBase)}" as="font" type="font/woff2" crossorigin>`,
    )
    .join("\n  ")

  /*
   * article:tag takes ONE tag per meta. The head used to emit a single tag carrying every
   * term comma-joined, which reads to a crawler as one long tag rather than several — the
   * property is explicitly repeatable, and repeating it is how the terms are actually seen.
   * Pre-rendered here because the template engine has no loop; escaped here because it goes
   * through the raw channel.
   */
  const articleTags = (metadata.tags ?? [])
    .map((tag) => `<meta property="article:tag" content="${escapeHtml(String(tag))}">`)
    .join("\n  ")

  /*
   * rel=prev / rel=next. Google no longer uses them for indexing, but they are still a real
   * signal to other crawlers and to browsers (prefetch, reader modes), and they cost one
   * line each. Emitted from the computed relations, so they always agree with the
   * navigation the site renders from the same data.
   */
  const rel = metadata.relations
  /*
   * ABSOLUTISED THE SAME WAY THE CANONICAL IS, and for the same reason. These were emitted
   * site-relative while the canonical beside them was absolute — so a deploy under a path
   * prefix got a correct canonical and a rel=next pointing at the domain ROOT, which is a
   * 404. A navigational link is an identity too: it either resolves without knowing where it
   * was found, or it should stay relative to a site served at its own root.
   *
   * Without --base-url both stay site-relative, exactly as before — the engine does not
   * invent an origin it was not given.
   */
  const relHref = (url: string) => absoluteUrl(metadata.baseUrl, url) || url
  const relLinks = [
    rel?.prev ? `<link rel="prev" href="${escapeHtml(relHref(rel.prev.url))}">` : "",
    rel?.next ? `<link rel="next" href="${escapeHtml(relHref(rel.next.url))}">` : "",
  ]
    .filter(Boolean)
    .join("\n  ")

  const vars: Record<string, string | boolean> = {
    ...seo,
    relLinks,
    coverImage: metadata.coverImage || seo.ogImage || "",
    articleTags,
    headExtra,
    structuredData: escapeJsonForScript(buildJsonLd(metadata, seo)),
    styles,
    themeVars,
    stylesheetLink,
    defaultScript,
    fontPreload,
    bookScripts,
    faviconHref: assetUrl("/favicon.svg", assetBase),
    manifestHref: assetUrl("/manifest.json", assetBase),
    content: html,
  }

  // 1) resolve {{#if}}/{{#unless}} blocks, 2) substitute {{var}} (escaped
  // unless the key is HTML/CSS/JSON), suppressing unknown vars so nothing leaks.
  return substituteVars(processConditionals(template, vars), vars)
}

// Resolve the active template + its companion default stylesheet, each with its
// OWN fallback so a missing styles.css never discards a present default.html.
async function resolveTemplateAndStyles(
  templatePath?: string,
  templateDir?: string,
  assetBase = "",
  copiedFonts?: string[],
): Promise<{ template: string; defaultStyles: string }> {
  if (templatePath) {
    let template: string
    try {
      template = await readFile(templatePath, "utf-8")
    } catch {
      throw new Error(`Template file not found: ${templatePath}`)
    }
    const styles = await readFileOr(
      join(dirname(templatePath), "styles.css"),
      () => getDefaultStyles(assetBase, copiedFonts),
      assetBase,
    )
    return { template, defaultStyles: styles }
  }
  if (templateDir) {
    const template = await readFileOr(join(templateDir, "default.html"), getDefaultTemplate)
    const styles = await readFileOr(join(templateDir, "styles.css"), () => getDefaultStyles(assetBase, copiedFonts), assetBase)
    return { template, defaultStyles: styles }
  }
  return { template: await getDefaultTemplate(), defaultStyles: await getDefaultStyles(assetBase, copiedFonts) }
}

async function readFileOr(
  path: string,
  fallback: () => Promise<string>,
  assetBase = "",
): Promise<string> {
  try {
    /* A custom styles.css is third-party content with the same root-absolute url()
     * problem as the engine's own sheet, so it gets the same prefix. The fallback
     * already composed itself with the base and must not be rewritten twice. */
    return rewriteCssAssetUrls(await readFile(path, "utf-8"), assetBase)
  } catch {
    return await fallback()
  }
}

// Build the {{themeVars}} override block. Values are trusted-author (like
// #+HTML_HEAD) but we still strip angle brackets so a value can't close the
// <style> tag or inject markup.
function buildThemeVars(style: StyleOptions): string {
  const clean = (v: string) => String(v).replace(/[<>]/g, "")
  const decls: string[] = []
  if (style.fontStack) decls.push(`--host-font-editorial: ${clean(style.fontStack)};`)
  for (const [rawKey, rawVal] of Object.entries(style.cssVars ?? {})) {
    const key = clean(rawKey).trim()
    if (!key) continue
    const name = key.startsWith("--") ? key : `--${key}`
    decls.push(`${name}: ${clean(rawVal)};`)
  }
  if (decls.length === 0) return ""
  return `<style>\n:root {\n  ${decls.join("\n  ")}\n}\n</style>`
}

// Keys whose values are HTML / CSS / JSON and must NOT be HTML-escaped.
const RAW_KEYS = new Set(["content", "styles", "structuredData", "headExtra", "themeVars", "stylesheetLink", "defaultScript", "fontPreload", "bookScripts", "articleTags", "relLinks"])

function isTruthy(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  return Boolean(v)
}

// Resolve {{#if key}}…{{/if}} and {{#unless key}}…{{/unless}} against `vars`.
// Handles NESTING: the body pattern refuses to span another block-open, so the
// regex matches innermost blocks first; the fixed-point loop then collapses the
// outer blocks once their bodies are resolved.
const IF_RE = /\{\{#if\s+([\w.]+)\}\}((?:(?!\{\{#(?:if|unless))[\s\S])*?)\{\{\/if\}\}/g
const UNLESS_RE = /\{\{#unless\s+([\w.]+)\}\}((?:(?!\{\{#(?:if|unless))[\s\S])*?)\{\{\/unless\}\}/g

function processConditionals(tpl: string, vars: Record<string, string | boolean>): string {
  let out = tpl
  let prev: string
  do {
    prev = out
    out = out
      .replace(IF_RE, (_m, key, body) => (isTruthy(vars[key]) ? body : ""))
      .replace(UNLESS_RE, (_m, key, body) => (isTruthy(vars[key]) ? "" : body))
  } while (out !== prev)
  return out
}

// Substitute {{var}}. Unknown vars collapse to "" so a stray placeholder never
// leaks; RAW_KEYS pass through unescaped, everything else is HTML-escaped.
function substituteVars(tpl: string, vars: Record<string, string | boolean>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in vars)) return ""
    const v = String(vars[key] ?? "")
    return RAW_KEYS.has(key) ? v : escapeHtml(v)
  })
}


async function getDefaultTemplate(): Promise<string> {
  const templatePath = join(getTemplatesDir(), "default.html")
  try {
    return await readFile(templatePath, "utf-8")
  } catch {
    // Fallback inline template if file not found
    return `<!DOCTYPE html>
<html lang="{{language}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <meta name="description" content="{{description}}">
  <style>{{styles}}</style>
</head>
<body>
  <article>{{content}}</article>
</body>
</html>`
  }
}

/*
 * ASSET BASE — the answer to "org2html output only works at a domain root" ([#45]).
 *
 * Every asset the engine references is ROOT-ABSOLUTE (/styles.css, /o2h.js, /favicon.svg,
 * /manifest.json, and url('/fonts/…') inside the composed stylesheet), so any deploy that is
 * not at a domain root — a GitHub Pages project site, a preview URL, a docs subdirectory —
 * 404s on all of them. `--asset-base /my-project` prefixes them.
 *
 * A <base href> was REJECTED: it also rewrites author-written relative links, and a CSS url()
 * resolves against the STYLESHEET's base, so it would fix the inlined case and break
 * --link-styles. Relative URLs were rejected too: one shared stylesheet serves pages at
 * different depths, so there is no single correct "../".
 *
 * THE DEFAULT IS BYTE-IDENTICAL OUTPUT. An empty base normalises to "" and every join below
 * is then a no-op — which is why the golden snapshot must not move when this lands. If it
 * moves, the normalisation is wrong; do not accept the update.
 */
export function normaliseAssetBase(base: string | undefined | null): string {
  if (!base) return ""
  const trimmed = String(base).trim()
  if (trimmed === "" || trimmed === "/") return ""
  /* An absolute origin (https://cdn.example.com) is as valid a base as a path prefix, and
   * both only ever need their TRAILING slash removed — the leading one is significant. */
  const withoutTrailing = trimmed.replace(/\/+$/, "")
  /* A bare "my-project" is meant as a path prefix; without the leading slash it would resolve
   * relative to whatever directory the page happens to sit in. */
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withoutTrailing) || withoutTrailing.startsWith("/")) {
    return withoutTrailing
  }
  return `/${withoutTrailing}`
}

/** Prefix one root-absolute asset path with the configured base. */
export function assetUrl(path: string, assetBase = ""): string {
  if (!assetBase) return path
  return path.startsWith("/") ? `${assetBase}${path}` : path
}

/*
 * MEMOISED ON (dir, assetBase). getDefaultStyles reads three files and, with a base set, runs
 * a regex over ~200 KB of CSS. It is called once per DOCUMENT, so a 100-page build would
 * otherwise repeat all of that a hundred times for a result that cannot differ.
 */
const stylesCache = new Map<string, Promise<string>>()

export async function getDefaultStyles(
  assetBase = "",
  copiedFonts?: string[],
): Promise<string> {
  const dir = getTemplatesDir()
  const fontKey = copiedFonts ? [...copiedFonts].sort().join(",") : "\u0001unknown"
  const key = `${dir}\u0000${assetBase}\u0000${fontKey}`
  const hit = stylesCache.get(key)
  if (hit) return hit
  const pending = composeDefaultStyles(dir, assetBase, copiedFonts)
  stylesCache.set(key, pending)
  return pending
}

/** Test seam: the cache is keyed on a directory that a fixture can change under us. */
export function clearDefaultStylesCache(): void {
  stylesCache.clear()
}

async function composeDefaultStyles(
  dir: string,
  assetBase: string,
  copiedFonts?: string[],
): Promise<string> {
  try {
    // The default book, composed in cascade order ([D-16] single token authority):
    //   1. kwo-tokens.css  — the --o2h-* VALUE layer (kyo-web-online)
    //   2. styles.css      — the shared per-construct implementation, tokens only
    //   3. kwo.css         — the book's construct delta (webfonts, prose tracking,
    //                        heading rule-line, SpaceMono emphasis, light inverse)
    // Concatenated rather than @import-ed because the result is inlined, where a
    // relative @import URL cannot resolve. Swapping book = swapping 1 and 3.
    const styles = await readFile(join(dir, "styles.css"), "utf-8")
    const layer = async (...parts: string[]) => {
      try {
        return await readFile(join(dir, ...parts), "utf-8")
      } catch {
        return ""
      }
    }
    const tokens = await layer("style-book", "kwo-tokens.css")
    const book = await layer("style-book", "kwo.css")
    let composed = [tokens, styles, book].filter(Boolean).join("\n")
    /* THE OTHER HALF OF THE FONT DEFECT. Dropping the dangling PRELOAD is not enough: the
     * book's @font-face rules still name four faces, and a browser fetches a face the moment
     * a glyph needs it. With no .woff2 emitted that is a 404 per family in use — the same
     * count the preload used to cost, just later and harder to see. A @font-face for a file
     * the build did not copy is pruned so the token layer's system fallback applies cleanly.
     *
     * `undefined` means the CALLER DOES NOT KNOW which fonts exist (a direct library call),
     * and the sheet is then left exactly as authored — guessing there would silently strip a
     * consumer's own working fonts. `[]` is a build stating that none landed. */
    if (copiedFonts) composed = pruneMissingFontFaces(composed, copiedFonts)
    /* Rewritten HERE because this is the single point at which the engine COMPOSES the sheet —
     * build.ts writes this exact string to /styles.css and template.ts inlines it, so one pass
     * covers both. Only ROOT-ABSOLUTE url()s move: a protocol-relative //cdn/... or an already
     * relative ./x stays untouched. */
    return assetBase ? rewriteCssAssetUrls(composed, assetBase) : composed
  } catch {
    // Minimal fallback styles
    return `body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui; line-height: 1.6; }`
  }
}

/**
 * Prefix every root-absolute url() in a stylesheet. `url('/fonts/x.woff2')` becomes
 * `url('/base/fonts/x.woff2')`; `url(//cdn/x)` and `url(data:…)` are left alone.
 */
/**
 * Drop every `@font-face` block whose `/fonts/<file>` was not copied into the output.
 *
 * Only blocks referencing the engine's own /fonts/ directory are considered: a book that
 * points at a CDN or a data: URI is making a claim this function cannot check and must not
 * second-guess.
 */
export function pruneMissingFontFaces(css: string, copiedFonts: string[]): string {
  const have = new Set(copiedFonts)
  return css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    const refs = [...block.matchAll(/url\(\s*['"]?\/fonts\/([^'")]+)['"]?\s*\)/g)].map(
      (m) => m[1],
    )
    if (refs.length === 0) return block
    return refs.every((f) => have.has(f)) ? block : ""
  })
}

export function rewriteCssAssetUrls(css: string, assetBase: string): string {
  if (!assetBase) return css
  return css.replace(
    /url\(\s*(['"]?)(\/(?!\/)[^'")]*)\1\s*\)/g,
    (_m, quote: string, path: string) => `url(${quote}${assetBase}${path}${quote})`,
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
