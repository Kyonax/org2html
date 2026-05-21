/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/code-highlight.ts — Shiki-driven highlighting.
 *
 * Lazily initializes a single Shiki Highlighter (module-level
 * cache) loading github-dark + github-light themes and a
 * pragmatic 10-language set. Unknown languages fall back to
 * an escaped <pre><code> block so the body never breaks.
 */

import { getHighlighter, type Highlighter } from 'shiki'

let highlighter: Highlighter | null = null

export async function highlightCode(code: string, language: string): Promise<string> {
  if (!highlighter) {
    highlighter = await getHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'html', 'css', 'json', 'markdown'],
    })
  }
  
  try {
    return highlighter.codeToHtml(code, {
      lang: language || 'text',
      theme: 'github-dark',
    })
  } catch (error) {
    // Fallback if language not supported
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
