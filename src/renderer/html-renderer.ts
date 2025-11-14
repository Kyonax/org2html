// src/renderer/html-renderer.ts
import type { AstNode, OrgAst, RenderOptions, RenderResult } from '../types.js'
import { sanitizeHtml } from './sanitizer.js'
import { highlightCode } from '../plugins/code-highlight.js'
import { generateToc } from '../plugins/toc.js'

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
  const context = {
    options,
    footnotes: new Map<string, string>(),
    footnoteCounter: 1,
    headings: [] as Array<{ level: number; text: string; id: string }>,
  }
  
  let bodyHtml = ''
  
  for (const node of ast.children as RNode[]) {
    bodyHtml += await renderNode(node, context)
  }
  
  // Add table of contents if enabled
  const tocEnabled = ast.metadata.options?.toc !== false
  let tocHtml = ''
  if (tocEnabled && context.headings.length > 0) {
    const tocDepth = typeof ast.metadata.options?.toc === 'number' 
      ? ast.metadata.options.toc 
      : 3
    tocHtml = generateToc(context.headings, tocDepth)
  }
  
  // Add footnotes section
  let footnotesHtml = ''
  if (context.footnotes.size > 0) {
    footnotesHtml = '<div class="footnotes"><hr><ol>'
    for (const [ref, content] of context.footnotes) {
      footnotesHtml += `<li id="fn-${escapeHtml(String(ref))}">${content} <a href="#fnref-${escapeHtml(String(ref))}">↩</a></li>`
    }
    footnotesHtml += '</ol></div>'
  }
  
  const fullHtml = tocHtml + bodyHtml + footnotesHtml
  
  // Sanitize if enabled
  const finalHtml = options.sanitize !== false ? sanitizeHtml(fullHtml) : fullHtml
  
  return {
    html: finalHtml,
    metadata: ast.metadata,
  }
}

async function renderNode(node: RNode, context: any): Promise<string> {
  switch (node.type) {
    case 'heading':
      return renderHeading(node, context)
    case 'paragraph':
      return renderParagraph(node, context)
    case 'list':
      return await renderList(node, context)
    case 'listItem':
      return await renderListItem(node, context)
    case 'table':
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
      return await renderExample(node, context)
    case 'verse':
      return await renderVerse(node, context)
    case 'center':
      return await renderCenter(node, context)
    case 'shortcode':
      return renderShortcode(node, context)
    case 'bold':
      return `<strong>${await renderChildren(node, context)}</strong>`
    case 'italic':
      return `<em>${await renderChildren(node, context)}</em>`
    case 'underline':
      return `<u>${await renderChildren(node, context)}</u>`
    case 'code':
      return `<code>${await renderChildren(node, context)}</code>`
    case 'verbatim':
      return `<code class="verbatim">${await renderChildren(node, context)}</code>`
    case 'strike':
      return `<del>${await renderChildren(node, context)}</del>`
    case 'link':
      return renderLink(node, context)
    case 'image':
      return renderImage(node, context)
    case 'footnote':
      return renderFootnote(node, context)
    case 'lineBreak':
      return '<br>'
    case 'text':
      return escapeHtml(String(node.value ?? ''))
    default:
      return ''
  }
}

async function renderChildren(node: RNode, context: any): Promise<string> {
  if (!node.children) return ''
  let html = ''
  for (const child of node.children) {
    html += await renderNode(child, context)
  }
  return html
}

function renderHeading(node: RNode, context: any): string {
  const level = Math.min(Number(node.properties?.level ?? 1), 6)
  // coerce child values into strings safely
  const text = (node.children ?? []).map((c) => String(c.value ?? '')).join('')
  const id = slugify(text)
  
  // Track for TOC
  context.headings.push({ level, text, id })
  
  const numberingEnabled = context.options?.num !== false
  const headingNumber = numberingEnabled ? '' : '' // TODO: Implement heading numbering
  
  return `<h${level} id="${escapeHtml(id)}">${headingNumber}${renderChildrenSync(node)}</h${level}>\n`
}

function renderParagraph(node: RNode, context: any): string {
  return `<p>${renderChildrenSync(node)}</p>\n`
}

async function renderList(node: RNode, context: any): Promise<string> {
  const tag = node.properties?.ordered ? 'ol' : 'ul'
  const items = await renderChildren(node, context)
  return `<${tag}>\n${items}</${tag}>\n`
}

async function renderListItem(node: RNode, context: any): Promise<string> {
  return `<li>${await renderChildren(node, context)}</li>\n`
}

async function renderTable(node: RNode, context: any): Promise<string> {
  const rows = await renderChildren(node, context)
  return `<table>\n<tbody>\n${rows}</tbody>\n</table>\n`
}

async function renderTableRow(node: RNode, context: any): Promise<string> {
  const cells = await renderChildren(node, context)
  return `<tr>\n${cells}</tr>\n`
}

async function renderTableCell(node: RNode, context: any): Promise<string> {
  return `<td>${await renderChildren(node, context)}</td>\n`
}

async function renderCodeBlock(node: RNode, context: any): Promise<string> {
  const language = String(node.properties?.language ?? '')
  const code = String(node.children?.[0]?.value ?? '')
  
  if (context.options.codeHighlight !== false) {
    const highlighted = await highlightCode(code, language)
    return `<pre><code class="language-${escapeHtml(language)}">${highlighted}</code></pre>\n`
  }
  
  return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre>\n`
}

async function renderQuote(node: RNode, context: any): Promise<string> {
  return `<blockquote>\n${await renderChildren(node, context)}</blockquote>\n`
}

async function renderExample(node: RNode, context: any): Promise<string> {
  return `<pre class="example">${await renderChildren(node, context)}</pre>\n`
}

async function renderVerse(node: RNode, context: any): Promise<string> {
  return `<p class="verse">${await renderChildren(node, context)}</p>\n`
}

async function renderCenter(node: RNode, context: any): Promise<string> {
  return `<div class="center">${await renderChildren(node, context)}</div>\n`
}

function renderShortcode(node: RNode, context: any): string {
  const component = String(node.properties?.component ?? '')
  const attrs = (node.properties?.attrs ?? {}) as Record<string, unknown>
  
  const attrString = Object.entries(attrs)
    .map(([key, value]) => `${escapeHtml(String(key))}="${escapeHtml(String(value ?? ''))}"`)
    .join(' ')
  
  return `<div data-component="${escapeHtml(component)}" ${attrString}></div>\n`
}

function renderLink(node: RNode, context: any): string {
  const href = String(node.properties?.href ?? '')
  const text = renderChildrenSync(node)
  return `<a href="${escapeHtml(href)}">${text}</a>`
}

function renderImage(node: RNode, context: any): string {
  const src = String(node.properties?.src ?? '')
  const alt = String(node.properties?.alt ?? '')
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`
}

function renderFootnote(node: RNode, context: any): string {
  const ref = String(node.properties?.ref ?? '')
  const num = context.footnoteCounter++
  context.footnotes.set(ref, `Footnote ${escapeHtml(ref)}`)
  return `<sup id="fnref-${escapeHtml(ref)}"><a href="#fn-${escapeHtml(ref)}">${num}</a></sup>`
}

function renderChildrenSync(node: RNode): string {
  if (!node.children) return ''
  return node.children.map((child) => {
    if (child.type === 'text') return escapeHtml(String(child.value ?? ''))
    if (child.type === 'bold') return `<strong>${renderChildrenSync(child)}</strong>`
    if (child.type === 'italic') return `<em>${renderChildrenSync(child)}</em>`
    if (child.type === 'code') return `<code>${renderChildrenSync(child)}</code>`
    if (child.type === 'link') return `<a href="${escapeHtml(String(child.properties?.href ?? ''))}">${renderChildrenSync(child)}</a>`
    // fallback - recursively render children (safe default)
    return renderChildrenSync(child)
  }).join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}
