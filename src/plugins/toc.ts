/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/toc.ts — TOC builder.
 *
 * Walks the heading list collected by html-renderer.ts, opens
 * and closes nested <ul> as the heading level rises and falls,
 * and emits anchor links keyed by the heading id assigned
 * during the body pass. maxDepth defaults to 3.
 */

export function generateToc(
  headings: Array<{ level: number; text: string; id: string }>,
  maxDepth: number = 3
): string {
  const items = headings.filter((h) => h.level <= maxDepth)
  if (items.length === 0) return ''

  const base = items[0].level
  let html = '<nav class="org-toc" aria-label="Table of Contents"><h2 class="org-toc-title">Table of Contents</h2>'
  // A nested list must live INSIDE the parent <li> (WCAG list rule): when the
  // level deepens we open a <ul> without closing the current <li>; when it rises
  // we close the item AND the intervening lists.
  let level = base - 1
  for (const heading of items) {
    if (heading.level > level) {
      while (level < heading.level) {
        html += '<ul>'
        level++
      }
    } else {
      html += '</li>'
      while (level > heading.level) {
        html += '</ul></li>'
        level--
      }
    }
    html += `<li class="org-toc-item"><a class="org-toc-link" href="#${heading.id}">${escapeHtml(heading.text)}</a>`
  }
  html += '</li>'
  while (level > base) {
    html += '</ul></li>'
    level--
  }
  html += '</ul></nav>\n'
  return html
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
