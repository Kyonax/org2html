import type { AstNode, OrgAst, OrgMetadata } from '../types.js'
import { tokenize, type Token } from './lexer.js'
import { createNode, createTextNode, createDocument } from './ast.js'
import { extractMetadata, calculateReadingTime, extractExcerpt } from './metadata.js'

export function parse(content: string): OrgAst {
  const lines = content.split('\n')
  const { metadata, contentStartLine } = extractMetadata(lines)

  const contentLines = lines.slice(contentStartLine)
  const tokens = tokenize(contentLines.join('\n'))
  
  const children = parseTokens(tokens)
  
  // Calculate reading time and excerpt
  const plainText = extractPlainText(children)
  metadata.readingTime = calculateReadingTime(plainText)
  metadata.wordCount = plainText.split(/\s+/).length
  
  if (!metadata.excerpt && metadata.description) {
    metadata.excerpt = metadata.description
  } else if (!metadata.excerpt) {
    metadata.excerpt = extractExcerpt(plainText)
  }
  
  return createDocument(metadata, children) as OrgAst
}

function parseTokens(tokens: Token[]): AstNode[] {
  const nodes: AstNode[] = []
  let i = 0
  
  while (i < tokens.length) {
    const token = tokens[i]
    
    switch (token.type) {
      case 'HEADING': {
        const heading = parseHeading(token)
        nodes.push(heading)
        i++
        break
      }
      
      case 'CODE_BLOCK_START': {
        const { node, endIndex } = parseCodeBlock(tokens, i)
        nodes.push(node)
        i = endIndex + 1
        break
      }
      
      case 'BLOCK_START': {
        const { node, endIndex } = parseBlock(tokens, i)
        nodes.push(node)
        i = endIndex + 1
        break
      }
      
      case 'TABLE_ROW': {
        const { node, endIndex } = parseTable(tokens, i)
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
        const { node, endIndex } = parseDrawer(tokens, i)
        if (node) nodes.push(node)
        i = endIndex + 1
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
        if (node) nodes.push(node)
        i = endIndex + 1
        break
      }
      
      case 'BLANK':
        i++
        break
        
      default:
        i++
    }
  }
  
  return nodes
}

function parseHeading(token: Token): AstNode {
  const level = token.properties?.level || 1
  const text = token.value
  
  // Parse tags from heading
  const tagMatch = text.match(/^(.*?)\s+:([\w:]+):$/)
  const content = tagMatch ? tagMatch[1] : text
  const tags = tagMatch ? tagMatch[2].split(':').filter(Boolean) : []
  
  return createNode(
    'heading',
    { level, tags },
    parseInlineMarkup(content)
  )
}

function parseCodeBlock(tokens: Token[], startIndex: number): { node: AstNode; endIndex: number } {
  const startToken = tokens[startIndex]
  const language = startToken.properties?.language || ''
  const codeLines: string[] = []
  
  let i = startIndex + 1
  while (i < tokens.length && tokens[i].type !== 'CODE_BLOCK_END') {
    codeLines.push(tokens[i].value)
    i++
  }
  
  return {
    node: createNode('codeBlock', { language }, [createTextNode(codeLines.join('\n'))]),
    endIndex: i,
  }
}

function parseBlock(tokens: Token[], startIndex: number): { node: AstNode; endIndex: number } {
  const startToken = tokens[startIndex]
  const blockType = startToken.properties?.blockType || 'QUOTE'
  const contentLines: string[] = []
  
  let i = startIndex + 1
  while (i < tokens.length && tokens[i].type !== 'BLOCK_END') {
    contentLines.push(tokens[i].value)
    i++
  }
  
  const content = contentLines.join('\n')
  const nodeType = blockType === 'QUOTE' ? 'quote' : 
                   blockType === 'EXAMPLE' ? 'example' :
                   blockType === 'VERSE' ? 'verse' :
                   blockType === 'CENTER' ? 'center' : 'quote'
  
  return {
    node: createNode(nodeType, {}, parseInlineMarkup(content)),
    endIndex: i,
  }
}

function parseTable(tokens: Token[], startIndex: number): { node: AstNode; endIndex: number } {
  const rows: AstNode[] = []
  let i = startIndex
  
  while (i < tokens.length && tokens[i].type === 'TABLE_ROW') {
    const rowValue = tokens[i].value
    
    // Skip separator rows
    if (rowValue.match(/^\|[-+:| ]+\|$/)) {
      i++
      continue
    }
    
    const cells = rowValue
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    
    const cellNodes = cells.map((cell) =>
      createNode('tableCell', {}, parseInlineMarkup(cell))
    )
    
    rows.push(createNode('tableRow', {}, cellNodes))
    i++
  }
  
  return {
    node: createNode('table', {}, rows),
    endIndex: i - 1,
  }
}

function parseList(tokens: Token[], startIndex: number): { node: AstNode; endIndex: number } {
  const items: AstNode[] = []
  const ordered = tokens[startIndex].properties?.ordered || false
  const baseIndent = tokens[startIndex].indent
  
  let i = startIndex
  
  while (i < tokens.length && tokens[i].type === 'LIST_ITEM' && tokens[i].indent === baseIndent) {
    const itemContent = parseInlineMarkup(tokens[i].value)
    items.push(createNode('listItem', {}, itemContent))
    i++
  }
  
  return {
    node: createNode('list', { ordered }, items),
    endIndex: i - 1,
  }
}

function parseDrawer(tokens: Token[], startIndex: number): { node: AstNode | null; endIndex: number } {
  const drawerName = tokens[startIndex].properties?.name || ''
  const contentLines: string[] = []
  
  let i = startIndex + 1
  while (i < tokens.length && tokens[i].type !== 'DRAWER_END') {
    contentLines.push(tokens[i].value)
    i++
  }
  
  // Skip property drawers (already processed in metadata)
  if (drawerName === 'PROPERTIES') {
    return { node: null, endIndex: i }
  }
  
  return {
    node: createNode('drawer', { name: drawerName }, [createTextNode(contentLines.join('\n'))]),
    endIndex: i,
  }
}

function parseShortcode(token: Token): AstNode {
  const match = token.value.match(/\{\{<\s*(\w+)(.*?)>\}\}/)
  if (!match) return createTextNode(token.value)
  
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
  
  const content = lines.join(' ')
  return {
    node: createNode('paragraph', {}, parseInlineMarkup(content)),
    endIndex: i - 1,
  }
}

function parseInlineMarkup(text: string): AstNode[] {
  const nodes: AstNode[] = []
  let current = ''
  let i = 0
  
  while (i < text.length) {
    // Bold: *text*
    if (text[i] === '*' && text[i + 1] !== ' ') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      const end = text.indexOf('*', i + 1)
      if (end !== -1) {
        const content = text.substring(i + 1, end)
        nodes.push(createNode('bold', {}, parseInlineMarkup(content)))
        i = end + 1
        continue
      }
    }
    
    // Italic: /text/
    if (text[i] === '/' && text[i + 1] !== ' ') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      const end = text.indexOf('/', i + 1)
      if (end !== -1) {
        const content = text.substring(i + 1, end)
        nodes.push(createNode('italic', {}, [createTextNode(content)]))
        i = end + 1
        continue
      }
    }
    
    // Underline: _text_
    if (text[i] === '_' && text[i + 1] !== ' ') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      const end = text.indexOf('_', i + 1)
      if (end !== -1) {
        const content = text.substring(i + 1, end)
        nodes.push(createNode('underline', {}, [createTextNode(content)]))
        i = end + 1
        continue
      }
    }
    
    // Code: ~text~ or =text=
    if ((text[i] === '~' || text[i] === '=') && text[i + 1] !== ' ') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      const marker = text[i]
      const end = text.indexOf(marker, i + 1)
      if (end !== -1) {
        const content = text.substring(i + 1, end)
        nodes.push(createNode(marker === '~' ? 'code' : 'verbatim', {}, [createTextNode(content)]))
        i = end + 1
        continue
      }
    }
    
    // Strike: +text+
    if (text[i] === '+' && text[i + 1] !== ' ') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      const end = text.indexOf('+', i + 1)
      if (end !== -1) {
        const content = text.substring(i + 1, end)
        nodes.push(createNode('strike', {}, [createTextNode(content)]))
        i = end + 1
        continue
      }
    }
    
    // Links: [[url][description]] or [[url]]
    if (text.substring(i, i + 2) === '[[') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      const end = text.indexOf(']]', i + 2)
      if (end !== -1) {
        const linkContent = text.substring(i + 2, end)
        const parts = linkContent.split('][')
        const url = parts[0]
        const description = parts[1] || url
        
        // Check if it's an image
        if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
          nodes.push(createNode('image', { src: url, alt: description }))
        } else {
          nodes.push(createNode('link', { href: url }, [createTextNode(description)]))
        }
        
        i = end + 2
        continue
      }
    }
    
    // Footnotes: [fn:1] or [fn:label]
    if (text.substring(i, i + 4) === '[fn:') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      const end = text.indexOf(']', i + 4)
      if (end !== -1) {
        const ref = text.substring(i + 4, end)
        nodes.push(createNode('footnote', { ref }))
        i = end + 1
        continue
      }
    }
    
    // Line break: \\
    if (text.substring(i, i + 2) === '\\\\') {
      if (current) {
        nodes.push(createTextNode(current))
        current = ''
      }
      nodes.push(createNode('lineBreak', {}))
      i += 2
      continue
    }
    
    current += text[i]
    i++
  }
  
  if (current) {
    nodes.push(createTextNode(current))
  }
  
  return nodes
}

function extractPlainText(nodes: AstNode[]): string {
  let text = ''
  
  for (const node of nodes) {
    if (node.value) {
      text += node.value + ' '
    }
    if (node.children) {
      text += extractPlainText(node.children) + ' '
    }
  }
  
  return text
}
