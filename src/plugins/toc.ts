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
  if (headings.length === 0) return ''
  
  let html = '<nav class="toc"><h2>Table of Contents</h2><ul>'
  let currentLevel = headings[0].level
  
  for (const heading of headings) {
    if (heading.level > maxDepth) continue
    
    while (heading.level > currentLevel) {
      html += '<ul>'
      currentLevel++
    }
    
    while (heading.level < currentLevel) {
      html += '</ul>'
      currentLevel--
    }
    
    html += `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`
  }
  
  while (currentLevel > headings[0].level) {
    html += '</ul>'
    currentLevel--
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
