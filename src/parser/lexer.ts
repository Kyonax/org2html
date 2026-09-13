/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/parser/lexer.ts — Org-mode tokenizer.
 *
 * Line-based scan that emits a Token stream consumed by
 * parser.ts. Token types cover headings, lists, code blocks,
 * generic blocks, tables, drawers, shortcodes, paragraphs,
 * blanks, and raw text.
 */

export type TokenType =
  | 'HEADING'
  | 'LIST_ITEM'
  | 'CODE_BLOCK'
  | 'BLOCK'
  | 'TABLE_ROW'
  | 'DRAWER_START'
  | 'DRAWER_END'
  | 'FIXED_WIDTH'
  | 'FOOTNOTE_DEF'
  | 'PLANNING'
  | 'CLOCK'
  | 'KEYWORD'
  | 'SHORTCODE'
  | 'COMMENT'
  | 'HR'
  | 'PARAGRAPH'
  | 'BLANK'
  | 'TEXT'

export interface Token {
  type: TokenType
  value: string
  line: number
  indent: number
  properties?: Record<string, any>
}

// Consume a block body from startIdx+1 until the line matching endPattern
// (tested against the trimmed line). Returns the raw body and the index of
// the terminator line — or lines.length when the block runs unclosed to EOF,
// so an unterminated block degrades gracefully instead of hanging.
function scanBlockBody(
  lines: string[],
  startIdx: number,
  endPattern: RegExp,
  recoverOnMismatch = false
): { body: string; endLine: number } {
  const body: string[] = []
  let j = startIdx + 1
  // Greater blocks NEST — a #+BEGIN_TABS holds a #+BEGIN_NOTE, a quote holds an example
  // — so the scan tracks how deep it is. Without this, the S1-3 recovery below fires on
  // the INNER block's closer, truncating the parent and orphaning its real #+END_ as a
  // stray paragraph. Depth is only counted for greater blocks: a verbatim block
  // (SRC/EXAMPLE/VERSE/EXPORT) still treats every inner #+BEGIN_/#+END_ as content.
  let depth = 0
  for (; j < lines.length; j++) {
    const trimmed = lines[j].trim()
    const opensInner = recoverOnMismatch && /^#\+BEGIN_\w+/i.test(trimmed)
    const closesAny = recoverOnMismatch && /^#\+END_\w+/i.test(trimmed)

    if (depth === 0 && endPattern.test(trimmed)) break
    // An inner block's closer — including one that happens to spell this block's own
    // name — belongs to the body and just steps the depth back out.
    if (closesAny && depth > 0) {
      depth--
      body.push(lines[j])
      continue
    }
    // For a GREATER block (quote/center/special/dynamic), a DIFFERENT #+END_<name> at
    // OUR level closes it early (mis-terminated source) — stop + drop the orphan closer
    // so it never leaks into the body. Verbatim blocks (SRC/EXAMPLE/VERSE/EXPORT) do
    // NOT recover: a stray #+END_X there is literal content. [Stabilization S1-3]
    if (closesAny) {
      console.error(`org2html: block closed by a mismatched ${trimmed} — recovered`)
      break
    }
    if (opensInner) depth++
    // Org comma-escape: a body line written ,* / ,#+ / ,, un-escapes to * / #+ / ,
    // so code containing #+END / headline-like lines can be documented verbatim.
    body.push(lines[j].replace(/^(\s*),(\*|#\+|,)/, '$1$2'))
  }
  return { body: body.join('\n'), endLine: j }
}

// Visual column of the first non-whitespace char, expanding leading tabs to the
// next multiple of 8 (Org's default tab width). Space-only lines are unchanged.
function leadingWidth(line: string): number {
  let w = 0
  for (const ch of line) {
    if (ch === ' ') w += 1
    else if (ch === '\t') w += 8 - (w % 8)
    else break
  }
  return w
}

export function tokenize(content: string): Token[] {
  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const normalized = withoutBom.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const tokens: Token[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    // Visual indent (tab-stop 8, Org's default) so mixed tab/space nesting is
    // deterministic. Only the leading whitespace is measured — line content
    // (incl. verbatim block bodies) is left byte-for-byte intact. [S2]
    const indent = leadingWidth(line)

    // Blank line
    if (!trimmed) {
      tokens.push({ type: 'BLANK', value: '', line: i, indent })
      continue
    }

    // Heading — only at column 0; an indented "*" is a list bullet, not a headline
    const headingMatch = indent === 0 ? trimmed.match(/^(\*+)\s+(.*)$/) : null
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      tokens.push({
        type: 'HEADING',
        value: text,
        line: i,
        indent,
        properties: { level },
      })
      continue
    }

    // Comment line: "# ..." or a lone "#" (but NOT "#+..." keywords / blocks)
    if (/^#(?:\s|$)/.test(trimmed)) {
      tokens.push({ type: 'COMMENT', value: trimmed, line: i, indent })
      continue
    }

    // Horizontal rule: a line of five or more dashes
    if (/^-{5,}$/.test(trimmed)) {
      tokens.push({ type: 'HR', value: '', line: i, indent })
      continue
    }

    // Table formula line: #+TBLFM: … — a spreadsheet directive with no HTML
    // output; consumed here so it never leaks as a paragraph after a table.
    if (/^#\+TBLFM:/i.test(trimmed)) {
      tokens.push({ type: 'COMMENT', value: trimmed, line: i, indent })
      continue
    }

    // Diary sexp: %%(…) — an agenda-only element with no export output
    // (ox.el drops diary timestamps); consumed so it never leaks as prose.
    if (trimmed.startsWith('%%(')) {
      tokens.push({ type: 'COMMENT', value: trimmed, line: i, indent })
      continue
    }

    // Footnote definition at column 0: [fn:label] definition text, continuing
    // over following lines until a blank line, another definition, or a
    // headline.
    const fnDefMatch = indent === 0 ? trimmed.match(/^\[fn:([^\]]+)\]\s*(.*)$/) : null
    if (fnDefMatch) {
      const parts = [fnDefMatch[2]]
      let j = i + 1
      while (j < lines.length) {
        const t = lines[j].trim()
        if (t === '' || /^\[fn:[^\]]+\]/.test(t) || /^\*+\s/.test(t)) break
        parts.push(lines[j])
        j++
      }
      tokens.push({
        type: 'FOOTNOTE_DEF',
        value: parts.join('\n').trim(),
        line: i,
        indent,
        properties: { label: fnDefMatch[1] },
      })
      i = j - 1
      continue
    }

    // Code block: #+BEGIN_SRC [lang [switches]] … #+END_SRC. Atomic — the
    // body is captured RAW so org-like lines (bullets, stars, pipes) inside
    // code are preserved verbatim instead of being re-tokenized.
    const srcStart = trimmed.match(/^#\+BEGIN_SRC(?:\s+(\S+))?(.*)$/i)
    if (srcStart) {
      const { body, endLine } = scanBlockBody(lines, i, /^#\+END_SRC\b/i)
      tokens.push({
        type: 'CODE_BLOCK',
        value: body,
        line: i,
        indent,
        properties: { language: srcStart[1] || '', switches: (srcStart[2] || '').trim() },
      })
      i = endLine
      continue
    }

    // Dynamic block: #+BEGIN: name params … #+END: (colon, not underscore).
    const dynStartMatch = trimmed.match(/^#\+BEGIN:\s*(.*)$/i)
    if (dynStartMatch) {
      const { body, endLine } = scanBlockBody(lines, i, /^#\+END:\s*$/i, true)
      tokens.push({
        type: 'BLOCK',
        value: body,
        line: i,
        indent,
        properties: { blockType: 'DYNAMIC', args: dynStartMatch[1].trim() },
      })
      i = endLine
      continue
    }

    // Special / greater blocks: #+BEGIN_NAME [args] … #+END_NAME. Atomic; the
    // args (export backend, etc.) ride on the token and the body stays raw.
    const blockStartMatch = trimmed.match(/^#\+BEGIN_(\w+)(.*)$/i)
    if (blockStartMatch) {
      const name = blockStartMatch[1]
      // Verbatim blocks keep any inner #+END_X as literal content; greater blocks
      // (quote/center/special/component) recover from a mismatched closer.
      const verbatim = /^(SRC|EXAMPLE|VERSE|EXPORT)$/i.test(name)
      const { body, endLine } = scanBlockBody(
        lines,
        i,
        new RegExp(`^#\\+END_${name}\\b`, 'i'),
        !verbatim
      )
      tokens.push({
        type: 'BLOCK',
        value: body,
        line: i,
        indent,
        properties: { blockType: name.toUpperCase(), args: blockStartMatch[2].trim() },
      })
      i = endLine
      continue
    }

    // Planning line: SCHEDULED: / DEADLINE: / CLOSED: — attaches to the
    // headline above it (parser); never a standalone paragraph.
    if (/^(?:SCHEDULED|DEADLINE|CLOSED):/.test(trimmed)) {
      tokens.push({ type: 'PLANNING', value: trimmed, line: i, indent })
      continue
    }

    // Clock entry: CLOCK: [start]--[end] => H:MM (or an open clock). Attaches
    // to the headline above (parser); rendered only under #+OPTIONS: c:t and
    // never leaks as a paragraph. Inside a :LOGBOOK: drawer these lines are
    // consumed as drawer content instead.
    if (/^CLOCK:/.test(trimmed)) {
      tokens.push({ type: 'CLOCK', value: trimmed, line: i, indent })
      continue
    }

    // Generic #+KEYWORD: value — an affiliated / config keyword line at body
    // level (the specific #+BEGIN_/#+END_/#+TBLFM forms were handled above).
    // Captured so it never leaks as a paragraph; the parser decides its fate.
    const keywordMatch = trimmed.match(/^#\+(\w+):\s*(.*)$/)
    if (keywordMatch) {
      tokens.push({
        type: 'KEYWORD',
        value: keywordMatch[2],
        line: i,
        indent,
        properties: { key: keywordMatch[1].toUpperCase() },
      })
      continue
    }

    // Drawer end — checked BEFORE the generic drawer-start pattern, since
    // ":END:" also matches /^:(\w+):$/ and would otherwise open a bogus drawer.
    if (trimmed === ':END:') {
      tokens.push({ type: 'DRAWER_END', value: '', line: i, indent })
      continue
    }

    // Drawer start: :NAME:
    if (trimmed.match(/^:(\w+):$/)) {
      tokens.push({
        type: 'DRAWER_START',
        value: trimmed,
        line: i,
        indent,
        properties: { name: trimmed.slice(1, -1) },
      })
      continue
    }

    // Fixed-width area: ": text" (colon + space) or a lone ":" — verbatim
    // content. Checked AFTER drawers so :NAME: lines are not swallowed.
    const fixedWidthMatch = line.match(/^[ \t]*:(?: (.*)|)$/)
    if (fixedWidthMatch) {
      tokens.push({ type: 'FIXED_WIDTH', value: fixedWidthMatch[1] ?? '', line: i, indent })
      continue
    }

    // Table row — Org "| … |" rows plus table.el "+---+" border rows.
    if (trimmed.startsWith('|') || /^\+[-+]+\+$/.test(trimmed)) {
      tokens.push({ type: 'TABLE_ROW', value: trimmed, line: i, indent })
      continue
    }

    // List item
    const listMatch = trimmed.match(/^([-+*]|\d+[.)])\s+(.*)$/)
    if (listMatch) {
      const ordered = /^\d+[.)]/.test(listMatch[1])
      tokens.push({
        type: 'LIST_ITEM',
        value: listMatch[2],
        line: i,
        indent,
        properties: { ordered },
      })
      continue
    }

    // Shortcode — ONLY when the line is nothing but a single shortcode. A line
    // that carries prose around it, or two shortcodes side by side, is TEXT:
    // the inline parser picks the calls out of it, so nothing after the first
    // one is dropped.
    const shortcodeMatch = trimmed.match(/^\{\{<\s*([\w-]+)((?:(?!>\}\}).)*)>\}\}$/)
    if (shortcodeMatch) {
      tokens.push({
        type: 'SHORTCODE',
        value: trimmed,
        line: i,
        indent,
        properties: { component: shortcodeMatch[1] },
      })
      continue
    }

    // Regular text/paragraph
    tokens.push({ type: 'TEXT', value: line, line: i, indent })
  }

  return tokens
}
