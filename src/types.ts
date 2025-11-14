// src/types.ts

export interface OrgMetadata {
  title?: string
  author?: string
  date?: string
  email?: string
  description?: string
  keywords?: string[]
  language?: string
  category?: string
  tags?: string[]
  options?: Record<string, any>
  properties?: Record<string, string>
  slug?: string
  coverImage?: string
  canonical?: string
  readingTime?: number
  wordCount?: number
  excerpt?: string

  // Open Graph (OG) fields
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  ogType?: string

  // Twitter card fields
  twitterCard?: string
  twitterSite?: string
  twitterCreator?: string

  // Additional SEO / misc fields
  themeColor?: string
  robots?: string

  // Allow extension by plugins/tools without having to modify the interface again
  [key: string]: any
}

export interface OrgOptions {
  toc?: boolean | number
  num?: boolean
  date?: boolean
  H?: number
  author?: boolean
  email?: boolean
  title?: boolean
  [key: string]: any
}

export interface RenderOptions {
  template?: string
  templateDir?: string
  sanitize?: boolean
  allowRawHtml?: boolean
  codeHighlight?: boolean
  fetchRemoteAssets?: 'none' | 'metadata' | 'full'
  maxAssetSize?: number
  baseUrl?: string
  componentMap?: Record<string, string>
}

export interface AssetMetadata {
  url: string
  type?: string
  width?: number
  height?: number
  size?: number
  lqip?: string
}

export interface RenderResult {
  html: string
  metadata: OrgMetadata
  assets?: AssetMetadata[]
}

export type NodeType =
  | 'document'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'listItem'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  | 'codeBlock'
  | 'quote'
  | 'example'
  | 'verse'
  | 'center'
  | 'drawer'
  | 'propertyDrawer'
  | 'shortcode'
  | 'text'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'code'
  | 'verbatim'
  | 'strike'
  | 'link'
  | 'image'
  | 'footnote'
  | 'lineBreak'
  | 'rawHtml'

export interface AstNode {
  type: NodeType
  children?: AstNode[]
  value?: string
  properties?: Record<string, any>
  position?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
}

export interface OrgAst extends AstNode {
  type: 'document'
  metadata: OrgMetadata
  children: AstNode[]
}

export interface OrgPlugin {
  name: string
  blockHandlers?: Record<string, (node: AstNode, context: any) => string>
  inlineHandlers?: Record<string, (node: AstNode, context: any) => string>
  metadataProcessor?: (metadata: OrgMetadata) => OrgMetadata
  postProcessor?: (html: string, metadata: OrgMetadata) => Promise<string>
}

export interface BuildConfig {
  input: string
  output: string
  template?: string
  config?: string
  fetchRemoteAssets?: 'none' | 'metadata' | 'full'
  maxAssetSize?: number
  baseUrl?: string
  sanitize?: boolean
  allowRawHtml?: boolean
  codeHighlight?: boolean
  componentMap?: Record<string, string>
}
