/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/math.ts — LaTeX fragments typeset to MathML at BUILD time.
 *
 * WHY MATHML, AND WHY HERE. The engine's contract is that a converted document is
 * self-contained: no runtime library, no webfont, no script the host has to add.
 * Shipping KaTeX or MathJax would break that — the page would need their CSS, their
 * fonts and their scanner just to read a formula. MathML is typeset by the BROWSER,
 * so converting once at build time leaves plain markup behind and the reader needs
 * nothing. It is the same bargain the code highlighter already makes with Shiki:
 * the cost is paid by whoever runs the build, never by whoever reads the page.
 *
 * FALLBACK IS THE RAW FRAGMENT. Anything temml refuses — a macro it does not know,
 * a malformed expression — falls back to the escaped source WITH its delimiters, which
 * is exactly what the engine emitted before this plugin existed. So a document never
 * loses a formula to a rendering error, and a host that prefers to run KaTeX or MathJax
 * itself can still switch this off (`math: false`) and scan for the delimiters.
 */

type TemmlModule = { renderToString: (tex: string, options?: Record<string, unknown>) => string }

let temmlModule: TemmlModule | null | undefined

/**
 * Load temml once, lazily. A missing module is cached as `null` so a build without the
 * dependency degrades to the raw fragment instead of retrying (and re-throwing) per
 * formula in a document that might hold hundreds.
 */
async function loadTemml(): Promise<TemmlModule | null> {
  if (temmlModule !== undefined) return temmlModule
  try {
    const mod = (await import('temml')) as unknown as { default?: TemmlModule } & TemmlModule
    temmlModule = mod.default ?? mod
  } catch {
    temmlModule = null
  }
  return temmlModule
}

/** Strip the delimiters temml must not see: \(…\), \[…\], $…$, $$…$$. */
export function stripMathDelimiters(raw: string): { tex: string; display: boolean } {
  const text = String(raw).trim()
  if (text.startsWith('\\[') && text.endsWith('\\]')) {
    return { tex: text.slice(2, -2).trim(), display: true }
  }
  if (text.startsWith('$$') && text.endsWith('$$')) {
    return { tex: text.slice(2, -2).trim(), display: true }
  }
  if (text.startsWith('\\(') && text.endsWith('\\)')) {
    return { tex: text.slice(2, -2).trim(), display: false }
  }
  if (text.startsWith('$') && text.endsWith('$')) {
    return { tex: text.slice(1, -1).trim(), display: false }
  }
  return { tex: text, display: false }
}

/**
 * Typeset one fragment. Returns the MathML string, or null when it could not be
 * rendered — the caller keeps its own fallback rather than this module inventing one.
 */
export async function renderMathML(raw: string, display: boolean): Promise<string | null> {
  const temml = await loadTemml()
  if (!temml) return null
  const { tex } = stripMathDelimiters(raw)
  if (!tex) return null
  try {
    // `throwOnError` keeps a bad fragment from silently producing a red error node in
    // the middle of a document; the caller falls back to the source instead.
    return temml.renderToString(tex, { displayMode: display, throwOnError: true })
  } catch {
    return null
  }
}

// Local, like every other module in this tree keeps its own.
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The raw fallback: the fragment exactly as the author wrote it, delimiters and all. */
export function rawMathFallback(raw: string, display: boolean): string {
  const cls = display ? 'org-math org-math-display' : 'org-math'
  return `<span class="${cls}" data-math="raw">${escapeHtml(String(raw))}</span>`
}
