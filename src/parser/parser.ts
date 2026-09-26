/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/parser/parser.ts — Token stream → OrgAst.
 *
 * Drives lexer.tokenize, walks the resulting Token[], builds
 * the AST via the ast.ts factories, and derives readingTime /
 * wordCount / excerpt from the plain-text projection of the
 * tree. Excerpt falls back to metadata.description when set.
 */

import type { AstNode, OrgAst, OrgMetadata } from '../types.js'
import { tokenize, type Token } from './lexer.js'
import { createNode, createTextNode, createDocument } from './ast.js'
import { extractMetadata, calculateReadingTime, extractExcerpt } from './metadata.js'
import { slugify } from './slug.js'
import { parseComponentArgs, parseComponentBody } from '../plugins/shortcode.js'

// Module-level parse context — set at the start of every parse() and read by
// parseInlineMarkup (macro expansion) and buildBracketLink (link abbreviations).
// Parsing is synchronous and single-pass, so a per-call reset is safe.
let parseCtx: {
  macros: Record<string, string>
  linkAbbrevs: Record<string, string>
  metadata: OrgMetadata
  /** Headline states from #+TODO / #+SEQ_TODO / #+TYP_TODO (defaults TODO/DONE). */
  todoKeywords: Set<string>
  doneKeywords: Set<string>
  /** Fuzzy-link anchors: <<target>> / <<<radio>>> / #+NAME / headline titles → slug. */
  fuzzyAnchors: Map<string, string>
  /** Coderef labels ((ref:name) inside src blocks) → 1-based line number. */
  coderefs: Map<string, number>
  /** Undefined macro names already reported for this document — warn once each. */
  warnedMacros: Set<string>
  /** The header-only index pass stays silent; the render pass is the one that reports. */
  warnUndefinedMacros: boolean
} = {
  macros: {},
  linkAbbrevs: {},
  metadata: {},
  todoKeywords: new Set(['TODO', 'DONE']),
  doneKeywords: new Set(['DONE']),
  fuzzyAnchors: new Map(),
  coderefs: new Map(),
  warnedMacros: new Set<string>(),
  warnUndefinedMacros: true,
}

// The #+OPTIONS value for one item, or undefined when the document never set
// it. Metadata (including a SETUPFILE's resolved OPTIONS) is parsed before the
// body, so parse-time gates — emphasis, entities, sub/superscripts, preserved
// line breaks — can read their switches here.
function exportOption(key: string): any {
  return (parseCtx.metadata.options as Record<string, any> | undefined)?.[key]
}

/**
 * Header-only metadata: the keyword block with #+MACRO expansion applied and NO
 * body tokenisation.
 *
 * The build indexes a corpus before it renders it, because series, related
 * reading and prev/next are facts about the CORPUS and each page is written as
 * the loop reaches it. That index needs a document's REAL title, since the title
 * is what the route is slugged from — and a #+TITLE built from a macro is not a
 * title until the macro is expanded, which usually means reading its
 * #+SETUPFILE. Reading the raw keyword line instead made the index and the
 * render disagree about where a document lives: no relations sidecar, and
 * neighbours linking to a URL nothing ever wrote.
 *
 * A second full parse per document would answer it too, and cost twice the
 * tokenisation for a handful of keywords. This is the header scan alone.
 */
export function parseHeaderMetadata(content: string): OrgMetadata {
  const lines = content.split('\n')
  const macros: Record<string, string> = {}
  for (const raw of lines) {
    const mm = raw.match(/^\s*#\+MACRO:\s+(\S+)\s+(.*)$/i)
    if (mm) macros[mm[1]] = mm[2]
  }
  const saved = parseCtx
  try {
    parseCtx = {
      ...saved,
      macros,
      metadata: extractMetadata(lines).metadata,
      warnedMacros: new Set<string>(),
      // The render pass reports undefined macros, with the file name attached.
      // Reporting them here too would say everything twice.
      warnUndefinedMacros: false,
    }
    return extractMetadata(expandHeaderMacros(lines)).metadata
  } finally {
    parseCtx = saved
  }
}

export function parse(content: string): OrgAst {
  const lines = content.split('\n')

  // Collect #+MACRO / #+LINK / #+TODO definitions from ANYWHERE in the
  // document — Org allows them below the header. Body-level keyword lines are
  // still consumed as KEYWORD tokens (they never leak); this only harvests
  // their definitions.
  const macros: Record<string, string> = {}
  const linkAbbrevs: Record<string, string> = {}
  const todoDefLines: string[] = []
  for (const raw of lines) {
    const mm = raw.match(/^\s*#\+MACRO:\s+(\S+)\s+(.*)$/i)
    if (mm) {
      macros[mm[1]] = mm[2]
      continue
    }
    const lm = raw.match(/^\s*#\+LINK:\s+(\S+)\s+(.*)$/i)
    if (lm) {
      linkAbbrevs[lm[1]] = lm[2].trim()
      continue
    }
    const td = raw.match(/^\s*#\+(?:SEQ_|TYP_)?TODO:\s+(.+)$/i)
    if (td) todoDefLines.push(td[1])
  }

  // Custom headline states (org-todo-keywords): words before "|" are active,
  // after it done; "(t!)"-style selection/logging shortcuts are stripped; with
  // no bar the LAST keyword is the done state. Defining ANY sequence replaces
  // the built-in TODO/DONE pair, exactly as Emacs does.
  const todoKeywords = new Set<string>()
  const doneKeywords = new Set<string>()
  for (const def of todoDefLines) {
    const words = def.split(/\s+/).filter(Boolean).map((w) => w.replace(/\([^)]*\)$/, ''))
    const bar = words.indexOf('|')
    const active = bar === -1 ? words.slice(0, -1) : words.slice(0, bar)
    const done = bar === -1 ? words.slice(-1) : words.slice(bar + 1)
    for (const w of active) if (w && w !== '|') todoKeywords.add(w)
    for (const w of done) if (w && w !== '|') { todoKeywords.add(w); doneKeywords.add(w) }
  }
  if (todoKeywords.size === 0) {
    todoKeywords.add('TODO').add('DONE')
    doneKeywords.add('DONE')
  }

  // Header values get one expansion pass BEFORE the real metadata read: Org
  // expands {{{macros}}} inside #+TITLE / #+AUTHOR / … and a document whose
  // byline is built from {{{person(…)}}} would otherwise render the braces
  // verbatim. A preliminary metadata read seeds the built-in macros
  // ({{{title}}}, {{{date}}}) with the raw values so they resolve too.
  // Fuzzy-link anchors + coderef line map, harvested up front so
  // buildBracketLink can resolve [[target]] / [[name]] / [[Headline]] /
  // [[(ref)]] wherever they appear. Emacs's fuzzy-link precedence is
  // dedicated target > #+NAME > headline title — composed here by overlay
  // order (later wins).
  const headlineAnchors = new Map<string, string>()
  const nameAnchors = new Map<string, string>()
  const targetAnchors = new Map<string, string>()
  const coderefs = new Map<string, number>()
  {
    let inSrc = false
    let srcLine = 0
    for (const raw of lines) {
      const trimmed = raw.trim()
      if (/^#\+BEGIN_SRC\b/i.test(trimmed)) { inSrc = true; srcLine = 0; continue }
      if (/^#\+END_SRC\b/i.test(trimmed)) { inSrc = false; continue }
      if (inSrc) {
        srcLine++
        const ref = raw.match(/\(ref:([-\w]+)\)[ \t]*$/)
        if (ref && !coderefs.has(ref[1])) coderefs.set(ref[1], srcLine)
        continue
      }
      const nm = trimmed.match(/^#\+NAME:\s+(.+)$/i)
      if (nm) {
        const name = nm[1].trim()
        if (!nameAnchors.has(name.toLowerCase())) nameAnchors.set(name.toLowerCase(), slugify(name))
        continue
      }
      const hm = raw.match(/^\*+\s+(.*)$/)
      if (hm) {
        // Peel tags / state keyword / priority / COMMENT the same way
        // parseHeading does, so the slug matches the rendered heading id.
        let t = hm[1].trim()
        const tagMatch = t.match(/^(.*?)\s+(:(?:[\w@#%]+:)+)\s*$/)
        if (tagMatch) t = tagMatch[1].trim()
        const todoMatch = t.match(/^(\S+)(\s+|$)/)
        if (todoMatch && todoKeywords.has(todoMatch[1])) t = t.slice(todoMatch[0].length).trimStart()
        const prioMatch = t.match(/^\[#([A-Za-z0-9])\]\s*/)
        if (prioMatch) t = t.slice(prioMatch[0].length).trimStart()
        if (t && !headlineAnchors.has(t.toLowerCase())) headlineAnchors.set(t.toLowerCase(), slugify(t))
        continue
      }
      for (const m of raw.matchAll(/<<<?([^<>\n]+?)>>>?/g)) {
        // Target ids live in their own namespace (target-<slug>) so a target
        // named like a headline never produces a duplicate id — and the
        // precedence between them stays real instead of collapsing onto one
        // anchor.
        const name = m[1].trim()
        if (name && !targetAnchors.has(name.toLowerCase())) targetAnchors.set(name.toLowerCase(), 'target-' + slugify(name))
      }
    }
  }
  const fuzzyAnchors = new Map([...headlineAnchors, ...nameAnchors, ...targetAnchors])

  const preliminary = extractMetadata(lines).metadata
  parseCtx = { macros, linkAbbrevs, metadata: preliminary, todoKeywords, doneKeywords, fuzzyAnchors, coderefs, warnedMacros: new Set<string>(), warnUndefinedMacros: true }
  const warnedMacros = parseCtx.warnedMacros
  const headerLines = expandHeaderMacros(lines)

  const { metadata, contentStartLine } = extractMetadata(headerLines)
  parseCtx = { macros, linkAbbrevs, metadata, todoKeywords, doneKeywords, fuzzyAnchors, coderefs, warnedMacros, warnUndefinedMacros: true }

  const contentLines = headerLines.slice(contentStartLine)
  const tokens = tokenize(contentLines.join('\n'))
  
  const children = nestSections(parseTokens(tokens))

  // Calculate reading time and excerpt
  const plainText = extractPlainText(children)
  metadata.readingTime = calculateReadingTime(plainText)
  metadata.wordCount = plainText.split(/\s+/).length

  // THE MAIN IMAGE (see OrgMetadata.mainImage). Per-document and derived only from this
  // document's own tree, so it belongs here in parse and not in the corpus pre-pass.
  const main = findMainImage(children)
  if (main) {
    metadata.mainImage = main.src
    if (main.alt) metadata.mainImageAlt = main.alt
  }
  
  if (!metadata.excerpt && metadata.description) {
    metadata.excerpt = metadata.description
  } else if (!metadata.excerpt) {
    metadata.excerpt = extractExcerpt(plainText)
  }
  
  return createDocument(metadata, children) as OrgAst
}

// `#+ATTR_O2H: :main t` marks the ONE image that stands for the whole document — the
// social card, and the card in an index. Rules, all of them chosen so the answer is
// never ambiguous:
//
//   · THE MARK RIDES THE FIGURE, NOT THE IMAGE. `#+ATTR_O2H` attaches to the block that
//     follows it, and an image on its own line is a PARAGRAPH whose only child is the
//     image (that is how Org expresses a figure, and how renderParagraph finds one). So
//     the search looks inside the marked node for the first image rather than expecting
//     the mark to have landed on the image itself.
//   · FIRST MARK WINS, in document order. A second `:main` is ignored rather than
//     overriding: a document that marks two images has made a mistake, and silently
//     preferring the last one would make the share card depend on scroll position.
//   · A BARE `:main` COUNTS. parseAttrO2h gives a valueless key the empty string, so
//     `:main` and `:main t` mean the same thing; only an explicit negative turns it off.
const AFFIRMATIVE = new Set(['', 't', 'true', 'yes', 'y', '1', 'on'])

function isMainMark(node: AstNode): boolean {
  const attrs = node.properties?.attrO2h as Record<string, string> | undefined
  if (!attrs || !('main' in attrs)) return false
  return AFFIRMATIVE.has(String(attrs.main ?? '').trim().toLowerCase())
}

function firstImageIn(node: AstNode): AstNode | null {
  if (node.type === 'image') return node
  for (const child of (node.children ?? []) as AstNode[]) {
    const found = firstImageIn(child)
    if (found) return found
  }
  return null
}

export function findMainImage(nodes: AstNode[]): { src: string; alt: string } | null {
  for (const node of nodes) {
    if (isMainMark(node)) {
      const image = firstImageIn(node)
      const src = String(image?.properties?.src ?? '').trim()
      if (image && src) {
        // The mark also travels ON the image, so the renderer can put a hook on the very
        // element the head is pointing at — otherwise the connection is only assertable
        // from the sidecars and is invisible in the page it describes.
        image.properties = { ...image.properties, mainImage: true }
        // A caption is a better alt than nothing: the author already wrote a sentence
        // about this picture, and an unlabelled share card is an accessibility gap.
        const caption = node.properties?.caption as AstNode[] | undefined
        const alt =
          String(image.properties?.alt ?? '').trim() ||
          (caption ? extractPlainText(caption).trim() : '')
        return { src, alt }
      }
    }
    const nested = findMainImage((node.children ?? []) as AstNode[])
    if (nested) return nested
  }
  return null
}

function parseTokens(tokens: Token[]): AstNode[] {
  const nodes: AstNode[] = []
  let i = 0
  // A `#+RESULTS:` keyword tags the block that follows it as code-execution
  // output (MAP-038). The flag is consumed on the next iteration so it only ever
  // reaches the immediately-following block; a BLANK/COMMENT separator preserves
  // it, any other content clears it. `#+ATTR_HTML: :class …` works the same way,
  // carrying a class onto the next block (pull-quote / figure variants / decos).
  let pendingResults: boolean = false
  let pendingAttrClass: string | null = null
  let pendingName: string | null = null
  let pendingCaption: AstNode[] | null = null
  let pendingAttrO2h: Record<string, string> | null = null

  while (i < tokens.length) {
    const token = tokens[i]
    const consumeResults: boolean = pendingResults
    const consumeAttrClass: string | null = pendingAttrClass
    const consumeName: string | null = pendingName
    const consumeCaption: AstNode[] | null = pendingCaption
    const consumeAttrO2h: Record<string, string> | null = pendingAttrO2h
    pendingResults = false
    pendingAttrClass = null
    pendingName = null
    pendingCaption = null
    pendingAttrO2h = null
    const lenBefore = nodes.length

    // #+NAME → an anchor id on the next block ([[name]] fuzzy links resolve to
    // it); #+CAPTION → a rendered caption on the next table / figure. Stored
    // as anchorName because `name` already means drawer/special-block/coderef
    // identity on those nodes.
    const applyAffiliated = (node: AstNode) => {
      if (consumeName) node.properties = { ...node.properties, anchorName: consumeName }
      if (consumeCaption) node.properties = { ...node.properties, caption: consumeCaption }
    }

    switch (token.type) {
      case 'HEADING': {
        const node = parseHeading(token)
        // Drop the =*************** END= inlinetask marker; everything else is a
        // real heading or a boxed inlinetask leaf.
        if (!node.properties?.inlinetaskEnd) nodes.push(node)
        i++
        break
      }
      
      case 'CODE_BLOCK': {
        const node = parseCodeBlock(token)
        if (consumeResults) markResults(node)
        applyAffiliated(node)
        nodes.push(node)
        i++
        break
      }

      case 'BLOCK': {
        const node = parseBlock(token)
        if (node) {
          if (consumeResults && node.type === 'example') markResults(node)
          applyAffiliated(node)
          nodes.push(node)
        }
        i++
        break
      }

      case 'TABLE_ROW': {
        const { node, endIndex } = parseTable(tokens, i)
        applyAffiliated(node)
        nodes.push(node)
        i = endIndex + 1
        break
      }
      
      case 'LIST_ITEM': {
        const { node, endIndex } = parseList(tokens, i)
        nodes.push(node)
        i = endIndex + 1
        break
      }
      
      case 'DRAWER_START': {
        const { node, endIndex, props } = parseDrawer(tokens, i)
        if (props) {
          // A :PROPERTIES: drawer attaches to the headline right above it.
          const last = nodes[nodes.length - 1]
          if (last && last.type === 'heading') {
            last.properties = {
              ...last.properties,
              props: { ...(last.properties?.props ?? {}), ...props },
            }
            if (props.CUSTOM_ID) last.properties.customId = props.CUSTOM_ID
          }
        } else if (node) {
          nodes.push(node)
        }
        i = endIndex + 1
        break
      }

      case 'FIXED_WIDTH': {
        const { node, endIndex } = parseFixedWidth(tokens, i)
        if (consumeResults) markResults(node)
        applyAffiliated(node)
        nodes.push(node)
        i = endIndex + 1
        break
      }

      case 'PLANNING': {
        // Attach SCHEDULED/DEADLINE/CLOSED timestamps to the headline above.
        // Kept as an ORDERED list (a line may carry several keywords, e.g.
        // "DEADLINE: <…> SCHEDULED: <…>") so the renderer preserves source
        // order; the repeater/warning cookie stays inside `raw`.
        const last = nodes[nodes.length - 1]
        if (last && last.type === 'heading') {
          const planning = [...(last.properties?.planning ?? [])] as PlanningEntry[]
          const re = /(SCHEDULED|DEADLINE|CLOSED):\s*([<[][^>\]]*[>\]])/g
          let m: RegExpExecArray | null
          while ((m = re.exec(token.value)) !== null) {
            const raw = m[2]
            planning.push({ keyword: m[1], raw, datetime: deriveDatetime(raw.slice(1, -1)) })
          }
          last.properties = { ...last.properties, planning }
        }
        i++
        break
      }

      case 'CLOCK': {
        // Attach a raw CLOCK: line to the headline above. Rendered only under
        // #+OPTIONS: c:t (see renderHeading); off by default so it never leaks.
        const last = nodes[nodes.length - 1]
        if (last && last.type === 'heading') {
          const clock = [...(last.properties?.clock ?? [])] as string[]
          clock.push(token.value)
          last.properties = { ...last.properties, clock }
        }
        i++
        break
      }

      case 'FOOTNOTE_DEF': {
        nodes.push(
          createNode(
            'footnoteDefinition',
            { label: token.properties?.label },
            parseInlineMarkup(token.value)
          )
        )
        i++
        break
      }
      
      case 'SHORTCODE': {
        const shortcode = parseShortcode(token)
        nodes.push(shortcode)
        i++
        break
      }
      
      case 'TEXT': {
        const { node, endIndex } = parseParagraph(tokens, i)
        if (node) {
          applyAffiliated(node)
          nodes.push(node)
        }
        i = endIndex + 1
        break
      }

      // Generic body-level keyword lines (#+NAME:, #+CAPTION:, #+RESULTS:, …) are
      // consumed here so they never leak as paragraphs. Each affiliated keyword
      // rides to the block on the next iteration: RESULTS tags code output
      // (MAP-038), NAME becomes its anchor id, CAPTION its rendered caption.
      case 'KEYWORD':
        // Affiliated keywords STACK. A keyword line is not content, so it must
        // not clear the pendings gathered above it — `#+ATTR_HTML` followed by
        // `#+CAPTION` (or `#+NAME` + `#+CAPTION`, in either order) has to reach
        // the block below with BOTH intact. Carry the snapshot forward first,
        // then let this keyword overwrite only its own slot.
        pendingResults = consumeResults
        pendingAttrClass = consumeAttrClass
        pendingName = consumeName
        pendingCaption = consumeCaption
        pendingAttrO2h = consumeAttrO2h
        if (token.properties?.key === 'RESULTS') pendingResults = true
        else if (token.properties?.key === 'ATTR_HTML') {
          const cls = parseAttrHtmlClass(token.value)
          if (cls) pendingAttrClass = cls
        } else if (token.properties?.key === 'NAME') {
          const name = String(token.value ?? '').trim()
          if (name) pendingName = name
        } else if (token.properties?.key === 'CAPTION') {
          const cap = String(token.value ?? '').trim()
          if (cap) pendingCaption = parseInlineMarkup(cap)
        } else if (token.properties?.key === 'ATTR_O2H') {
          const attrs = parseAttrO2h(token.value)
          if (attrs) pendingAttrO2h = attrs
        }
        i++
        break

      // A blank/comment separator between an affiliated keyword and its block is
      // preserved so the tag still reaches the output block.
      case 'BLANK':
      case 'COMMENT':
        pendingResults = consumeResults
        pendingAttrClass = consumeAttrClass
        pendingName = consumeName
        pendingCaption = consumeCaption
        pendingAttrO2h = consumeAttrO2h
        i++
        break

      case 'HR': {
        nodes.push(createNode('horizontalRule'))
        i++
        break
      }

      default:
        i++
    }

    // Attach a pending `#+ATTR_HTML: :class …` to the single block this
    // iteration produced (quote → pull-quote, figure → bracket/hatch, etc.).
    if (consumeAttrClass && nodes.length > lenBefore) {
      const n = nodes[nodes.length - 1]
      n.properties = { ...n.properties, attrClass: consumeAttrClass }
    }
    if (consumeAttrO2h && nodes.length > lenBefore) {
      const n = nodes[nodes.length - 1]
      n.properties = { ...n.properties, attrO2h: consumeAttrO2h }
    }
  }

  return nodes
}

// `#+ATTR_O2H: :key value :key value` — the engine's OWN presentation channel, kept
// separate from `#+ATTR_HTML` because that keyword belongs to ox-html and an author may
// already be using it for an Emacs export. Values are read as bare words: a key is
// [a-z][a-z0-9-]*, and its value runs to the next ` :key` or end of line. Every value is
// restricted to [\w .,%+-] here, so this channel can never carry markup, a quote, an
// angle bracket or a semicolon into an attribute or a style — it names intent, and the
// RENDERER decides what each key is allowed to mean.
export function parseAttrO2h(value: string): Record<string, string> | null {
  const out: Record<string, string> = {}
  const re = /:([a-z][a-z0-9-]*)(?:\s+([^:]*?))?(?=\s+:[a-z]|\s*$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(String(value ?? '')))) {
    const key = m[1]
    const raw = (m[2] ?? '').trim()
    if (raw && !/^[\w .,%+-]*$/.test(raw)) continue
    out[key] = raw
  }
  return Object.keys(out).length > 0 ? out : null
}

// A comma/space separated list of 1-based indices → a Set. Anything that is not a
// positive integer is dropped rather than coerced, so `:highlight-col two` selects
// nothing instead of column NaN.
export function parseIndexList(value: string | undefined): Set<number> {
  const out = new Set<number>()
  for (const part of String(value ?? '').split(/[,\s]+/)) {
    if (!/^\d+$/.test(part)) continue
    const n = Number(part)
    if (n > 0) out.add(n)
  }
  return out
}

// A list of single-cell coordinates, written `<col>.<row>` — the same order as the two
// keys beside it (`:highlight-col` then `:highlight-row`) and the same 1-based counting:
// the column counts every column including the leading label, the row counts BODY rows
// only. `2.1,3.4` selects two cells. Anything that is not a `digits.digits` pair is
// dropped rather than guessed at.
export function parseCellList(value: string | undefined): Set<string> {
  const out = new Set<string>()
  for (const part of String(value ?? '').split(/[,\s]+/)) {
    const m = part.match(/^(\d+)\.(\d+)$/)
    if (!m) continue
    const col = Number(m[1])
    const row = Number(m[2])
    if (col > 0 && row > 0) out.add(`${col}.${row}`)
  }
  return out
}

// #+BEGIN_TABS … #+TAB: <label> … #+END_TABS — one section showing several
// alternatives in the same space. Each `#+TAB:` opens a panel and everything up to the
// next one is that panel's body, parsed as a FULL body (tables, lists, prose, another
// block) rather than inline markup, so a tab can hold any construct the engine emits.
// Content before the first `#+TAB:` has no panel to belong to and is dropped.
function parseTabs(content: string): AstNode[] {
  const panels: AstNode[] = []
  let label: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (label === null) return
    panels.push(createNode('tabPanel', { label }, nestSections(parseTokens(tokenize(buf.join('\n'))))))
    buf = []
  }
  for (const line of String(content ?? '').split('\n')) {
    const m = line.match(/^\s*#\+TAB:\s*(.*)$/i)
    if (m) {
      flush()
      label = m[1].trim() || `Tab ${panels.length + 1}`
      continue
    }
    if (label !== null) buf.push(line)
  }
  flush()
  return panels
}

// Extract a sanitized class list from a `#+ATTR_HTML: :class …` value. Only the
// `:class` property is honored (classes are inert); other ATTR_HTML props are
// ignored so this never becomes a style/attribute-injection surface. Class names
// are limited to [\w-] and space-separated.
function parseAttrHtmlClass(value: string): string | null {
  const m = String(value ?? '').match(/:class\s+([^:]+)/)
  if (!m) return null
  const cls = m[1]
    .trim()
    .split(/\s+/)
    .filter((c) => /^[\w-]+$/.test(c))
    .join(' ')
  return cls || null
}

// Headline states live on parseCtx: the defaults TODO/DONE, or the document's
// own #+TODO / #+SEQ_TODO / #+TYP_TODO sequences (which REPLACE the defaults,
// as in Emacs). Recognition is membership-gated, so a plain first word (e.g.
// "API Reference") is never mistaken for a state.
// org-inlinetask-min-level (Org default): a headline this deep is an inlinetask.
const INLINETASK_MIN_LEVEL = 15

function parseHeading(token: Token): AstNode {
  const level = token.properties?.level || 1
  // Org headline grammar after the stars: KEYWORD PRIORITY COMMENT TITLE TAGS.
  // Peel them off the outside in, leaving the bare title for inline parsing.
  let text = token.value.trim()

  // Trailing tags :a:b:c: (chars widened to [\w@#%] per Org's tag syntax).
  let tags: string[] = []
  const tagMatch = text.match(/^(.*?)\s+(:(?:[\w@#%]+:)+)\s*$/)
  if (tagMatch) {
    text = tagMatch[1].trim()
    tags = tagMatch[2].split(':').filter(Boolean)
  }

  // TODO keyword — only when the first word is a recognized state.
  let todo: string | undefined
  const todoMatch = text.match(/^(\S+)(\s+|$)/)
  if (todoMatch && parseCtx.todoKeywords.has(todoMatch[1])) {
    todo = todoMatch[1]
    text = text.slice(todoMatch[0].length).trimStart()
  }

  // Priority cookie [#A] (a single letter or digit).
  let priority: string | undefined
  const prioMatch = text.match(/^\[#([A-Za-z0-9])\]\s*/)
  if (prioMatch) {
    priority = prioMatch[1]
    text = text.slice(prioMatch[0].length).trimStart()
  }

  // COMMENT keyword — the headline and everything it owns is excluded from
  // the output (nestSections drops the whole subtree).
  let commented = false
  const commentMatch = text.match(/^COMMENT(\s+|$)/)
  if (commentMatch) {
    commented = true
    text = text.slice(commentMatch[0].length).trimStart()
  }

  // The title is inline markup kept OUT of `children`, because `children`
  // is later populated with the section body (the elements this headline
  // owns) by nestSections. renderHeading reads the title back from here.
  const props: Record<string, any> = {
    level,
    tags,
    title: parseInlineMarkup(text),
  }
  if (todo) {
    props.todo = todo
    props.todoDone = parseCtx.doneKeywords.has(todo)
  }
  if (priority) props.priority = priority
  if (commented) props.commented = true

  // Inlinetask (MAP-051): a headline at or below org-inlinetask-min-level (15
  // stars) is NOT a section headline — it is a self-contained boxed task. The
  // closing =*************** END= marker is flagged so the caller drops it.
  if (level >= INLINETASK_MIN_LEVEL) {
    if (text.trim().toUpperCase() === 'END') props.inlinetaskEnd = true
    return createNode('inlinetask', props)
  }

  return createNode('heading', props)
}

// Fold the flat block stream into a section tree: a headline of level N owns
// every following block up to the next headline of level <= N; deeper
// headlines nest inside it. Content before the first headline stays at the
// root. This ownership model is the enabler for COMMENT-subtree exclusion,
// per-heading property drawers, and planning lines (all attach to the owner).
function nestSections(flat: AstNode[]): AstNode[] {
  const root: AstNode[] = []
  const stack: AstNode[] = []

  const container = (): AstNode[] => {
    const top = stack[stack.length - 1]
    if (!top) return root
    if (!top.children) top.children = []
    return top.children
  }

  for (const node of flat) {
    if (node.type === 'heading') {
      const level = Number(node.properties?.level ?? 1)
      while (
        stack.length > 0 &&
        Number(stack[stack.length - 1].properties?.level ?? 1) >= level
      ) {
        stack.pop()
      }
      node.children = []
      // A COMMENT headline stays OFF the tree, but still goes on the stack so
      // the elements (and deeper headlines) it owns drain into its detached
      // children and are dropped with it — until a headline of level <= its
      // own pops it and re-anchors output to the live container.
      if (!node.properties?.commented) {
        container().push(node)
      }
      stack.push(node)
    } else {
      container().push(node)
    }
  }

  return root
}

// Flag a block as `#+RESULTS:` code-execution output so the renderer gives it
// the green-left-border .org-results treatment (MAP-038 / SB-076).
function markResults(node: AstNode): void {
  node.properties = { ...node.properties, results: true }
}

function parseCodeBlock(token: Token): AstNode {
  const language = token.properties?.language || ''
  // Carry the raw switch/header-arg string so the renderer can derive the
  // header-bar filename (:tangle) + line-number gutter chrome (MAP-036).
  const switches = token.properties?.switches || ''
  // Coderef labels ((ref:name)) are anchors for [[(name)]] links, never code —
  // stripped from the rendered block. The name → line map was harvested in
  // parse() before tokenization.
  let value = String(token.value ?? '')
  if (value.includes('(ref:')) value = value.replace(/[ \t]*\(ref:[-\w]+\)[ \t]*$/gm, '')
  return createNode('codeBlock', { language, switches }, [createTextNode(value)])
}

function parseBlock(token: Token): AstNode | null {
  const blockType = token.properties?.blockType || 'QUOTE'
  const content = String(token.value ?? '')

  // A #+BEGIN_COMMENT block is dropped entirely, not rendered as a quote.
  if (blockType === 'COMMENT') {
    return null
  }

  // A #+BEGIN_JSONLD block is CONFIGURATION, not content: it is captured for the page's
  // structured data and never reaches the body. That separation is the whole point —
  // structured data describes the page to a machine, and a reader should not have to
  // scroll past a wall of JSON to read the article. A document may carry as many blocks
  // as it has things to declare (an Article, a FAQPage, a HowTo, a Product…).
  if (blockType === 'JSONLD') {
    if (parseCtx?.metadata) {
      const blocks = (parseCtx.metadata.jsonldBlocks ??= [])
      blocks.push(content)
    }
    return null
  }

  // Export block: #+BEGIN_EXPORT <backend>. The HTML backend (and a bare
  // #+BEGIN_EXPORT) passes its body through verbatim; any other backend
  // (latex, ascii, …) contributes nothing to HTML output.
  if (blockType === 'EXPORT') {
    const backend = String(token.properties?.args || '')
      .split(/\s+/)[0]
      .toLowerCase()
    if (backend === '' || backend === 'html') {
      return createNode('rawHtml', {}, [createTextNode(content)])
    }
    return null
  }

  // Dynamic block: #+BEGIN: name … #+END:. Its body is regular Org content
  // (a clocktable, a column view, …); re-parse it as blocks so a generated
  // table/list renders correctly instead of leaking as text.
  if (blockType === 'DYNAMIC') {
    // Each level re-tokenises its whole body, so a pathologically nested file
    // recursed until V8 gave up with a bare "Maximum call stack size exceeded" —
    // a stack trace through the tokenizer, naming nothing an author could act on.
    // Cap it and say what happened, the way parseInlineMarkup caps its own depth.
    if (dynamicBlockDepth >= MAX_DYNAMIC_BLOCK_DEPTH) {
      throw new Error(
        `org2html: #+BEGIN: dynamic blocks nested deeper than ${MAX_DYNAMIC_BLOCK_DEPTH}`,
      )
    }
    dynamicBlockDepth++
    let inner: AstNode[]
    try {
      inner = nestSections(parseTokens(tokenize(content)))
    } finally {
      dynamicBlockDepth--
    }
    return createNode('dynamicBlock', { name: String(token.properties?.args || '') }, inner)
  }

  // Verbatim blocks — example / verse content is taken LITERALLY (no inline
  // markup); verse additionally preserves its line breaks at render time.
  if (blockType === 'EXAMPLE') {
    return createNode('example', {}, [createTextNode(content)])
  }
  if (blockType === 'VERSE') {
    return createNode('verse', {}, [createTextNode(content)])
  }

  // Component block: #+BEGIN_COMPONENT Name :key val … with an optional JSON
  // body for structured props ([R-13]/[D-11]). Emits an inert data-component
  // placeholder; the host wires the runtime + look ([D-22]).
  if (blockType === 'COMPONENT') {
    const { name, attrs } = parseComponentArgs(String(token.properties?.args || ''))
    const props = parseComponentBody(content)
    return createNode('component', { name, attrs, props })
  }

  // Tabbed panels: several tables / charts / sections sharing one slot.
  if (blockType === 'TABS') {
    const panels = parseTabs(content)
    return panels.length > 0 ? createNode('tabs', {}, panels) : null
  }

  // Quote / center carry normal inline content.
  if (blockType === 'QUOTE') {
    return createNode('quote', {}, parseInlineMarkup(content))
  }
  if (blockType === 'CENTER') {
    return createNode('center', {}, parseInlineMarkup(content))
  }

  // Any other #+BEGIN_NAME becomes a namespaced special block.
  return createNode('specialBlock', { name: blockType.toLowerCase() }, parseInlineMarkup(content))
}

type ScannedRow = { cells: string[]; isRule: boolean; isCookie: boolean; align: string[] }

// A rule row: an Org "|---+---|" separator OR a table.el "+---+---+" border.
function isRuleRow(rowValue: string): boolean {
  return /^\|[-+:| ]+\|$/.test(rowValue) || /^\+[-+]+\+$/.test(rowValue)
}

// Per-column alignment from an Org rule row's ":" markers (:-- left, -: right,
// :-: center). table.el "+---+" rules carry no alignment.
function ruleAlignments(rowValue: string): string[] {
  if (!rowValue.startsWith('|')) return []
  // Org rule rows delimit columns with "+"; the outer "|" are the borders.
  const inner = rowValue.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('+').map((seg) => {
    const s = seg.trim()
    const left = s.startsWith(':')
    const right = s.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return ''
  })
}

function parseTable(tokens: Token[], startIndex: number): { node: AstNode; endIndex: number } {
  const scanned: ScannedRow[] = []
  let i = startIndex

  while (i < tokens.length && tokens[i].type === 'TABLE_ROW') {
    const rowValue = tokens[i].value
    if (isRuleRow(rowValue)) {
      scanned.push({ cells: [], isRule: true, isCookie: false, align: ruleAlignments(rowValue) })
    } else {
      const cells = rowValue
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
      // A cookie row is table METADATA, never output: an alignment/width row
      // (every cell <l>/<c>/<r> with an optional width, <10>, or empty) or a
      // column-group row (first cell "/", the rest < / > / <> markers).
      const isCookie =
        (cells.length > 0 && cells.every((c) => c === '' || /^<[lcr]?\d*>$/.test(c))) ||
        cells[0] === '/'
      scanned.push({ cells, isRule: false, isCookie, align: [] })
    }
    i++
  }

  // Column alignments: an explicit <l>/<c>/<r> cookie row wins (width digits
  // allowed, <r10>); otherwise the first "|"-rule that carries ":" markers.
  // A column-group ("/") cookie row carries no alignment and never matches.
  let alignments: string[] = []
  const cookie = scanned.find((r) => r.isCookie && r.cells.some((c) => /^<[lcr]/.test(c)))
  if (cookie) {
    alignments = cookie.cells.map((c) =>
      c.startsWith('<l') ? 'left' : c.startsWith('<c') ? 'center' : c.startsWith('<r') ? 'right' : ''
    )
  } else {
    const ruleWithAlign = scanned.find((r) => r.isRule && r.align.some(Boolean))
    if (ruleWithAlign) alignments = ruleWithAlign.align
  }

  const firstRule = scanned.findIndex((r) => r.isRule)
  const rows: AstNode[] = []

  scanned.forEach((row, index) => {
    if (row.isRule || row.isCookie) return
    const isHeader = firstRule > 0 && index < firstRule
    const cellNodes = row.cells.map((cell, col) =>
      createNode('tableCell', { header: isHeader, align: alignments[col] || '' }, parseInlineMarkup(cell))
    )
    rows.push(createNode('tableRow', { header: isHeader }, cellNodes))
  })

  return {
    node: createNode('table', {}, rows),
    endIndex: i - 1,
  }
}

function parseList(tokens: Token[], startIndex: number): { node: AstNode; endIndex: number } {
  // Gather the whole run of list items — including the two things Org allows
  // INSIDE a list and a naive "consecutive LIST_ITEM tokens" scan does not:
  // an item's continuation lines (a wrapped item, or an indented body), and
  // the single blank lines a "loose" list puts between its items. Both used to
  // end the run, which split one list into several and spilled the body text
  // into a sibling paragraph. Then fold the run into a nested tree by indent.
  const items: Token[] = []
  // Token index each gathered item came from, so the run can hand back exactly
  // the tokens the fold below actually consumed.
  const itemTokenIndex: number[] = []
  const baseIndent = tokens[startIndex].indent
  let i = startIndex
  let lastConsumed = startIndex

  while (i < tokens.length) {
    const token = tokens[i]

    if (token.type === 'LIST_ITEM') {
      items.push({ ...token, properties: { ...token.properties } })
      itemTokenIndex.push(i)
      lastConsumed = i
      i++
      continue
    }

    // A line indented past the current item's marker is that item's body, not
    // the end of the list.
    if (
      token.type === 'TEXT' &&
      items.length > 0 &&
      token.indent > items[items.length - 1].indent
    ) {
      const last = items[items.length - 1]
      last.value = `${last.value}\n${token.value.trim()}`
      lastConsumed = i
      i++
      continue
    }

    // ONE blank line does not end a plain list (Org's default); two do. Look
    // past the blank: a deeper body line, or another item of the SAME KIND at
    // this list's indent, means the list continues. A different bullet kind
    // (ordered vs unordered, descriptive vs plain) starts a new list, exactly
    // as Emacs treats it.
    if (token.type === 'BLANK' && items.length > 0) {
      let j = i
      while (j < tokens.length && tokens[j].type === 'BLANK') j++
      const next = tokens[j]
      const continues =
        j - i === 1 &&
        next !== undefined &&
        ((next.type === 'LIST_ITEM' &&
          next.indent >= baseIndent &&
          sameListKind(items[0], next)) ||
          (next.type === 'TEXT' && next.indent > items[items.length - 1].indent))
      if (!continues) break
      i = j
      continue
    }

    break
  }

  const { node, next } = buildListLevel(items, 0, items[0].indent - 1)
  // An item the fold did NOT take (a de-dented item after a deeper start) must
  // go back to the caller as the start of the next list — dropping it here is
  // how `- three` used to vanish from the output entirely.
  const endIndex = next < itemTokenIndex.length ? itemTokenIndex[next] - 1 : lastConsumed
  return { node, endIndex }
}

// Build one list level starting at items[pos]. Items strictly more indented
// than this level nest into the preceding item; items back at (or below) the
// parent's indent (floorExclusive) end this level.
function buildListLevel(
  items: Token[],
  pos: number,
  floorExclusive: number
): { node: AstNode; next: number } {
  const base = items[pos].indent
  const listItems: AstNode[] = []
  let i = pos

  while (i < items.length && items[i].indent > floorExclusive) {
    if (items[i].indent > base) {
      const { node: sub, next } = buildListLevel(items, i, base)
      const parent = listItems[listItems.length - 1]
      if (parent) {
        ;(parent.children ??= []).push(sub)
      } else {
        listItems.push(sub)
      }
      i = next
    } else {
      listItems.push(parseListItem(items[i]))
      i++
    }
  }

  const ordered = Boolean(items[pos].properties?.ordered)
  const description = listItems.some((it) => it.properties?.term)
  return { node: createNode('list', { ordered, description }, listItems), next: i }
}

// Two items belong to the same list only when their bullets agree: ordered vs
// unordered, and descriptive (`term :: definition`) vs plain. Used to decide
// whether a blank-separated item continues the run or opens a new list.
function sameListKind(a: Token, b: Token): boolean {
  const descriptive = (t: Token) => /\s+::\s+/.test(String(t.value ?? ''))
  return (
    Boolean(a.properties?.ordered) === Boolean(b.properties?.ordered) &&
    descriptive(a) === descriptive(b)
  )
}

function parseListItem(token: Token): AstNode {
  let value = token.value
  const props: Record<string, any> = {}

  // Counter set: [@3] forces the item's ordinal.
  const counterMatch = value.match(/^\[@(\d+)\]\s*/)
  if (counterMatch) {
    props.counter = Number(counterMatch[1])
    value = value.slice(counterMatch[0].length)
  }

  // Checkbox: [ ] unchecked, [-] partial, [X] checked.
  const checkboxMatch = value.match(/^\[([ xX-])\]\s+/)
  if (checkboxMatch) {
    const c = checkboxMatch[1].toLowerCase()
    props.checkbox = c === 'x' ? 'checked' : c === '-' ? 'partial' : 'unchecked'
    value = value.slice(checkboxMatch[0].length)
  }

  // Description item: "term :: description" → <dt>/<dd>. The TERM is whatever precedes the
  // separator on the item's first line; the DEFINITION may run on across the continuation
  // lines the list scan folded in, so it is matched with [\s\S] rather than `.`.
  const descMatch = value.match(/^([^\n]+?)\s+::\s+([\s\S]*)$/)
  if (descMatch) {
    props.term = parseInlineMarkup(descMatch[1])
    return createNode('listItem', props, parseInlineMarkup(descMatch[2]))
  }

  return createNode('listItem', props, parseInlineMarkup(value))
}

function parseDrawer(
  tokens: Token[],
  startIndex: number
): { node: AstNode | null; endIndex: number; props?: Record<string, string> } {
  const drawerName = tokens[startIndex].properties?.name || ''
  const contentLines: string[] = []

  // Bounded scan: an UNCLOSED drawer (no :END:) must NOT swallow the rest of the
  // document. A drawer never spans a headline; a PROPERTIES drawer additionally
  // holds no blank lines. Either boundary ends an unterminated drawer so the
  // following content survives. [Stabilization S0-2]
  let i = startIndex + 1
  let closed = false
  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok.type === 'DRAWER_END') {
      closed = true
      break
    }
    if (tok.type === 'HEADING') break
    if (drawerName === 'PROPERTIES' && tok.type === 'BLANK') break
    contentLines.push(tok.value)
    i++
  }
  // endIndex: on a clean close it points AT :END: (the caller skips it with +1);
  // on an unclosed boundary it points one BEFORE the boundary so the caller
  // re-processes that headline/blank line — the following content is never lost.
  const endIndex = closed ? i : i - 1
  if (!closed) {
    console.error(`org2html: unterminated :${drawerName}: drawer (missing :END:) — recovered; following content kept`)
  }

  // A property drawer is parsed into key/value props (with :KEY+: additive
  // append) and handed back to be attached to the owning headline.
  if (drawerName === 'PROPERTIES') {
    const props: Record<string, string> = {}
    for (const line of contentLines) {
      const m = line.match(/^\s*:([\w@#%-]+?)(\+)?:\s*(.*)$/)
      if (!m) continue
      const [, key, additive, val] = m
      if (additive && props[key]) props[key] += ' ' + val
      else props[key] = val
    }
    return { node: null, endIndex, props }
  }

  return {
    node: createNode('drawer', { name: drawerName }, [createTextNode(contentLines.join('\n'))]),
    endIndex,
  }
}

// Consecutive fixed-width lines (": text") collapse into one verbatim block.
// The content is taken literally — no inline markup — like example blocks.
function parseFixedWidth(tokens: Token[], startIndex: number): { node: AstNode; endIndex: number } {
  const lines: string[] = []
  let i = startIndex

  while (i < tokens.length && tokens[i].type === 'FIXED_WIDTH') {
    lines.push(tokens[i].value)
    i++
  }

  return {
    node: createNode('fixedWidth', {}, [createTextNode(lines.join('\n'))]),
    endIndex: i - 1,
  }
}

function parseShortcode(token: Token): AstNode {
  return parseShortcodeCall(token.value) ?? createTextNode(token.value)
}

// Parse one `{{< name key="value" >}}` call into a shortcode node, or null when
// the text is not a well-formed call. Shared by the standalone-line path and the
// inline path so both understand exactly the same syntax.
function parseShortcodeCall(text: string): AstNode | null {
  // Component names may contain hyphens (stat-grid, avatar-group, back-to-top).
  const match = text.match(/\{\{<\s*([\w-]+)((?:(?!>\}\}).)*)>\}\}/)
  if (!match) return null

  const component = match[1]
  const attrsString = match[2].trim()
  const attrs: Record<string, string> = {}

  // Parse attributes
  const attrMatches = attrsString.matchAll(/(\w+)="([^"]*)"/g)
  for (const attrMatch of attrMatches) {
    attrs[attrMatch[1]] = attrMatch[2]
  }

  return createNode('shortcode', { component, attrs })
}

function parseParagraph(tokens: Token[], startIndex: number): { node: AstNode | null; endIndex: number } {
  const lines: string[] = []
  let i = startIndex
  
  while (i < tokens.length && tokens[i].type === 'TEXT') {
    lines.push(tokens[i].value.trim())
    i++
  }
  
  if (lines.length === 0) return { node: null, endIndex: i - 1 }

  // #+OPTIONS \n:t — preserve in-paragraph line breaks: source lines are
  // joined with the explicit \\ break token instead of a space, so
  // parseInlineMarkup emits a lineBreak between them (org-export-preserve-breaks).
  const content = lines.join(exportOption('\\n') === true ? '\\\\' : ' ')
  return {
    node: createNode('paragraph', {}, parseInlineMarkup(content)),
    endIndex: i - 1,
  }
}

const EMPHASIS_TYPES: Record<string, AstNode['type']> = {
  '*': 'bold',
  '/': 'italic',
  '_': 'underline',
  '+': 'strike',
  '~': 'code',
  '=': 'verbatim',
}

// Markers whose contents are taken literally (no nested markup), per Org.
const VERBATIM_MARKERS = new Set(['~', '='])

// Org emphasis boundary model (org-emphasis-regexp-components defaults):
// the char before an opening marker must be start-of-string or one of these,
// and the char after a closing marker must be end-of-string or one of these.
// The first/last char of the body must be non-whitespace ("border").
const PRE_OK = /[\s\-({'"]/
const POST_OK = /[\s\-.,:!?;'")}[]/

/*
 * A memo of forward scans that already failed, for ONE text.
 *
 * parseInlineMarkup meets an opener, scans forward for its closer, fails, and
 * then does the same thing again at the next opener. On a paragraph made of
 * unclosed openers that is quadratic — a measured 40 KB of `*foo *bar …` took
 * 1.3 s and 160 KB took about 21 s, with nothing hanging and nothing warning.
 *
 * Every scanner here runs FORWARD to the end of the text, and whether a position
 * is a valid closer never depends on where the scan began. So a scan that failed
 * from `i` proves there is no closer at or after `i`, and any later scan for the
 * same closer is already answered. Skipping those changes no output: the only
 * scans it removes are the ones that were going to return nothing.
 */
type ScanMemo = Map<string, number>

function scanKnownToFail(memo: ScanMemo | undefined, key: string, from: number): boolean {
  const firstFailure = memo?.get(key)
  return firstFailure !== undefined && from >= firstFailure
}

function noteScanFailed(memo: ScanMemo | undefined, key: string, from: number): void {
  if (!memo) return
  const firstFailure = memo.get(key)
  if (firstFailure === undefined || from < firstFailure) memo.set(key, from)
}

function matchEmphasis(
  text: string,
  start: number,
  marker: string,
  memo?: ScanMemo,
): { body: string; end: number } | null {
  const bodyStart = start + 1
  if (bodyStart >= text.length || /\s/.test(text[bodyStart])) return null

  const memoKey = `em:${marker}`
  if (scanKnownToFail(memo, memoKey, bodyStart + 1)) return null

  for (let j = bodyStart + 1; j < text.length; j++) {
    if (text[j] !== marker) continue
    if (/\s/.test(text[j - 1])) continue
    const after = j + 1 < text.length ? text[j + 1] : ''
    if (after !== '' && !POST_OK.test(after)) continue
    return { body: text.slice(bodyStart, j), end: j + 1 }
  }
  noteScanFailed(memo, memoKey, bodyStart + 1)
  return null
}

// A common subset of Org's entity table (\name → glyph). Unknown names are
// left literal so \LaTeX and the like survive untouched.
const ORG_ENTITIES: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  to: '→', rarr: '→', larr: '←', harr: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
  times: '×', divide: '÷', pm: '±', mp: '∓', deg: '°', infty: '∞', ne: '≠',
  le: '≤', ge: '≥', approx: '≈', equiv: '≡', propto: '∝',
  sum: '∑', prod: '∏', int: '∫', partial: '∂', nabla: '∇', forall: '∀',
  exist: '∃', empty: '∅', in: '∈', notin: '∉', subset: '⊂', supset: '⊃',
  cup: '∪', cap: '∩', sqrt: '√',
  hellip: '…', ldots: '…', mdash: '—', ndash: '–', nbsp: ' ',
  // D-10 — Emacs ships the long-form names beside the short ones, and a document that
  // writes \rightarrow or \dots must not print the backslash word into the prose.
  dots: '\u2026', rightarrow: '\u2192', leftarrow: '\u2190',
  leftrightarrow: '\u2194', uparrow: '\u2191', downarrow: '\u2193',
  mapsto: '\u21A6', longrightarrow: '\u27F6', longleftarrow: '\u27F5',
  Leftrightarrow: '\u21D4', middot: '\u00B7', bull: '\u2022',
  laquo: '\u00AB', raquo: '\u00BB', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201C', rdquo: '\u201D', permil: '\u2030', sect: '\u00A7',
  para: '\u00B6', ddag: '\u2021',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', cent: '¢',
  checkmark: '✓', star: '★', dagger: '†',
  // ASCII structure-char entities → a literal char that never triggers structure
  // (the entity is flushed as a text node). The literal-escape recipe. [S2]
  vert: '|', lbrack: '[', rbrack: ']', lbrace: '{', rbrace: '}', sol: '/',
  under: '_', ast: '*', tilde: '~', equal: '=',
}

// Match an inline fragment bounded by the given open/close delimiters.
function matchDelimited(
  text: string,
  i: number,
  open: string,
  close: string,
  display: boolean,
  memo?: ScanMemo,
): { raw: string; end: number; display: boolean } | null {
  if (!text.startsWith(open, i)) return null
  const from = i + open.length
  const memoKey = `dl:${close}`
  if (scanKnownToFail(memo, memoKey, from)) return null
  const end = text.indexOf(close, from)
  if (end === -1) {
    noteScanFailed(memo, memoKey, from)
    return null
  }
  return { raw: text.slice(i, end + close.length), end: end + close.length, display }
}

// A LaTeX DISPLAY ENVIRONMENT — \begin{equation}…\end{equation} and friends.
//
// Org writes real mathematics this way far more often than it writes $$…$$, and
// without this the whole block fell through to the inline scanner: `\begin{…}`
// survived as literal text, the body was half-converted by the $-rules around
// it, and the reader got `\begin{equation} ∫ … \frac{√{π}}{2} \end{equation}`
// printed as prose. It looked like a rendering bug and was really a parse gap.
//
// THE DELIMITERS ARE KEPT. temml understands the environment itself — it is the
// thing that numbers an `equation` and aligns an `align` — so the fragment is
// handed over whole rather than unwrapped, exactly as `\[…\]` is.
//
// The name is matched against a closed list. An unknown environment is left as
// text on purpose: `\begin{verbatim}` is not mathematics, and guessing would
// hand temml something it would only refuse.
const MATH_ENVIRONMENTS = [
  "equation", "align", "gather", "multline", "flalign", "alignat",
  "eqnarray", "split", "cases", "matrix", "pmatrix", "bmatrix",
  "vmatrix", "Vmatrix", "Bmatrix", "smallmatrix", "array", "aligned", "gathered",
]

function matchMathEnvironment(
  text: string,
  i: number,
  memo?: ScanMemo,
): { raw: string; end: number; display: boolean } | null {
  if (!text.startsWith("\\begin{", i)) return null
  const nameEnd = text.indexOf("}", i + 7)
  if (nameEnd === -1) return null
  // A starred form (equation*) is the same environment without numbering.
  const name = text.slice(i + 7, nameEnd)
  const bare = name.endsWith("*") ? name.slice(0, -1) : name
  if (!MATH_ENVIRONMENTS.includes(bare)) return null
  const close = `\\end{${name}}`
  const memoKey = `env:${name}`
  if (scanKnownToFail(memo, memoKey, nameEnd)) return null
  const end = text.indexOf(close, nameEnd)
  if (end === -1) {
    noteScanFailed(memo, memoKey, nameEnd)
    return null
  }
  return { raw: text.slice(i, end + close.length), end: end + close.length, display: true }
}

// Org's $…$ inline math with its boundary rules — the pre/post guards keep
// currency ("$5 and $10") from being mistaken for a math fragment.
function matchDollarMath(
  text: string,
  i: number,
  memo?: ScanMemo,
): { raw: string; end: number; display: boolean } | null {
  if (text[i] !== '$' || text[i - 1] === '$') return null
  const after = text[i + 1]
  if (after === undefined || /[\s.,;$]/.test(after)) return null
  if (scanKnownToFail(memo, 'dollar', i + 1)) return null
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] !== '$') continue
    const before = text[j - 1]
    const post = text[j + 1] ?? ''
    if (!/[\s.,;$]/.test(before) && (post === '' || /[\s.,;:!?'")}\]]/.test(post))) {
      return { raw: text.slice(i, j + 1), end: j + 1, display: false }
    }
  }
  noteScanFailed(memo, 'dollar', i + 1)
  return null
}

// One SCHEDULED/DEADLINE/CLOSED entry attached to a headline. `raw` keeps the
// full bracketed timestamp (repeater/warning cookie included); `datetime` is
// the ISO projection for the <time> element.
export interface PlanningEntry {
  keyword: string
  raw: string
  datetime: string
}

// Project a timestamp's inner text (repeater/warning cookies and day name and
// all) onto an ISO datetime for a <time datetime> attribute.
function deriveDatetime(inner: string): string {
  const dateMatch = inner.match(/(\d{4}-\d{2}-\d{2})/)
  const timeMatch = inner.match(/(\d{2}:\d{2})/)
  let datetime = dateMatch ? dateMatch[1] : ''
  if (datetime && timeMatch) datetime += 'T' + timeMatch[1]
  return datetime
}

// Build a timestamp node, deriving an ISO datetime for the <time> element.
function buildTimestamp(inner: string, active: boolean): AstNode {
  const raw = active ? `<${inner}>` : `[${inner}]`
  return createNode('timestamp', { active, datetime: deriveDatetime(inner), raw })
}

// Resolve one [[path][desc]] link. Handles image targets (file: strip, a
// ?query before the extension test), internal targets (*Heading / #custom-id
// aligned to the heading slugify), and a description parsed as inline objects.
// Split macro arguments on unescaped commas; "\," is a literal comma.
function splitMacroArgs(s: string): string[] {
  return s.split(/(?<!\\),/).map((a) => a.replace(/\\,/g, ',').trim())
}

// Expand one {{{name(args)}}} body to a string, recursively expanding any
// macros the expansion itself contains (depth-capped so a self-referential
// #+MACRO can't loop). Built-ins read the document metadata; user macros use
// $1..$9 positional substitution ($0 = all args joined).
function expandMacroString(inner: string, depth: number): string {
  if (depth > 16) return ''
  const m = inner.match(/^([A-Za-z0-9_-]+)(?:\(([\s\S]*)\))?$/)
  if (!m) return ''
  const name = m[1]
  const args = m[2] === undefined ? [] : splitMacroArgs(m[2])
  const meta = parseCtx.metadata

  let out: string | undefined
  switch (name) {
    case 'title': out = meta.title ?? ''; break
    case 'author': out = meta.author ?? ''; break
    case 'email': out = meta.email ?? ''; break
    // No strftime engine yet: a format argument is ignored, the raw date wins.
    case 'date':
    case 'time': out = meta.date ?? ''; break
    case 'keyword':
      out = args[0] ? String(meta[args[0].toLowerCase()] ?? meta.properties?.[args[0]] ?? '') : ''
      break
    case 'property':
      out = args[0] ? String(meta.properties?.[args[0]] ?? '') : ''
      break
    default: {
      const template = parseCtx.macros[name]
      if (template === undefined) {
        // Emacs errors on an undefined macro; this converter expands it to
        // nothing so one typo cannot fail a whole document. Expanding to nothing
        // SILENTLY, though, is a byline that just disappears with exit 0 — so
        // say it once per name per document. parse() stays pure: this warns, it
        // never throws and has no strict mode of its own.
        if (parseCtx.warnUndefinedMacros && !parseCtx.warnedMacros.has(name)) {
          parseCtx.warnedMacros.add(name)
          console.error(`org2html: undefined macro "${name}" — expanded to nothing`)
        }
        return ''
      }
      out = template.replace(/\$(\d)/g, (_, d) => {
        const idx = Number(d)
        return idx === 0 ? args.join(',') : (args[idx - 1] ?? '')
      })
    }
  }

  // Recursively expand nested macros in the result.
  return out.replace(/\{\{\{([^}]*)\}\}\}/g, (_, nested) => expandMacroString(nested, depth + 1))
}

// Keywords whose VALUE Org treats as macro-expandable text. Deliberately a
// closed list: #+MACRO definitions must keep their own {{{…}}} literal, and a
// stray brace in some unrelated keyword should never trigger expansion.
const MACRO_EXPANDING_KEYWORDS = new Set([
  'TITLE', 'SUBTITLE', 'AUTHOR', 'EMAIL', 'DATE', 'DESCRIPTION', 'KEYWORDS',
])

/**
 * Expand {{{macros}}} and @@backend:…@@ export snippets inside header keyword
 * values.
 *
 * Export snippets matter as much as the macros: a macro that expands to
 * `@@latex:\person{…}@@` carries nothing for HTML, so the correct rendered
 * author is EMPTY — not the raw LaTeX, and not the unexpanded braces. This
 * mirrors what the inline parser already does for body text.
 *
 * Expansion is line-local and newline-free, so line numbering (and with it
 * contentStartLine) is unchanged.
 */
function expandHeaderMacros(lines: string[]): string[] {
  let changed = false
  const out = lines.map((line) => {
    const m = line.match(/^(\s*#\+([A-Za-z_]+):\s*)(.*)$/)
    if (!m) return line
    if (!MACRO_EXPANDING_KEYWORDS.has(m[2].toUpperCase())) return line
    if (!m[3].includes('{{{') && !m[3].includes('@@')) return line

    changed = true
    const value = m[3]
      .replace(/\{\{\{([^}]*)\}\}\}/g, (_, inner) => expandMacroString(inner, 0))
      .replace(/@@([a-z]+):([\s\S]*?)@@/gi, (_, backend, body) =>
        backend.toLowerCase() === 'html' ? body : '')
      .replace(/\s+/g, ' ')
      .trim()
    return m[1] + value
  })
  return changed ? out : lines
}

function buildBracketLink(rawPath: string, rawDesc: string): AstNode {
  let path = rawPath.replace(/\s+/g, ' ').trim()

  // Link abbreviation: [[abbrev:tag]] using a #+LINK definition. Only expands
  // known abbrevs, so file:/http:/… (never registered) fall through unchanged.
  const abbrev = path.match(/^(\w+):(.*)$/)
  if (abbrev && parseCtx.linkAbbrevs[abbrev[1]] !== undefined) {
    const tmpl = parseCtx.linkAbbrevs[abbrev[1]]
    path = tmpl.includes('%s') ? tmpl.replace(/%s/g, abbrev[2]) : tmpl + abbrev[2]
  }

  const fileless = path.replace(/^file:/i, '')
  const isImage =
    /^data:image\//i.test(fileless) || /\.(png|jpe?g|gif|svg|webp|avif)(\?[^\]]*)?$/i.test(fileless)

  // An image target renders as an <img>. A bare [[img]] is decorative (alt="");
  // a described [[img][text]] carries that text as a meaningful alt (WCAG 1.1.1).
  if (isImage) {
    return createNode('image', { src: fileless, alt: rawDesc.trim() })
  }

  // Coderef link [[(name)]] → the line number the (ref:name) label marks.
  // Rendered as an inline code chip, not an anchor jump — the highlighted
  // block has no per-line ids to target.
  const cr = path.match(/^\((.+)\)$/)
  if (cr) {
    const line = parseCtx.coderefs.get(cr[1].trim())
    const label = rawDesc.trim() || (line !== undefined ? `line ${line}` : cr[1].trim())
    return createNode('coderef', { name: cr[1].trim() }, [createTextNode(label)])
  }

  let href = path
  if (path.startsWith('*')) {
    href = '#' + slugify(path.slice(1)) // *Heading → in-page anchor
  } else if (path.startsWith('#')) {
    href = path // #custom-id stays as-is
  } else if (/^file:/i.test(path)) {
    href = fileless
  } else if (!/^[a-z][\w+.-]*:/i.test(path)) {
    // Fuzzy link: no protocol → try the document's own anchors, Emacs
    // precedence (dedicated target > #+NAME > headline title). Unresolved
    // paths pass through untouched.
    const anchor = parseCtx.fuzzyAnchors.get(path.toLowerCase())
    if (anchor) href = '#' + anchor
  }

  const descNodes = rawDesc ? parseInlineMarkup(rawDesc) : [createTextNode(path)]
  return createNode('link', { href }, descNodes)
}

// Cap inline nesting so pathological input (e.g. thousands of nested emphasis
// markers) degrades to plain text instead of overflowing the call stack. Real
// documents never approach this depth; 64 is generous. [Stabilization S0-1]
const MAX_INLINE_DEPTH = 64

/*
 * A #+BEGIN: dynamic block re-parses its own body, so nesting is real recursion
 * through the tokenizer. Measured: ~4000 levels exhausts the stack. The cap is
 * far above anything an author writes and far below the crash, so a pathological
 * file gets a sentence instead of a stack trace.
 */
const MAX_DYNAMIC_BLOCK_DEPTH = 64
let dynamicBlockDepth = 0

function parseInlineMarkup(text: string, depth = 0): AstNode[] {
  // One memo per text: a closer that is not there is not there for any later
  // opener in the same string. See ScanMemo above.
  const scanMemo: ScanMemo = new Map()
  // Fail-safe: beyond the depth cap, emit the remainder verbatim (escaped at
  // render) rather than recursing further — no crash, no silent loss.
  if (depth >= MAX_INLINE_DEPTH) return text ? [createTextNode(text)] : []

  const nodes: AstNode[] = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) {
      nodes.push(createTextNode(buffer))
      buffer = ''
    }
  }

  while (i < text.length) {
    // Inline component call: {{< name key="value" >}} inside running text (and
    // several of them on one line). Emitted as an INLINE placeholder so it can
    // legally live inside a <p>.
    if (text.startsWith('{{<', i)) {
      const end = scanKnownToFail(scanMemo, '>}}', i + 3)
        ? -1
        : text.indexOf('>}}', i + 3)
      if (end === -1) noteScanFailed(scanMemo, '>}}', i + 3)
      if (end !== -1) {
        const call = text.slice(i, end + 3)
        const shortcode = parseShortcodeCall(call)
        if (shortcode) {
          flush()
          shortcode.properties = { ...shortcode.properties, inline: true }
          nodes.push(shortcode)
          i = end + 3
          continue
        }
      }
    }

    // Line break: \\
    if (text.startsWith('\\\\', i)) {
      flush()
      nodes.push(createNode('lineBreak', {}))
      i += 2
      continue
    }

    // Bracket links: [[path][description]] or [[path]]
    if (text.startsWith('[[', i)) {
      const end = scanKnownToFail(scanMemo, ']]', i + 2)
        ? -1
        : text.indexOf(']]', i + 2)
      if (end === -1) noteScanFailed(scanMemo, ']]', i + 2)
      if (end !== -1) {
        flush()
        const linkContent = text.substring(i + 2, end)
        const sep = linkContent.indexOf('][')
        const rawPath = sep === -1 ? linkContent : linkContent.slice(0, sep)
        const rawDesc = sep === -1 ? '' : linkContent.slice(sep + 2)
        nodes.push(buildBracketLink(rawPath, rawDesc))
        i = end + 2
        continue
      }
    }

    // Citation: [cite:@key] or [cite/style:@k1;@k2].
    if (text.startsWith('[cite', i)) {
      const m = text.slice(i).match(/^\[cite[^:\]]*:([^\]]*)\]/)
      if (m) {
        flush()
        nodes.push(createNode('citation', {}, [createTextNode(m[1].trim())]))
        i += m[0].length
        continue
      }
    }

    // Footnote reference / inline definition:
    //   [fn:label]            → a plain reference
    //   [fn:label:definition] → a labeled inline definition
    //   [fn::definition]      → an anonymous inline definition
    if (text.startsWith('[fn:', i)) {
      const end = scanKnownToFail(scanMemo, ']', i + 4)
        ? -1
        : text.indexOf(']', i + 4)
      if (end === -1) noteScanFailed(scanMemo, ']', i + 4)
      if (end !== -1) {
        flush()
        const inner = text.substring(i + 4, end)
        const colon = inner.indexOf(':')
        if (colon === -1) {
          nodes.push(createNode('footnote', { ref: inner }))
        } else {
          const label = inner.slice(0, colon)
          const def = inner.slice(colon + 1)
          nodes.push(createNode('footnote', { ref: label, inlineDef: parseInlineMarkup(def, depth + 1) }))
        }
        i = end + 1
        continue
      }
    }

    // Statistics cookie: [n/m] or [p%] — a progress indicator.
    if (text[i] === '[') {
      const m = text.slice(i).match(/^\[(\d+\/\d+|\d+%)\]/)
      if (m) {
        flush()
        nodes.push(createNode('statisticsCookie', {}, [createTextNode(m[1])]))
        i += m[0].length
        continue
      }
    }

    // Inactive timestamp: [YYYY-MM-DD …].
    if (text[i] === '[') {
      const m = text.slice(i).match(/^\[(\d{4}-\d{2}-\d{2}[^\]]*)\]/)
      if (m) {
        flush()
        nodes.push(buildTimestamp(m[1], false))
        i += m[0].length
        continue
      }
    }

    // Dedicated target <<name>> / radio target <<<name>>> — an invisible
    // anchor a fuzzy [[name]] link jumps to. Radio auto-linking of plain-text
    // occurrences is NOT implemented; the radio form still anchors + never
    // leaks its angle brackets.
    if (text.startsWith('<<', i)) {
      const m = text.slice(i).match(/^<<<([^<>\n]+?)>>>|^<<([^<>\n]+?)>>/)
      if (m) {
        flush()
        nodes.push(createNode('target', { name: (m[1] ?? m[2]).trim() }))
        i += m[0].length
        continue
      }
    }

    // Angle link: <http://…>, <mailto:…> — an explicit plain link.
    if (text[i] === '<') {
      const end = scanKnownToFail(scanMemo, '>', i + 1)
        ? -1
        : text.indexOf('>', i + 1)
      if (end === -1) noteScanFailed(scanMemo, '>', i + 1)
      if (end !== -1) {
        const inner = text.slice(i + 1, end)
        if (/^[a-z][\w+.-]*:/i.test(inner)) {
          flush()
          nodes.push(createNode('link', { href: inner }, [createTextNode(inner)]))
          i = end + 1
          continue
        }
      }
    }

    // Active timestamp: <YYYY-MM-DD …>.
    if (text[i] === '<') {
      const m = text.slice(i).match(/^<(\d{4}-\d{2}-\d{2}[^>]*)>/)
      if (m) {
        flush()
        nodes.push(buildTimestamp(m[1], true))
        i += m[0].length
        continue
      }
    }

    // Plain / auto link: a bare http(s) URL at a word boundary. Consumed here
    // (before emphasis) so an _ or / inside the URL cannot corrupt it.
    if ((i === 0 || /[\s(]/.test(text[i - 1])) && /^https?:\/\//i.test(text.slice(i))) {
      const m = text.slice(i).match(/^https?:\/\/[^\s<>[\]]+/i)
      if (m) {
        let url = m[0]
        const trail = url.match(/[.,;:!?]+$/)
        if (trail) url = url.slice(0, -trail[0].length)
        flush()
        nodes.push(createNode('link', { href: url }, [createTextNode(url)]))
        i += url.length
        continue
      }
    }

    // LaTeX fragments — delimiters preserved so a host math renderer (KaTeX /
    // MathJax) can process them; escaped + wrapped in .org-math at render time.
    const mathFrag =
      matchMathEnvironment(text, i, scanMemo) ||
      matchDelimited(text, i, '$$', '$$', true, scanMemo) ||
      matchDelimited(text, i, '\\[', '\\]', true, scanMemo) ||
      matchDelimited(text, i, '\\(', '\\)', false, scanMemo) ||
      matchDollarMath(text, i, scanMemo)
    if (mathFrag) {
      flush()
      nodes.push(createNode('math', { display: mathFrag.display }, [createTextNode(mathFrag.raw)]))
      i = mathFrag.end
      continue
    }

    // Macro reference: {{{name(args)}}}. Expanded against #+MACRO definitions
    // and the built-ins (title/author/email/date/keyword/property); the
    // expansion is re-parsed as inline markup so a macro can emit markup. An
    // undefined macro still expands to nothing (consumed, never leaked).
    if (text.startsWith('{{{', i)) {
      const end = scanKnownToFail(scanMemo, '}}}', i + 3)
        ? -1
        : text.indexOf('}}}', i + 3)
      if (end === -1) noteScanFailed(scanMemo, '}}}', i + 3)
      if (end !== -1) {
        flush()
        const expansion = expandMacroString(text.slice(i + 3, end), 0)
        if (expansion) nodes.push(...parseInlineMarkup(expansion, depth + 1))
        i = end + 3
        continue
      }
    }

    // Inline source: src_lang[opts]{code} → an inline code span.
    if (text.startsWith('src_', i)) {
      const m = text.slice(i).match(/^src_(\S+?)(?:\[[^\]]*\])?\{([^}]*)\}/)
      if (m) {
        flush()
        nodes.push(createNode('inlineSrc', { lang: m[1] }, [createTextNode(m[2])]))
        i += m[0].length
        continue
      }
    }

    // Inline call: call_name(args) — produces no output without the named
    // block (a 1C/Babel concern); consumed so it never leaks as text.
    if (text.startsWith('call_', i)) {
      const m = text.slice(i).match(/^call_[^(\s]+\([^)]*\)(?:\[[^\]]*\])?/)
      if (m) {
        flush()
        i += m[0].length
        continue
      }
    }

    // Export snippet: @@backend:content@@ — html passes through, others drop.
    if (text.startsWith('@@', i)) {
      const m = text.slice(i).match(/^@@([a-z]+):([\s\S]*?)@@/i)
      if (m) {
        flush()
        if (m[1].toLowerCase() === 'html') {
          nodes.push(createNode('rawHtml', {}, [createTextNode(m[2])]))
        }
        i += m[0].length
        continue
      }
    }

    // Org entity: \alpha, \to, … (optionally \name{}) → its Unicode glyph.
    // #+OPTIONS e:nil leaves the \name text verbatim (org-export-with-entities).
    if (text[i] === '\\' && exportOption('e') !== false) {
      const m = text.slice(i).match(/^\\([A-Za-z]+)(\{\})?/)
      if (m && ORG_ENTITIES[m[1]] !== undefined) {
        flush()
        buffer += ORG_ENTITIES[m[1]]
        i += m[0].length
        flush()
        continue
      }
    }

    // Subscript / superscript — #+OPTIONS ^: governs BOTH forms as in Emacs
    // (org-export-with-sub-superscripts), with `_:` as a nonstandard per-form
    // override. Three modes: nil = off entirely, {} = braces required, t =
    // braces + bare (a_b — which DOES subscript snake_case, exactly as Emacs
    // does). The engine's DEFAULT is {} — a deliberate web deviation from
    // Emacs's t, so prose full of identifiers survives unmangled.
    if (
      (text[i] === '_' || text[i] === '^') &&
      i > 0 &&
      /[A-Za-z0-9)\]}]/.test(text[i - 1])
    ) {
      const o = (parseCtx.metadata.options ?? {}) as Record<string, any>
      const supMode = o.superscript === undefined ? 'braces' : o.superscript
      const mode = text[i] === '_' ? (o.subscript === undefined ? supMode : o.subscript) : supMode
      const kind = text[i] === '_' ? 'subscript' : 'superscript'
      if (mode !== false && text[i + 1] === '{') {
        const close = scanKnownToFail(scanMemo, '}', i + 2)
          ? -1
          : text.indexOf('}', i + 2)
        if (close === -1) noteScanFailed(scanMemo, '}', i + 2)
        if (close !== -1) {
          const body = text.slice(i + 2, close)
          flush()
          nodes.push(createNode(kind, {}, parseInlineMarkup(body, depth + 1)))
          i = close + 1
          continue
        }
      }
      if (mode === true && text[i + 1] !== '{') {
        const bare = text.slice(i + 1).match(/^[A-Za-z0-9]+/)
        if (bare) {
          flush()
          nodes.push(createNode(kind, {}, [createTextNode(bare[0])]))
          i += 1 + bare[0].length
          continue
        }
      }
    }

    // Emphasis (* / _ + ~ =) with Org PRE/POST/border boundary rules.
    // #+OPTIONS *:nil switches off *bold* /italic/ _underline_ +strike+
    // (org-export-with-emphasize); ~code~ and =verbatim= are verbatim objects,
    // not emphasis, and stay live.
    const marker = text[i]
    if (marker in EMPHASIS_TYPES) {
      const emphasisOff = exportOption('*') === false && !VERBATIM_MARKERS.has(marker)
      const preOk = i === 0 || PRE_OK.test(text[i - 1])
      if (preOk && !emphasisOff) {
        const match = matchEmphasis(text, i, marker, scanMemo)
        if (match) {
          flush()
          const children = VERBATIM_MARKERS.has(marker)
            ? [createTextNode(match.body)]
            : parseInlineMarkup(match.body, depth + 1)
          nodes.push(createNode(EMPHASIS_TYPES[marker], {}, children))
          i = match.end
          continue
        }
      }
    }

    buffer += text[i]
    i++
  }

  flush()
  return nodes
}

function extractPlainText(nodes: AstNode[]): string {
  let text = ''

  for (const node of nodes) {
    if (node.value) {
      text += node.value + ' '
    }
    // Headline titles live in properties.title (not children); count them too.
    const title = node.properties?.title as AstNode[] | undefined
    if (title) {
      text += extractPlainText(title) + ' '
    }
    if (node.children) {
      text += extractPlainText(node.children) + ' '
    }
  }

  return text
}
