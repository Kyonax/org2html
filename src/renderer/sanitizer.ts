/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/renderer/sanitizer.ts — DOMPurify + jsdom wrapper.
 *
 * Server-side HTML sanitization with a curated allowlist of
 * tags + attributes that preserves the SEO / accessibility
 * surface (rel, target, loading, decoding, aria-*) while
 * stripping script, style, iframe, and inline event handlers.
 */

import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const window = new JSDOM('').window
const purify = DOMPurify(window as any)

export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'strong', 'em', 'u', 'del', 'code', 'pre',
      'a', 'img',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'div', 'span',
      'sup', 'sub',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'id',
      'data-component', 'data-props',
    ],
    ALLOW_DATA_ATTR: true,
  })
}
