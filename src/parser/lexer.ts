export type TokenType =
  | 'HEADING'
  | 'LIST_ITEM'
  | 'CODE_BLOCK_START'
  | 'CODE_BLOCK_END'
  | 'BLOCK_START'
  | 'BLOCK_END'
  | 'TABLE_ROW'
  | 'DRAWER_START'
  | 'DRAWER_END'
  | 'SHORTCODE'
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

export function tokenize(content: string): Token[] {
  const lines = content.split('\n')
  const tokens: Token[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const indent = line.length - line.trimStart().length

    // Blank line
    if (!trimmed) {
      tokens.push({ type: 'BLANK', value: '', line: i, indent })
      continue
    }

    // Heading
    const headingMatch = trimmed.match(/^(\*+)\s+(.*)$/)
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

    // Code block
    if (trimmed.match(/^#\+BEGIN_SRC\s*/i)) {
      const langMatch = trimmed.match(/^#\+BEGIN_SRC\s+(\w+)/i)
      tokens.push({
        type: 'CODE_BLOCK_START',
        value: '',
        line: i,
        indent,
        properties: { language: langMatch?.[1] || '' },
      })
      continue
    }

    if (trimmed.match(/^#\+END_SRC/i)) {
      tokens.push({ type: 'CODE_BLOCK_END', value: '', line: i, indent })
      continue
    }

    // Special blocks
    const blockStartMatch = trimmed.match(/^#\+BEGIN_(\w+)/i)
    if (blockStartMatch) {
      tokens.push({
        type: 'BLOCK_START',
        value: '',
        line: i,
        indent,
        properties: { blockType: blockStartMatch[1].toUpperCase() },
      })
      continue
    }

    const blockEndMatch = trimmed.match(/^#\+END_(\w+)/i)
    if (blockEndMatch) {
      tokens.push({
        type: 'BLOCK_END',
        value: '',
        line: i,
        indent,
        properties: { blockType: blockEndMatch[1].toUpperCase() },
      })
      continue
    }

    // Drawer
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

    if (trimmed === ':END:') {
      tokens.push({ type: 'DRAWER_END', value: '', line: i, indent })
      continue
    }

    // Table row
    if (trimmed.startsWith('|')) {
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

    // Shortcode
    const shortcodeMatch = trimmed.match(/^\{\{<\s*(\w+)(.*)>\}\}/)
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
