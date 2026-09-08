/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/code-highlight.ts — Shiki-driven highlighting.
 *
 * Lazily initializes a single Shiki Highlighter (module-level
 * cache). The DEFAULT theme is Shiki's `css-variables` theme:
 * it emits `color: var(--shiki-*)` rather than baked hex, so
 * the O2H stylesheet maps those --shiki-* vars onto the
 * --o2h-syn-* tokens and code follows the active Style Book
 * with zero hardcoded palette ([D-16]/[D-29]). A caller may
 * override via RenderOptions.codeTheme (any bundled Shiki
 * theme, loaded on demand). Unknown languages fall back to an
 * escaped <pre><code> block so the body never breaks.
 */

import { getHighlighter, type Highlighter } from 'shiki'

/**
 * The default code theme. `css-variables` defers every color to a --shiki-*
 * custom property, which templates/styles.css binds to the --o2h-syn-* tokens —
 * so the code block re-themes with the rest of the Style Book (no baked hex).
 */
export const DEFAULT_CODE_THEME = 'css-variables'

let highlighterPromise: Promise<Highlighter> | null = null

/**
 * Languages already reported as having no grammar. A missing grammar is a fact
 * about the BUILD, not about one document, so one line per language is enough
 * however many blocks use it.
 */
const warnedLanguages = new Set<string>()

async function getShiki(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = getHighlighter({
      themes: [DEFAULT_CODE_THEME, 'github-dark', 'github-light'],
      langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'html', 'css', 'json', 'markdown'],
    })
  }
  return highlighterPromise
}

export async function highlightCode(
  code: string,
  language: string,
  theme: string = DEFAULT_CODE_THEME,
): Promise<string> {
  try {
    const highlighter = await getShiki()
    // Honor a caller-requested theme, loading it on demand; an unknown theme
    // name degrades to the default so a bad --code-theme never breaks a build.
    let active = theme || DEFAULT_CODE_THEME
    if (!highlighter.getLoadedThemes().includes(active as never)) {
      try {
        await highlighter.loadTheme(active as never)
      } catch {
        active = DEFAULT_CODE_THEME
      }
    }
    const html = highlighter.codeToHtml(code, { lang: language || 'text', theme: active })
    // Add the stable .org-src hook alongside Shiki's own classes (matrix code
    // row) so the default CSS + a host stylesheet can target the block.
    return html.replace(/^<pre class="/, '<pre class="org-src ')
  } catch {
    // Unknown language (or any Shiki failure) → escaped plain block; the .org-src
    // hook still lets styles.css give it the code surface via .org-root pre.
    //
    // Say which language, and say it once. shiki 0.14 ships 173 grammars and
    // neither emacs-lisp nor org is among them, so an Org converter silently
    // fails to highlight the two languages its own documentation most often
    // contains — which reads exactly like a broken highlighter. The extra class
    // lets a host style or find these blocks; the warning tells the author why
    // there is nothing to style. See docs/shiki-migration.md.
    const lang = language || 'text'
    if (!warnedLanguages.has(lang)) {
      warnedLanguages.add(lang)
      console.error(
        `org2html: no syntax grammar for "${lang}" — the block ships unhighlighted ` +
          `(see docs/shiki-migration.md)`,
      )
    }
    return `<pre class="org-src org-src--plain"><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

/**
 * Header-bar metadata for a source block (MAP-036). Derived once from the block's
 * language + Org switches so the plugin path and the no-highlight fallback emit
 * IDENTICAL chrome (the golden snapshot renders with highlighting off).
 */
export interface SrcMeta {
  /** The block language, e.g. `typescript` — feeds the lang tag + data-lang. */
  language: string
  /** A source filename, taken from a `:tangle <path>` header arg (SB-070). */
  filename?: string
  /** Whether the line-number gutter (SB-072) is shown — the code default. */
  numbered: boolean
  /** A `diff` block (MAP-037 / SB-079): +/- line tints, no number gutter. */
  diff: boolean
}

/**
 * Read the header-bar metadata off a src block's language + Org switch string.
 * The filename comes from the Org `:tangle <path>` header arg (the canonical way
 * a source block names its on-disk target); a `no`/`yes`/`nil`/`t` tangle value
 * names no file. Line numbering is the Style Book default for code — the gutter
 * is core chrome (SB-072), matched by the book's canonical code block — and is
 * suppressed only for diff blocks, which carry their own +/- gutter signs.
 */
export function parseSrcMeta(language: string, switches = ''): SrcMeta {
  const lang = (language || '').trim()
  const diff = lang.toLowerCase() === 'diff'
  let filename: string | undefined
  const tangle = switches.match(/:tangle\s+(\S+)/)
  if (tangle && !/^(no|yes|nil|t)$/i.test(tangle[1])) {
    filename = tangle[1].split('/').pop() || tangle[1]
  }
  return { language: lang, filename, numbered: !diff, diff }
}

// The presentational header bar: three traffic-light squares (SB-069, hidden
// from AT), an optional filename + language tag (SB-070), and a COPY affordance
// (SB-071). The button carries a real accessible name; hosts wire the click at
// hydration ([D-22]) — the code itself lives in the <pre> and stays reachable.
function srcHeader(meta: SrcMeta): string {
  const lights =
    '<span class="org-src-lights" aria-hidden="true">' +
    '<span class="org-src-light"></span>'.repeat(3) +
    '</span>'
  const filename = meta.filename
    ? `<span class="org-src-filename">${escapeHtml(meta.filename)}</span>`
    : ''
  const lang = meta.language ? `<span class="org-src-lang">${escapeHtml(meta.language)}</span>` : ''
  const title = filename || lang ? `<span class="org-src-title">${filename}${lang}</span>` : ''
  const copy =
    '<button class="org-src-copy" type="button" aria-label="Copy code to clipboard">COPY</button>'
  return `<div class="org-src-header">${lights}${title}${copy}</div>`
}

/**
 * Wrap a highlighted (or plain) `<pre class="org-src …">` in the Style Book
 * code chrome (MAP-036): a header bar sibling + the block's modifier classes
 * (`org-src--numbered`, `org-diff`) and `data-lang` / `data-filename` hooks
 * injected onto the <pre>. Shared by the plugin and the fallback renderer so
 * the markup is identical with highlighting on or off.
 */
export function srcChrome(pre: string, meta: SrcMeta): string {
  const withAttrs = pre.replace(
    /^<pre class="([^"]*)"([^>]*)>/,
    (_m, cls: string, rest: string) => {
      const classes = cls.split(/\s+/).filter(Boolean)
      if (meta.numbered) classes.push('org-src--numbered')
      if (meta.diff && !classes.includes('org-diff')) classes.push('org-diff')
      const lang = meta.language ? ` data-lang="${escapeAttr(meta.language)}"` : ''
      const file = meta.filename ? ` data-filename="${escapeAttr(meta.filename)}"` : ''
      return `<pre class="${classes.join(' ')}"${lang}${file}${rest}>`
    },
  )
  return `<div class="org-src-block">${srcHeader(meta)}${withAttrs}</div>`
}

/**
 * Tag each Shiki `<span class="line">` of a diff block with `org-diff-add` /
 * `org-diff-del` / `org-diff-hunk` by zipping it against the raw source line —
 * Shiki emits exactly one `.line` per source line, in order, so the position
 * maps 1:1. Gives the +/- lines their green/red tint + gutter sign (SB-079)
 * without depending on the theme's diff colours.
 */
export function annotateDiffLines(html: string, code: string): string {
  const rawLines = code.split('\n')
  let idx = 0
  return html.replace(/<span class="line">/g, () => {
    const first = (rawLines[idx++] ?? '').charAt(0)
    const mod =
      first === '+' ? ' org-diff-add' :
      first === '-' ? ' org-diff-del' :
      first === '@' ? ' org-diff-hunk' : ''
    return `<span class="line${mod}">`
  })
}
