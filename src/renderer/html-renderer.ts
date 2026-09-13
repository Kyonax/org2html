/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/renderer/html-renderer.ts — AST → HTML walker.
 *
 * Walks ast.children, dispatches per NodeType, and threads a
 * mutable context (footnotes, heading collector, options) so
 * the TOC and footnote rendering can finalize after the body
 * pass. Code highlighting (Shiki) and sanitization (DOMPurify)
 * are applied when their flags allow.
 */

import type { OrgAst, RenderOptions, RenderResult } from '../types.js'
import { sanitizeHtml } from './sanitizer.js'
import { generateToc } from '../plugins/toc.js'
import { PluginRegistry, codeHighlightPlugin } from '../plugins/plugin-api.js'
import { rawMathFallback, renderMathML } from '../plugins/math.js'
import { parseSrcMeta, srcChrome } from '../plugins/code-highlight.js'
import { renderComponentPlaceholder } from '../plugins/shortcode.js'
import { slugify, suffixIfClobbering } from '../parser/slug.js'
import { parseIndexList, parseCellList } from '../parser/parser.js'
import { parseChartValue, renderBarChart, type ChartDatum } from '../plugins/chart.js'

/**
 * Minimal internal node typing for renderer conveniences.
 * We accept the external AstNode type but coerce accessed fields as needed.
 */
type RNode = {
  type: string
  value?: unknown
  properties?: Record<string, unknown>
  children?: RNode[]
}

export async function renderToHtml(ast: OrgAst, options: RenderOptions = {}): Promise<RenderResult> {
  // Build the plugin registry: user plugins first, then the built-in code
  // highlighter through the SAME surface (unless highlighting is disabled) — R-07.
  const registry = new PluginRegistry(options.plugins ?? [])
  if (options.codeHighlight !== false) {
    registry.register(codeHighlightPlugin(options.codeTheme))
  }

  // Metadata processors run before render so title/options reflect their output.
  const metadata = await registry.runMetadataProcessors(ast.metadata)

  // A document #+TITLE becomes the single <h1>; content headings then shift down
  // one level (org level 1 → <h2>, …) so the page has one h1 and a logical
  // heading hierarchy (WCAG 1.3.1 / 2.4.6). #+OPTIONS title:nil suppresses the
  // whole article header (h1, subtitle, byline) — the <head> <title> is a
  // template concern and keeps the metadata title either way — and the offset
  // returns to 0 so the page still has an h1 (the first org headline).
  const docTitle = metadata.title ? String(metadata.title) : ''
  const showTitle = Boolean(docTitle) && metadata.options?.title !== false
  const headingOffset = showTitle ? 1 : 0
  const usedIds = new Set<string>()
  if (showTitle) usedIds.add('doc-title')

  const context = {
    options,
    registry,
    metaOptions: metadata.options ?? {},
    // Build-time math typesetting; false keeps the raw fragment + delimiters.
    math: options.math,
    footnoteCounter: 1,
    footnoteNums: new Map<string, number>(),
    footnoteRefCounts: new Map<string, number>(),
    footnoteOrder: [] as Array<{ label: string; num: number }>,
    footnoteDefs: new Map<string, string>(),
    anonCounter: 0,
    headings: [] as Array<{ level: number; text: string; id: string }>,
    headingCounters: [] as number[],
    headingOffset,
    usedIds,
  }

  // Export pruning, before the body pass so context.headings never sees a
  // dropped subtree. Two Org conventions resolve here:
  //   :noexport: — the subtree is excluded from every output surface (body,
  //   TOC, anchors), as ox.el does with org-export-exclude-tags.
  //   :toc: — the toc-org convention. A :toc:-tagged headline is a TOC SLOT,
  //   not content: its hand-written link list (maintained for raw-file
  //   readers) is discarded and the ENGINE's generated TOC represents it.
  //   The slot's existence is what turns the TOC on (policy below).
  // Non-mutating: headline nodes are shallow-copied, the caller's AST is
  // shared with the Vue output and must stay intact.
  //
  // Two more ox.el switches resolve in the same walk:
  //   tasks: t (default) / nil (drop every headline carrying a TODO keyword) /
  //   todo (keep only open tasks) / done (keep only closed ones).
  //   arch: archived trees (:ARCHIVE: tag) — headline (default: keep the bare
  //   headline, drop its contents) / nil (drop entirely) / t (export fully).
  const tocSlot = { found: false, noexport: false }
  const tasksOpt = metadata.options?.tasks
  const archOpt = metadata.options?.arch
  const pruneForExport = (nodes: RNode[]): RNode[] => {
    const kept: RNode[] = []
    for (const n of nodes) {
      if (n.type === 'heading') {
        const tags = ((n.properties?.tags ?? []) as string[]).map((t) => String(t).toLowerCase())
        if (tags.includes('toc')) {
          tocSlot.found = true
          if (tags.includes('noexport')) tocSlot.noexport = true
          continue
        }
        if (tags.includes('noexport')) continue
        const todo = n.properties?.todo as string | undefined
        if (todo !== undefined) {
          if (tasksOpt === false) continue
          if (tasksOpt === 'todo' && n.properties?.todoDone) continue
          if (tasksOpt === 'done' && !n.properties?.todoDone) continue
        }
        if (tags.includes('archive')) {
          if (archOpt === false) continue
          if (archOpt !== true) {
            kept.push({ ...n, children: [] })
            continue
          }
        }
        kept.push(
          n.children ? { ...n, children: pruneForExport(n.children as RNode[]) } : n
        )
        continue
      }
      kept.push(n)
    }
    return kept
  }
  const exportChildren = pruneForExport(ast.children as RNode[])

  let bodyHtml = ''

  for (const node of exportChildren) {
    bodyHtml += await renderNode(node, context)
  }

  // TOC policy — the document opts IN, the engine never volunteers one:
  //   #+OPTIONS: toc:t / toc:N   → shown (explicit, wins over a :noexport: slot)
  //   #+OPTIONS: toc:nil         → never shown
  //   a :toc: slot headline      → shown in the slot's stead
  //   a :toc:noexport: headline  → not shown (the author silenced the slot)
  //   none of the above          → no TOC at all
  const tocOpt = metadata.options?.toc
  const tocExplicitOn = tocOpt === true || typeof tocOpt === 'number'
  const tocEnabled = tocOpt === false
    ? false
    : tocExplicitOn || (tocSlot.found && !tocSlot.noexport)
  let tocHtml = ''
  if (tocEnabled && context.headings.length > 0) {
    const tocDepth = typeof tocOpt === 'number' ? tocOpt : 3
    tocHtml = generateToc(context.headings, tocDepth)
  }
  
  // Add footnotes section — one <li> per REFERENCED footnote, in reference
  // order, pulling the real definition content collected during the body pass.
  let footnotesHtml = ''
  if (context.footnoteOrder.length > 0) {
    footnotesHtml = '<section class="org-footnotes"><hr><ol>'
    for (const { label, num } of context.footnoteOrder) {
      const content = context.footnoteDefs.get(label) ?? ''
      footnotesHtml +=
        `<li id="fn-${escapeHtml(label)}" class="org-footnote">` +
        `<a href="#fnref-${escapeHtml(label)}" class="org-footnote-back" role="doc-backlink" aria-label="Back to reference ${num}">↩</a> ` +
        `${content}</li>`
    }
    footnotesHtml += '</ol></section>'
  }
  
  // The document title heads a semantic article header (MAP-002/003 · SB-106):
  // the single <h1> (WCAG 2.4.6) plus an optional subtitle deck and author/date
  // byline. Registration brackets (DEC-003) attach to .org-heading--title in CSS.
  let titleHtml = ''
  if (showTitle) {
    // Byline parts follow the ox.el switches: author:t and date:t are the
    // Emacs defaults, email:nil means the address only appears on request.
    const subtitle = metadata.subtitle ? String(metadata.subtitle) : ''
    const author = metadata.options?.author !== false && metadata.author ? String(metadata.author) : ''
    const email = metadata.options?.email === true && metadata.email ? String(metadata.email) : ''
    const showDate = metadata.options?.date !== false
    const dateIso = showDate && metadata.dateIso ? String(metadata.dateIso) : ''
    const dateRaw = showDate && metadata.date ? String(metadata.date) : ''
    const subtitleHtml = subtitle
      ? `<p class="org-article-subtitle">${escapeHtml(subtitle)}</p>\n`
      : ''
    let bylineHtml = ''
    if (author || email || dateIso || dateRaw) {
      const parts: string[] = []
      if (author) parts.push(`<span class="org-article-author">${escapeHtml(author)}</span>`)
      if (email) parts.push(`<a class="org-article-email" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`)
      if (dateIso || dateRaw) {
        const disp = dateRaw.replace(/^[<[]/, '').replace(/[>\]]$/, '') || dateIso
        parts.push(`<time class="org-article-date" datetime="${escapeHtml(dateIso)}">${escapeHtml(disp)}</time>`)
      }
      bylineHtml = `<p class="org-article-byline">${parts.join(' ')}</p>\n`
    }
    // P-02 — the taxonomy row: what this article is filed under, and what it is about.
    // Both keywords already parsed; the masthead simply never showed them. The terms are
    // emitted as marks, not links — the ROUTE for a category or a tag belongs to the site,
    // so the host wraps them (or the sidecar hands them over ready to link).
    let taxonomyHtml = ''
    const categories = (metadata.categories ?? []) as string[]
    const tagList = (metadata.tags ?? []) as string[]
    if (categories.length > 0 || tagList.length > 0) {
      const parts: string[] = []
      if (categories.length > 0) {
        const chips = categories
          .map((c) => `<span class="org-category" data-term="${escapeHtml(String(c))}">${escapeHtml(String(c))}</span>`)
          .join('')
        parts.push(`<span class="org-taxonomy-group org-taxonomy-group--category">${chips}</span>`)
      }
      if (tagList.length > 0) {
        const chips = tagList
          .map((t) => `<span class="org-tag" data-term="${escapeHtml(String(t))}">${escapeHtml(String(t))}</span>`)
          .join('')
        parts.push(`<span class="org-taxonomy-group org-taxonomy-group--tags">${chips}</span>`)
      }
      taxonomyHtml = `<p class="org-taxonomy">${parts.join('')}</p>\n`
    }

    titleHtml =
      `<header class="org-article-header">\n` +
      `<h1 class="org-heading org-heading--title" id="doc-title">${escapeHtml(docTitle)}</h1>\n` +
      subtitleHtml +
      bylineHtml +
      taxonomyHtml +
      `</header>\n`
  }

  // P-06 — the HERO asset: the article's own opening image or video, between the masthead
  // and the contents. Deliberately NOT #+COVER_IMAGE, which is the social card: a page can
  // want a wide video on the page and a still, cropped frame on the card. A video is a
  // facade like every other video the engine emits — poster and play target, the player
  // only when the reader asks.
  let heroHtml = ''
  if (metadata.heroVideo || metadata.heroImage) {
    const alt = escapeHtml(String(metadata.heroAlt ?? ''))
    const poster = metadata.heroPoster || metadata.heroImage || ''
    const caption = metadata.heroCaption
      ? `<figcaption class="org-figcaption org-hero-caption">${escapeHtml(String(metadata.heroCaption))}</figcaption>`
      : ''
    const stage = metadata.heroVideo
      ? `<div class="org-embed-stage org-hero-stage" data-embed="video" ` +
        `data-embed-src="${escapeHtml(String(metadata.heroVideo))}" ` +
        `data-embed-title="${alt || escapeHtml(docTitle)}">` +
        `<a class="org-embed-facade" href="${escapeHtml(String(metadata.heroVideo))}" ` +
        `aria-label="${alt || escapeHtml(docTitle)}">` +
        (poster
          ? `<img class="org-embed-poster" src="${escapeHtml(safeUrl(String(poster)))}" alt="" ` +
            `loading="eager" decoding="async">`
          : '') +
        `<span class="org-embed-play" aria-hidden="true"></span></a></div>`
      : `<div class="org-embed-stage org-hero-stage">` +
        `<img class="org-image org-hero-image" src="${escapeHtml(safeUrl(String(metadata.heroImage)))}" ` +
        `alt="${alt}" loading="eager" decoding="async" fetchpriority="high"></div>`
    heroHtml = `<figure class="org-hero">${stage}${caption}</figure>\n`
  }

  // Wrap the whole article body in .org-root so the default CSS can scope every
  // rule under it (the class-hook contract, [D-08]). An explicit theme is written
  // as data-theme so the dual-driver dark mode can be forced by the caller. A
  // #+HTML_LAYOUT adds an org-layout--<slug> hook so per-layout CSS can key on it.
  const themeAttr = options.theme ? ` data-theme="${escapeHtml(String(options.theme))}"` : ''
  const layout = metadata.layout ? String(metadata.layout) : ''
  const rootClasses = ['org-root']
  if (layout) rootClasses.push(`org-layout--${escapeHtml(layout)}`)
  if (metadata.titleBleed) rootClasses.push('org-title-bleed')
  // The SIGN-OFF unit closes the document, below the notes — the shell's
  // replacement for a site footer on a page that renders no other chrome.
  const signoffHtml = metadata.signoff
    ? `<p class="org-signoff">${escapeHtml(String(metadata.signoff))}</p>\n`
    : ''
  const rooted = `<div class="${rootClasses.join(' ')}"${themeAttr}>\n${titleHtml}${heroHtml}${tocHtml}${bodyHtml}${footnotesHtml}${signoffHtml}</div>\n`

  // D-09 — media that arrives through an export block gets the same class hook every
  // construct the engine emits already has, so a host can restyle it without fighting an
  // element selector. Runs BEFORE the prefix rewrite so a custom prefix reaches it too.
  const hooked = normalizeMediaHooks(rooted)

  // Re-namespace the class hooks if the caller asked for a non-default prefix.
  const prefixed = applyClassPrefix(hooked, options.classPrefix)

  // Sanitize if enabled
  const sanitized = options.sanitize !== false ? sanitizeHtml(prefixed) : prefixed

  // Post-processors run last, on the final HTML (after sanitize) — R-07.
  const finalHtml = await registry.runPostProcessors(sanitized, metadata)

  return {
    html: finalHtml,
    metadata,
  }
}

// A <video> or <audio> can only reach the output through an author's export block, so the
// renderer never had the chance to give it a class the way it does for every construct it
// emits itself. This tags them on the way out — .org-video / .org-audio — which is what
// makes the class-hook contract ([D-08]) complete: a host restyles media through a class,
// never through an element selector. An element that already carries the hook is left
// alone, and the match is deliberately narrow (the tag's own attribute list, nothing else).
function normalizeMediaHooks(html: string): string {
  return html.replace(/<(video|audio)\b([^>]*)>/gi, (whole, tag: string, attrs: string) => {
    const hook = `org-${tag.toLowerCase()}`
    if (new RegExp(`\\b${hook}\\b`).test(attrs)) return whole
    const withClass = attrs.replace(
      /(\sclass=")([^"]*)(")/i,
      (_m, open: string, value: string, close: string) => `${open}${hook} ${value}${close}`,
    )
    if (withClass !== attrs) return `<${tag}${withClass}>`
    return `<${tag} class="${hook}"${attrs}>`
  })
}

// Re-namespace the emitted .org-* class hooks to a custom prefix, operating
// ONLY inside class="…" attributes so document text is never touched ([D-08]).
function applyClassPrefix(html: string, prefix?: string): string {
  if (!prefix || prefix === 'org-') return html
  return html.replace(/class="([^"]*)"/g, (_m, classes: string) => `class="${classes.replace(/\borg-/g, prefix)}"`)
}

async function renderNode(node: RNode, context: any): Promise<string> {
  const html = await renderNodeInner(node, context)
  // #+NAME anchors: the name's slug becomes the id of whatever element the
  // construct rendered first (plugin-rendered code blocks included), so a
  // fuzzy [[name]] link — resolved to #slug at parse — lands here.
  const anchorName = node.properties?.anchorName
  if (anchorName && html.startsWith('<')) {
    return html.replace(/^<([a-zA-Z][\w-]*)/, `<$1 id="${escapeHtml(slugify(String(anchorName)))}"`)
  }
  return html
}

async function renderNodeInner(node: RNode, context: any): Promise<string> {
  // Plugin override by node type: a block handler wins, then an inline handler;
  // undefined from both falls through to the built-in rendering (R-07). The
  // built-in code-highlight plugin resolves 'codeBlock' here.
  if (context.registry) {
    const block = await context.registry.runBlockHandler(node.type, node, context)
    if (block !== undefined) return block
    const inline = await context.registry.runInlineHandler(node.type, node, context)
    if (inline !== undefined) return inline
  }

  switch (node.type) {
    case 'heading':
      return await renderHeading(node, context)
    case 'inlinetask':
      // #+OPTIONS inline:nil (org-export-with-inlinetasks).
      if (context.metaOptions?.inline === false) return ''
      return await renderInlinetask(node, context)
    case 'paragraph':
      return await renderParagraph(node, context)
    case 'list':
      return await renderList(node, context)
    case 'listItem':
      return await renderListItem(node, context)
    case 'table':
      // #+OPTIONS |:nil (org-export-with-tables).
      if (context.metaOptions?.['|'] === false) return ''
      return await renderTable(node, context)
    case 'tableRow':
      return await renderTableRow(node, context)
    case 'tableCell':
      return await renderTableCell(node, context)
    case 'codeBlock':
      return await renderCodeBlock(node, context)
    case 'quote':
      return await renderQuote(node, context)
    case 'example':
      return await renderExample(node)
    case 'verse':
      return await renderVerse(node)
    case 'center':
      return await renderCenter(node, context)
    case 'shortcode':
      return renderShortcode(node, context)
    case 'tabs':
      return renderTabs(node, context)
    case 'tabPanel':
      // A panel only ever renders through renderTabs, which needs its label and index.
      return renderChildren(node, context)
    case 'component':
      return renderComponent(node, context)
    case 'bold':
      return `<strong>${await renderChildren(node, context)}</strong>`
    case 'italic':
      return `<em>${await renderChildren(node, context)}</em>`
    case 'underline':
      return `<u>${await renderChildren(node, context)}</u>`
    case 'code':
      // Code-family children render behind a literal-text flag so the prose
      // transforms (special strings, smart quotes) never touch a flag or path.
      // The flag is toggled in place — their children are text-only and
      // rendering is sequential, so no other node can observe it mid-flight.
      return `<code class="org-code">${await renderLiteralChildren(node, context)}</code>`
    case 'verbatim':
      return `<code class="org-verbatim">${await renderLiteralChildren(node, context)}</code>`
    case 'strike':
      return `<del>${await renderChildren(node, context)}</del>`
    case 'subscript':
      return `<sub class="org-subscript">${await renderChildren(node, context)}</sub>`
    case 'superscript':
      return `<sup class="org-superscript">${await renderChildren(node, context)}</sup>`
    case 'math':
      // #+OPTIONS tex: t (export) / nil (drop) / verbatim (show the source).
      if (context.metaOptions?.tex === false) return ''
      if (context.metaOptions?.tex === 'verbatim')
        return escapeHtml(String(node.children?.[0]?.value ?? ''))
      return await renderMathNode(node, context)
    case 'statisticsCookie':
      // #+OPTIONS stat:nil (org-export-with-statistics-cookies).
      if (context.metaOptions?.stat === false) return ''
      return `<span class="org-statistics-cookie">${await renderChildren(node, context)}</span>`
    case 'timestamp':
      // #+OPTIONS <:nil (org-export-with-timestamps).
      if (context.metaOptions?.['<'] === false) return ''
      return renderTimestamp(node)
    case 'inlineSrc':
      return `<code class="org-inline-src" data-lang="${escapeHtml(String(node.properties?.lang ?? ''))}">${await renderLiteralChildren(node, context)}</code>`
    case 'citation':
      return `<span class="org-cite">${await renderChildren(node, context)}</span>`
    case 'link':
      return await renderLink(node, context)
    case 'image':
      return renderImage(node, context)
    case 'target':
      // <<target>> / <<<radio>>> — an invisible, targetable anchor. The
      // target- namespace matches the parse-time fuzzy-anchor map and keeps
      // the id distinct from any same-named headline.
      return `<span class="org-target" id="target-${escapeHtml(slugify(String(node.properties?.name ?? '')))}"></span>`
    case 'coderef':
      // [[(name)]] — rendered as an inline code chip naming the line the
      // (ref:name) label marked (no per-line anchor exists to jump to).
      return `<code class="org-coderef">${await renderChildren(node, context)}</code>`
    case 'footnote':
      // #+OPTIONS f:nil (org-export-with-footnotes) — the reference vanishes
      // and, because nothing registers, the footnotes section never renders.
      if (context.metaOptions?.f === false) return ''
      return await renderFootnote(node, context)
    case 'footnoteDefinition':
      if (context.metaOptions?.f === false) return ''
      return await renderFootnoteDefinition(node, context)
    case 'lineBreak':
      return '<br>'
    case 'horizontalRule':
      // MAP-041: the rule carries its own hook so the sheet can style it, plus
      // any `#+ATTR_HTML: :class org-hr--dashed / --tick / --boxed-x` variant.
      return `<hr class="org-hr${extraClass(node)}">`
    case 'specialBlock': {
      // A plugin may claim a special block by its name (#+BEGIN_<name>).
      const name = String(node.properties?.name ?? 'block')
      const byName = context.registry
        ? await context.registry.runBlockHandler(name, node, context)
        : undefined
      if (byName !== undefined) return byName
      // Admonition callouts (MAP-035 · SB-057–060 · D-21): the four intents
      // note/tip/warning/danger, with IMPORTANT→tip, CAUTION→warning,
      // ABSTRACT→note aliases. Emits the spec hook .org-callout--<intent> plus a
      // mono label row; the authored name stays the visible label.
      const calloutIntent: Record<string, string> = {
        note: 'note', tip: 'tip', warning: 'warning', danger: 'danger',
        important: 'tip', caution: 'warning', abstract: 'note',
      }
      const intent = calloutIntent[name.toLowerCase()]
      if (intent) {
        return (
          `<div class="org-callout org-callout--${intent}" role="note">` +
          `<p class="org-callout-label">${escapeHtml(name.toUpperCase())}</p>` +
          `<div class="org-callout-body">${await renderChildren(node, context)}</div>` +
          `</div>\n`
        )
      }
      return `<div class="org-${escapeHtml(name)}">${await renderChildren(node, context)}</div>`
    }
    case 'drawer': {
      // #+OPTIONS d:nil (org-export-with-drawers; per-name lists behave as t).
      if (context.metaOptions?.d === false) return ''
      const drawerName = String(node.properties?.name ?? '')
      const body = escapeHtml(String(node.children?.[0]?.value ?? ''))
      // A :LOGBOOK: drawer collapses into a native <details> accordion
      // (MAP-046 / SB-103 — shares the CMP-022 accordion look).
      if (drawerName.toUpperCase() === 'LOGBOOK') {
        return (
          `<details class="org-drawer org-drawer--logbook" data-drawer="LOGBOOK">` +
          `<summary class="org-drawer-summary">LOGBOOK</summary>` +
          `<div class="org-drawer-body">${body}</div></details>\n`
        )
      }
      return `<div class="org-drawer" data-drawer="${escapeHtml(drawerName)}">${body}</div>\n`
    }
    case 'fixedWidth':
      // #+OPTIONS ::nil (org-export-with-fixed-width).
      if (context.metaOptions?.[':'] === false) return ''
      return `<pre class="org-fixed-width${node.properties?.results ? ' org-results' : ''}${extraClass(node)}">${escapeHtml(String(node.children?.[0]?.value ?? ''))}</pre>\n`
    case 'dynamicBlock':
      return `<div class="org-dynamic-block">\n${await renderChildren(node, context)}</div>\n`
    case 'rawHtml':
      // Trusted author passthrough (#+BEGIN_EXPORT html); the sanitizer still
      // runs downstream unless the caller disabled it.
      return String(node.value ?? node.children?.[0]?.value ?? '')
    case 'text': {
      let out = escapeHtml(String(node.value ?? ''))
      if (!context.literalText) {
        // #+OPTIONS -:t (default, as in Emacs): \- → soft hyphen, --- → em
        // dash, -- → en dash, ... → ellipsis. Code-family spans carry
        // literalText and are never touched.
        if (context.metaOptions?.['-'] !== false) out = applySpecialStrings(out)
        // #+OPTIONS ':t (default nil, as in Emacs): basic English smart quotes.
        if (context.metaOptions?.["'"] === true) out = applySmartQuotes(out)
      }
      return out
    }
    default:
      return ''
  }
}

// Render a node's children with the literal-text flag up, restoring it after.
async function renderLiteralChildren(node: RNode, context: any): Promise<string> {
  const prev = context.literalText
  context.literalText = true
  try {
    return await renderChildren(node, context)
  } finally {
    context.literalText = prev
  }
}

// org-export-with-special-strings, applied to already-escaped prose text. The
// candidate probe keeps the four-replace chain off the hot path — most text
// nodes carry neither a double hyphen, an ellipsis, nor a backslash.
function applySpecialStrings(escaped: string): string {
  if (!escaped.includes('--') && !escaped.includes('...') && !escaped.includes('\\-')) return escaped
  return escaped
    .replace(/\\-/g, '&shy;')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\.\.\./g, '…')
}

// org-export-with-smart-quotes, English rules on escaped text (escapeHtml has
// already turned " into &quot; and ' into &#039;).
function applySmartQuotes(escaped: string): string {
  return escaped
    .replace(/(^|[\s([{–—])&quot;/g, '$1“')
    .replace(/&quot;/g, '”')
    .replace(/(\w)&#039;(?=\w)/g, '$1’')
    .replace(/(^|[\s([{–—])&#039;/g, '$1‘')
    .replace(/&#039;/g, '’')
}

async function renderNodes(nodes: RNode[] | undefined, context: any): Promise<string> {
  if (!nodes) return ''
  let html = ''
  for (const child of nodes) {
    html += await renderNode(child, context)
  }
  return html
}

async function renderChildren(node: RNode, context: any): Promise<string> {
  return renderNodes(node.children, context)
}

// Headline decorations shared by <hN> headings, low-level list headings and
// inlinetasks, each behind its ox.el switch: todo:t and tags:t are Emacs
// defaults; pri is nil by default (Emacs hides priority cookies — pri:t opts
// in). tags:not-in-toc behaves as t: the TOC here never carries tags anyway.
function headlineMeta(node: RNode, context: any): { meta: string; tagsHtml: string } {
  const todo = node.properties?.todo as string | undefined
  const priority = node.properties?.priority as string | undefined
  const tags = (node.properties?.tags ?? []) as string[]

  let meta = ''
  if (todo && context.metaOptions?.todo !== false) {
    const stateClass = node.properties?.todoDone ? 'org-todo org-done' : 'org-todo'
    meta += `<span class="${stateClass}">${escapeHtml(todo)}</span> `
  }
  if (priority && context.metaOptions?.pri === true) {
    // data-priority mirrors the letter onto an attribute so a book can rank the chip
    // (colour + weight + fill step together) without parsing its text.
    meta += `<span class="org-priority" data-priority="${escapeHtml(String(priority))}">[#${escapeHtml(priority)}]</span> `
  }

  let tagsHtml = ''
  if (tags.length > 0 && context.metaOptions?.tags !== false) {
    const chips = tags
      .map((t) => `<span class="org-tag">${escapeHtml(String(t))}</span>`)
      .join('')
    tagsHtml = ` <span class="org-tags">${chips}</span>`
  }
  return { meta, tagsHtml }
}

// #+OPTIONS H:N — a headline BELOW the export depth is "low-level" and renders
// as a list item carrying its body (ox-html's shape), never an <hN>, and never
// joins the TOC. The engine's default is 6, a deliberate web deviation from
// Emacs's 3: HTML has a real h1–h6 ladder, so depth demotion is opt-in.
async function renderLowLevelHeading(node: RNode, context: any): Promise<string> {
  const titleNodes = (node.properties?.title ?? []) as RNode[]
  const customId = node.properties?.customId
  const id = uniqueId(context, customId ? suffixIfClobbering(String(customId)) : slugify(getPlainTextOf(titleNodes)))
  const { meta, tagsHtml } = headlineMeta(node, context)
  const titleHtml = await renderNodes(titleNodes, context)
  const contentHtml = await renderChildren(node, context)
  return (
    `<ul class="org-ul org-low-level"><li id="${escapeHtml(id)}">` +
    `<span class="org-low-level-title">${meta}${titleHtml}${tagsHtml}</span>` +
    `${contentHtml}</li></ul>\n`
  )
}

async function renderHeading(node: RNode, context: any): Promise<string> {
  // Compare the ORG level against the export depth BEFORE clamping to the h1–h6
  // ladder: clamping first made `H:6` (the engine default) unable to demote
  // anything, since no clamped level can exceed 6.
  const orgLevel = Number(node.properties?.level ?? 1)
  const maxLevel = typeof context.metaOptions?.H === 'number' ? context.metaOptions.H : 6
  if (orgLevel > maxLevel) return renderLowLevelHeading(node, context)
  const level = Math.min(orgLevel, 6)
  const titleNodes = (node.properties?.title ?? []) as RNode[]
  const text = getPlainTextOf(titleNodes)
  // A :CUSTOM_ID: property overrides the slugified title as the anchor; either
  // way the id is de-duplicated so anchors stay unique (WCAG 4.1.1).
  const customId = node.properties?.customId
  const id = uniqueId(context, customId ? suffixIfClobbering(String(customId)) : slugify(text))

  // Content headings shift down by the document-title offset so the page keeps a
  // single <h1> (the title) and a logical hierarchy; the outline-N hook stays the
  // ORG level so styling never drifts (WCAG 1.3.1 / 2.4.6).
  const tagLevel = Math.min(level + (context.headingOffset ?? 0), 6)

  // Track for TOC (clean title, org level). Pushing here (parent before its
  // nested children) preserves document order.
  context.headings.push({ level, text, id })

  // Heading numbering when #+OPTIONS num: is enabled (t = all levels, N = down
  // to depth N). Counters advance in document order and deeper levels reset.
  let numberHtml = ''
  const numOpt = context.metaOptions?.num
  if (numOpt === true || (typeof numOpt === 'number' && level <= numOpt)) {
    const counters = context.headingCounters as number[]
    counters[level - 1] = (counters[level - 1] ?? 0) + 1
    counters.length = level
    numberHtml = `<span class="org-heading-number">${counters.join('.')}</span> `
  }

  // Headline meta: TODO/priority open the heading, tags close it (matrix
  // headline-meta row), each behind its #+OPTIONS switch.
  const { meta, tagsHtml } = headlineMeta(node, context)

  const titleHtml = await renderNodes(titleNodes, context)
  // D-31 — a flagged headline is a STACK, not a run-on line. The flags used to sit inline
  // with the title while the tags carried `float: right`, so a title long enough to wrap
  // flowed AROUND the float and the tag chips ended up alone on a second line, right-
  // aligned against nothing. The flags now form ONE chip row ABOVE the headline — state,
  // then rank, then topic, the order a reader asks the questions in — and the title keeps
  // the full measure underneath. An unflagged headline is untouched: no wrapper, no extra
  // class, no layout change for the overwhelmingly common case.
  const flags = `${meta}${tagsHtml}`.trim()
  const flagsRow = flags ? `<span class="org-headline-flags">${flags}</span>` : ''
  const flaggedClass = flagsRow ? ' org-heading--flagged' : ''
  // Only a FLAGGED headline needs the title wrapped: the wrapper exists so the title is
  // ONE flex item beside the chip row. An unflagged headline keeps the exact markup it
  // has always had, so the common case carries no new element and no new behaviour.
  const headingBody = flagsRow
    ? `${flagsRow}<span class="org-heading-text">${numberHtml}${titleHtml}</span>`
    : `${numberHtml}${titleHtml}`
  // Planning + clock sit directly under the headline (before the body), each
  // gated by an #+OPTIONS toggle so they never leak by default.
  const planningHtml = renderPlanning(node, context)
  const clockHtml = renderClock(node, context)
  // children now holds the section body this headline owns (nestSections).
  const contentHtml = await renderChildren(node, context)
  return (
    `<section class="org-section">\n` +
    `<h${tagLevel} class="org-heading outline-${level}${flaggedClass}" id="${escapeHtml(id)}">` +
    `${headingBody}</h${tagLevel}>\n` +
    `${planningHtml}${clockHtml}${contentHtml}</section>\n`
  )
}

// A leading space + the sanitized `#+ATTR_HTML: :class …` classes (or '') for
// appending to a block's class list — pull-quote / figure variants / decorations.
function extraClass(node: RNode): string {
  const cls = node.properties?.attrClass
  return cls ? ` ${String(cls)}` : ''
}

/*
 * A BREAKOUT IS A PROPERTY OF THE BOX, NOT OF WHAT IS INSIDE IT. When a construct gets
 * wrapped — a table in its scroll frame — the wrapper becomes the box the reading column
 * measures, so `org-wide` / `org-full-bleed` have to travel with it. Left on the inner
 * element they would size a child against the viewport inside a parent that is still the
 * width of the prose, which is how a breakout turns into a page-wide horizontal scroll.
 * Every other authored class stays where the author put it.
 */
const BREAKOUT_CLASSES = new Set(['org-wide', 'org-full-bleed'])

function splitBreakout(node: RNode): { outer: string; inner: string } {
  const all = String(node.properties?.attrClass ?? '').split(/\s+/).filter(Boolean)
  const outer = all.filter((c) => BREAKOUT_CLASSES.has(c))
  const inner = all.filter((c) => !BREAKOUT_CLASSES.has(c))
  return {
    outer: outer.length ? ` ${outer.join(' ')}` : '',
    inner: inner.length ? ` ${inner.join(' ')}` : '',
  }
}

// Inlinetask (MAP-051): a >=15-star headline renders as a self-contained boxed
// task (never an <hN> section) carrying its TODO / priority / title / tags.
async function renderInlinetask(node: RNode, context: any): Promise<string> {
  const titleNodes = (node.properties?.title ?? []) as RNode[]
  const { meta, tagsHtml } = headlineMeta(node, context)

  const titleHtml = await renderNodes(titleNodes, context)
  return (
    `<div class="org-inlinetask${extraClass(node)}">` +
    `<p class="org-inlinetask-heading">${meta}${titleHtml}${tagsHtml}</p></div>\n`
  )
}

// De-duplicate an anchor id within one document: the first occurrence keeps the
// base slug (so [[*Heading]] resolves to it); later collisions get -2, -3, …
function uniqueId(context: any, base: string): string {
  // The counter is carried PER BASE. Restarting the probe at 2 for every
  // collision made a document of n identically-titled headings cost n^2 lookups
  // — measured at 2.1 s for 8000 of them. Resuming where the last one stopped
  // makes it linear, and the `while` still guards the case where a later id was
  // taken by an explicit :CUSTOM_ID: rather than by this counter.
  context.idCounters ??= new Map<string, number>()
  let n: number = context.idCounters.get(base) ?? 2
  let id = base
  while (context.usedIds.has(id)) id = `${base}-${n++}`
  context.idCounters.set(base, n)
  context.usedIds.add(id)
  return id
}

// Planning line (SCHEDULED/DEADLINE/CLOSED) below a headline. Rendered only
// under #+OPTIONS: p:t — Org's org-export-with-planning defaults to nil, so
// planning is suppressed unless the author opts in. Each timestamp carries the
// DEC-013 coordinate-tag treatment via .org-timestamp; the repeater/warning
// cookie is preserved inside the raw text.
function renderPlanning(node: RNode, context: any): string {
  if (!context.metaOptions?.p) return ''
  const planning = (node.properties?.planning ?? []) as Array<{
    keyword: string
    raw: string
    datetime: string
  }>
  if (planning.length === 0) return ''
  const parts = planning.map(({ keyword, raw, datetime }) => {
    const active = raw.startsWith('<')
    const cls = active ? 'org-timestamp' : 'org-timestamp org-timestamp--inactive'
    const dt = datetime ? ` datetime="${escapeHtml(datetime)}"` : ''
    return (
      `<span class="org-planning-keyword">${escapeHtml(keyword)}:</span> ` +
      `<time class="${cls}"${dt}>${escapeHtml(raw)}</time>`
    )
  })
  return `<p class="org-planning">${parts.join(' ')}</p>\n`
}

// Clock entries below a headline, collected into a logbook. Rendered only under
// #+OPTIONS: c:t (off by default), so bare CLOCK: lines never leak as text.
function renderClock(node: RNode, context: any): string {
  if (!context.metaOptions?.c) return ''
  const clock = (node.properties?.clock ?? []) as string[]
  if (clock.length === 0) return ''
  // D-04 — a CLOCK line is a MEASUREMENT, so it renders as one: the two stamps and the
  // duration each get their own element instead of the raw Org text sitting in a box, and
  // a host gets a hook for the number that matters. An unrecognised shape still prints
  // verbatim rather than being dropped.
  const entries = clock
    .map((line) => {
      const m = String(line).match(
        /^\s*CLOCK:\s*(\[[^\]]+\])(?:--(\[[^\]]+\]))?(?:\s*=>\s*(\S+))?\s*$/,
      )
      if (!m) return `<p class="org-clock">${escapeHtml(line)}</p>`
      const stamp = (raw: string) =>
        `<time class="org-timestamp org-timestamp--inactive">${escapeHtml(raw)}</time>`
      const end = m[2] ? `<span class="org-clock-sep">--</span>${stamp(m[2])}` : ''
      const span = m[3] ? `<span class="org-clock-duration">${escapeHtml(m[3])}</span>` : ''
      return (
        `<p class="org-clock"><span class="org-clock-label">CLOCK</span>` +
        `${stamp(m[1])}${end}${span}</p>`
      )
    })
    .join('\n')
  return `<div class="org-logbook">\n${entries}\n</div>\n`
}

async function renderParagraph(node: RNode, context: any): Promise<string> {
  // A paragraph whose only meaningful child is an image is a figure (the Org
  // convention) — emit <figure> so it gets block/caption treatment.
  const kids = (node.children ?? []) as RNode[]
  const meaningful = kids.filter((c) => !(c.type === 'text' && !String(c.value ?? '').trim()))
  if (meaningful.length === 1 && meaningful[0].type === 'image') {
    // #+ATTR_HTML: :class org-figure--bracket / --hatch adds the DEC-006 /
    // DEC-008 figure decorations. #+CAPTION becomes the figcaption.
    const caption = node.properties?.caption as RNode[] | undefined
    const captionHtml = caption
      ? `<figcaption class="org-figcaption">${await renderNodes(caption, context)}</figcaption>`
      : ''
    return `<figure class="org-figure${extraClass(node)}">${renderImage(meaningful[0], context)}${captionHtml}</figure>\n`
  }
  return `<p class="org-paragraph">${await renderChildren(node, context)}</p>\n`
}

async function renderList(node: RNode, context: any): Promise<string> {
  const items = await renderChildren(node, context)
  if (node.properties?.description) {
    return `<dl class="org-dl">\n${items}</dl>\n`
  }
  const ordered = Boolean(node.properties?.ordered)
  const tag = ordered ? 'ol' : 'ul'
  const cls = ordered ? 'org-ol' : 'org-ul'
  return `<${tag} class="${cls}">\n${items}</${tag}>\n`
}

async function renderListItem(node: RNode, context: any): Promise<string> {
  // Description item → <dt> term + <dd> body.
  const term = node.properties?.term as RNode[] | undefined
  if (term) {
    const dt = await renderNodes(term, context)
    const dd = await renderChildren(node, context)
    return `<dt class="org-dt">${dt}</dt>\n<dd class="org-dd">${dd}</dd>\n`
  }

  const inner = await renderChildren(node, context)

  // Checkbox item → a disabled native checkbox for real semantics + a hook.
  const checkbox = node.properties?.checkbox as string | undefined
  if (checkbox) {
    const checkedAttr = checkbox === 'checked' ? ' checked' : ''
    // The disabled state-mirror checkbox needs an accessible name (WCAG label).
    return (
      `<li class="org-li--checkbox" data-checkbox="${escapeHtml(checkbox)}">` +
      `<input type="checkbox" disabled${checkedAttr} aria-label="${escapeHtml(checkbox)}"> ${inner}</li>\n`
    )
  }

  // Counter cookie [@n] → an explicit ordinal on the item.
  const counter = node.properties?.counter
  if (typeof counter === 'number') {
    return `<li value="${counter}">${inner}</li>\n`
  }

  return `<li>${inner}</li>\n`
}

async function renderTable(node: RNode, context: any): Promise<string> {
  const rows = (node.children ?? []) as RNode[]
  const headRows = rows.filter((r) => r.properties?.header)
  const bodyRows = rows.filter((r) => !r.properties?.header)

  // `#+ATTR_O2H: :highlight-col N :highlight-row N` — the author points at the column or
  // row that carries the argument, the way a reader would with a finger. Indices are
  // 1-based over the table AS WRITTEN: columns count every column including the leading
  // label column; rows count BODY rows only, so a header is not row 1 and the `|---|`
  // rules are not rows at all. The marks are written onto the row/cell nodes here rather
  // than threaded through a context field, so a table nested inside a highlighted table
  // cannot inherit its parent's highlights.
  // `:highlight-cell <col>.<row>` picks ONE cell rather than a whole column or row — the
  // single number a comparison actually turns on. It wears the same mark as a highlighted
  // column cell, because it means the same thing to a reader; only the column's header
  // rule is withheld, since one cell is not a column.
  const o2h = (node.properties?.attrO2h ?? {}) as Record<string, string>
  const hlCols = parseIndexList(o2h['highlight-col'])
  const hlRows = parseIndexList(o2h['highlight-row'])
  const hlCells = parseCellList(o2h['highlight-cell'])
  if (hlCols.size > 0 || hlRows.size > 0 || hlCells.size > 0) {
    // A header row has no body-row index, so only a whole-column mark can reach it.
    headRows.forEach((row) =>
      ((row.children ?? []) as RNode[]).forEach((cell, ci) => {
        if (hlCols.has(ci + 1)) cell.properties = { ...cell.properties, hlCol: true }
      }),
    )
    bodyRows.forEach((row, ri) => {
      if (hlRows.has(ri + 1)) row.properties = { ...row.properties, hlRow: true }
      ;((row.children ?? []) as RNode[]).forEach((cell, ci) => {
        if (hlCols.has(ci + 1) || hlCells.has(`${ci + 1}.${ri + 1}`)) {
          cell.properties = { ...cell.properties, hlCol: true }
        }
      })
    })
  }

  // `#+ATTR_O2H: :chart bar` — the SAME table, drawn. The table is still rendered in
  // full below and travels inside the figure; the drawing is an illustration of it, not
  // a replacement, which is why the <svg> is aria-hidden and the numbers stay in a real
  // <table> for a screen reader, a crawler and a text-only reader.
  const chartKind = String(o2h['chart'] ?? '').trim().toLowerCase()
  let chart = ''
  if (chartKind === 'bar' && bodyRows.length > 0) {
    const colOf = (v: string | undefined, dflt: number) => {
      const [first] = [...parseIndexList(v)]
      return first ?? dflt
    }
    const labelCol = colOf(o2h['chart-label-col'], 1)
    const valueCol = colOf(o2h['chart-value-col'], 2)
    const data: ChartDatum[] = []
    const kept: number[] = []
    let unit = ''
    bodyRows.forEach((row, ri) => {
      const cells = (row.children ?? []) as RNode[]
      const cellText = (n: RNode | undefined) => getPlainTextOf((n?.children ?? []) as RNode[]).trim()
      const parsed = parseChartValue(cellText(cells[valueCol - 1]))
      // A cell with no number is DROPPED, never plotted as zero — a missing measurement
      // and a measurement of zero are different claims.
      if (!parsed) return
      if (parsed.unit) unit = parsed.unit
      data.push({ label: cellText(cells[labelCol - 1]), value: parsed.value, display: parsed.display })
      kept.push(ri + 1)
    })
    // Highlights are authored against the TABLE's body rows, so they are remapped onto
    // the bars that survived: dropping a row must not shift the accent onto its neighbour.
    const barHl = new Set<number>()
    kept.forEach((orig, idx) => {
      if (hlRows.has(orig)) barHl.add(idx + 1)
    })
    chart = renderBarChart(data, {
      labelCol,
      valueCol,
      highlight: barHl,
      axisLabel: String(o2h['chart-axis'] ?? '').trim(),
    }, unit)
  }

  const { outer: breakout, inner: tableClass } = splitBreakout(node)
  let html = `<table class="org-table${tableClass}">\n`
  // #+CAPTION rides the affiliated-keyword channel onto the table.
  const caption = node.properties?.caption as RNode[] | undefined
  if (caption) html += `<caption class="org-table-caption">${await renderNodes(caption, context)}</caption>\n`
  if (headRows.length > 0) {
    html += '<thead>\n'
    for (const row of headRows) html += await renderNode(row, context)
    html += '</thead>\n'
  }
  html += '<tbody>\n'
  for (const row of bodyRows) html += await renderNode(row, context)
  html += '</tbody>\n'
  html += '</table>\n'
  /*
   * A TABLE SCROLLS INSTEAD OF BEING CRUSHED. A table cannot render below its own
   * min-content width, so on a narrow screen it either overflows the PAGE — measured at
   * 390px, the page scrolled 191px — or, where it does fit, squeezes every column until
   * the words break one character per line. Neither is a table any more.
   *
   * The frame is emitted by the ENGINE and not by the runtime, so it is in the served
   * HTML: a reader with no JavaScript gets a scrollable table, and a prerendered page
   * reserves the right box instead of reflowing when a script arrives. Same split the
   * diagram already makes — the frame is structure, the panning is enhancement.
   *
   * A CHART'S source table is exempt: it lives inside .org-chart-data, clipped to one
   * pixel for a screen reader and a crawler. A scroll frame around something that is one
   * pixel wide is furniture nobody can reach.
   */
  if (!chart) return `<div class="org-table-scroll${breakout}">\n${html}</div>\n`
  const figCaption = caption
    ? `<figcaption class="org-chart-caption">${await renderNodes(caption, context)}</figcaption>\n`
    : ''
  return (
    `<figure class="org-chart" data-chart="bar">\n${chart}\n${figCaption}` +
    `<div class="org-chart-data">${html}</div>\n</figure>\n`
  )
}

async function renderTableRow(node: RNode, context: any): Promise<string> {
  const cells = await renderChildren(node, context)
  const cls = node.properties?.hlRow ? ' class="org-row--highlight"' : ''
  return `<tr${cls}>\n${cells}</tr>\n`
}

async function renderTableCell(node: RNode, context: any): Promise<string> {
  const inner = await renderChildren(node, context)
  const align = node.properties?.align ? String(node.properties.align) : ''
  const classes = [align ? `org-${align}` : '', node.properties?.hlCol ? 'org-cell--highlight' : '']
    .filter(Boolean)
    .join(' ')
  const cls = classes ? ` class="${escapeHtml(classes)}"` : ''
  if (node.properties?.header) return `<th scope="col"${cls}>${inner}</th>\n`
  return `<td${cls}>${inner}</td>\n`
}

// #+BEGIN_TABS — several alternatives sharing one slot. The markup is complete WITHOUT
// JavaScript: every panel ships in the served HTML, so a reader with no JS, a crawler and
// a printed page all get the whole content, and the runtime's only job is to hide the
// panels that are not selected. That is why nothing is hidden here.
async function renderTabs(node: RNode, context: any): Promise<string> {
  const panels = (node.children ?? []) as RNode[]
  if (panels.length === 0) return ''
  const group = uniqueId(context, 'org-tabs')
  const tabs: string[] = []
  const bodies: string[] = []
  for (const [i, panel] of panels.entries()) {
    const pid = `${group}-panel-${i + 1}`
    const tid = `${group}-tab-${i + 1}`
    const label = String(panel.properties?.label ?? `Tab ${i + 1}`)
    tabs.push(
      `<button type="button" class="org-tab" role="tab" data-tab="${escapeHtml(pid)}"` +
        ` id="${escapeHtml(tid)}" aria-controls="${escapeHtml(pid)}"` +
        ` aria-selected="${i === 0 ? 'true' : 'false'}">${escapeHtml(label)}</button>`,
    )
    bodies.push(
      `<div class="org-tabpanel" role="tabpanel" data-panel="${escapeHtml(pid)}"` +
        ` id="${escapeHtml(pid)}" aria-labelledby="${escapeHtml(tid)}">\n` +
        `${await renderChildren(panel, context)}</div>\n`,
    )
  }
  return (
    `<div class="org-tabs" data-o2h="tabs">\n` +
    `<div class="org-tablist" role="tablist">${tabs.join('')}</div>\n` +
    `${bodies.join('')}</div>\n`
  )
}

async function renderCodeBlock(node: RNode, _context: any): Promise<string> {
  // Reached only when no plugin handled 'codeBlock' (i.e. highlighting is off);
  // the built-in code-highlight plugin is resolved earlier in renderNode — R-07.
  // The same srcChrome the plugin uses wraps the plain block so the header-bar
  // markup (MAP-036) is identical with highlighting on or off (golden coverage).
  const language = String(node.properties?.language ?? '')
  const switches = String(node.properties?.switches ?? '')
  const code = String(node.children?.[0]?.value ?? '')
  const pre = `<pre class="org-src"><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`
  return srcChrome(pre, parseSrcMeta(language, switches)) + '\n'
}

async function renderQuote(node: RNode, context: any): Promise<string> {
  // #+ATTR_HTML: :class org-quote--pull turns a quote into the pull-quote
  // variant (MAP-030 / SB-108).
  return `<blockquote class="org-quote${extraClass(node)}">\n${await renderChildren(node, context)}</blockquote>\n`
}

async function renderExample(node: RNode): Promise<string> {
  // Verbatim: the single text child is emitted literally, no inline markup.
  // A #+RESULTS: example is code-execution output → .org-results (MAP-038).
  const text = String(node.children?.[0]?.value ?? '')
  const results = node.properties?.results ? ' org-results' : ''
  return `<pre class="org-example${results}${extraClass(node)}">${escapeHtml(text)}</pre>\n`
}

async function renderVerse(node: RNode): Promise<string> {
  // Verbatim but line-break preserving — each source newline becomes a <br>.
  const text = String(node.children?.[0]?.value ?? '')
  return `<p class="org-verse">${escapeHtml(text).replace(/\n/g, '<br>\n')}</p>\n`
}

async function renderCenter(node: RNode, context: any): Promise<string> {
  return `<div class="org-center">${await renderChildren(node, context)}</div>\n`
}

// Inline shortcode {{< name k="v" >}} → inert data-component placeholder.
function renderShortcode(node: RNode, context: any): string {
  const component = String(node.properties?.component ?? '')
  const attrs = (node.properties?.attrs ?? {}) as Record<string, unknown>
  const inline = Boolean(node.properties?.inline)
  return renderComponentPlaceholder(component, attrs, undefined, {
    ...componentOpts(context),
    inline,
  })
}

// Block component #+BEGIN_COMPONENT Name :k v (+ optional JSON props body).
function renderComponent(node: RNode, context: any): string {
  const name = String(node.properties?.name ?? '')
  const attrs = (node.properties?.attrs ?? {}) as Record<string, unknown>
  const props = node.properties?.props
  return renderComponentPlaceholder(name, attrs, props, componentOpts(context))
}

function componentOpts(context: any) {
  return {
    componentMap: context.options?.componentMap,
    strict: context.options?.strict,
    warn: (m: string) => console.error(`org2html: ${m}`),
  }
}

async function renderLink(node: RNode, context: any): Promise<string> {
  const href = String(node.properties?.href ?? '')
  const text = await renderChildren(node, context)
  // External web links get safe rel/target + a visible external marker.
  const isWeb = /^https?:\/\//i.test(href)
  const extAttrs = isWeb ? ' rel="noopener noreferrer" target="_blank"' : ''
  const marker = isWeb ? '<span class="org-link-external" aria-hidden="true">↗</span>' : ''
  return `<a class="org-link" href="${escapeHtml(safeUrl(href))}"${extAttrs}>${text}${marker}</a>`
}

/**
 * A LaTeX fragment is TYPESET at build time (MathML), so the reader needs no math
 * library, no webfont and no scanner — the browser draws it. When the typesetter is
 * unavailable or refuses the fragment, the raw source is emitted WITH its delimiters,
 * which is both the historical behaviour and exactly what a host running KaTeX or
 * MathJax itself needs to find. `math: false` keeps that raw form on purpose.
 */
async function renderMathNode(node: RNode, context: any): Promise<string> {
  const raw = String(node.children?.[0]?.value ?? '')
  const display = Boolean(node.properties?.display)
  if (context.math !== false) {
    const mathml = await renderMathML(raw, display)
    if (mathml) {
      const cls = display ? 'org-math org-math-display' : 'org-math'
      return `<span class="${cls}" data-math="mathml">${mathml}</span>`
    }
  }
  return rawMathFallback(raw, display)
}

function renderTimestamp(node: RNode): string {
  const raw = escapeHtml(String(node.properties?.raw ?? ''))
  const datetime = String(node.properties?.datetime ?? '')
  const cls = node.properties?.active ? 'org-timestamp' : 'org-timestamp org-timestamp--inactive'
  const dtAttr = datetime ? ` datetime="${escapeHtml(datetime)}"` : ''
  return `<time class="${cls}"${dtAttr}>${raw}</time>`
}

function renderImage(node: RNode, _context: any): string {
  const src = String(node.properties?.src ?? '')
  const alt = String(node.properties?.alt ?? '')
  /*
   * `#+ATTR_O2H: :main t` puts a HOOK on the very image the head points at. It is a class
   * and not a data-attribute because the sanitizer keeps an explicit attribute allowlist
   * and a hook is what this engine already calls a construct's handle — but the reason it
   * exists at all is verification: without it the claim "this picture is the share card"
   * lives only in a sidecar, and nothing in the rendered page can be checked against it.
   * Books may paint it; none has to.
   */
  const main = node.properties?.mainImage ? ' org-image--main' : ''
  return `<img class="org-image${main}" src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`
}

async function renderFootnote(node: RNode, context: any): Promise<string> {
  // Anonymous refs ([fn::def]) get a synthetic label so they still resolve.
  const label = String(node.properties?.ref ?? '') || `anon-${++context.anonCounter}`

  // Reuse the same number for repeated references to one label.
  let num = context.footnoteNums.get(label)
  if (num === undefined) {
    num = context.footnoteCounter++
    context.footnoteNums.set(label, num)
    context.footnoteOrder.push({ label, num })
  }

  // An inline definition ([fn:label:def] / [fn::def]) supplies its own content.
  const inlineDef = node.properties?.inlineDef as RNode[] | undefined
  if (inlineDef) {
    context.footnoteDefs.set(label, await renderNodes(inlineDef, context))
  }

  // Repeated references to one label must not emit a duplicate DOM id (WCAG
  // 4.1.1): the first ref keeps fnref-<label> (the definition backlinks to it),
  // later refs get -2, -3, …
  const seen = (context.footnoteRefCounts.get(label) ?? 0) + 1
  context.footnoteRefCounts.set(label, seen)
  const refId = seen === 1 ? `fnref-${label}` : `fnref-${label}-${seen}`

  return (
    `<sup id="${escapeHtml(refId)}" class="org-fnref">` +
    `<a href="#fn-${escapeHtml(label)}" role="doc-noteref" aria-label="Footnote ${num}">${num}</a></sup>`
  )
}

// A column-0 [fn:label] definition: register its content, emit nothing inline.
async function renderFootnoteDefinition(node: RNode, context: any): Promise<string> {
  const label = String(node.properties?.label ?? '')
  context.footnoteDefs.set(label, await renderChildren(node, context))
  return ''
}

function getPlainText(node: RNode): string {
  if (node.type === 'text') return String(node.value ?? '')
  if (!node.children) return String(node.value ?? '')
  return node.children.map(getPlainText).join('')
}

function getPlainTextOf(nodes: RNode[]): string {
  return nodes.map(getPlainText).join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Block dangerous URL schemes INDEPENDENT of DOMPurify so --no-sanitize output
// stays safe. Allows http(s)/mailto/tel/ftp, relative + in-page (#) links, and
// data:image; anything else (javascript:, vbscript:, non-image data:) → "#".
const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'ftp'])
function safeUrl(url: string): string {
  const trimmed = String(url).trim()
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!scheme) return trimmed // relative, #anchor, /path — no scheme, allowed
  const s = scheme[1].toLowerCase()
  if (s === 'data') return /^data:image\//i.test(trimmed) ? trimmed : '#'
  return SAFE_URL_SCHEMES.has(s) ? trimmed : '#'
}

