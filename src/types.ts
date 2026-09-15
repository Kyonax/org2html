/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/types.ts — Public type system.
 *
 * OrgMetadata, OrgOptions, RenderOptions, RenderResult,
 * AssetMetadata, AstNode, OrgAst, OrgPlugin, BuildConfig, and
 * the NodeType enumeration that covers all 28 supported nodes.
 * Plugin extension surface: OrgMetadata has an `[key: string]:
 * any` overflow so plugins can attach fields without widening
 * the interface.
 */

export interface OrgMetadata {
  title?: string
  subtitle?: string
  author?: string
  date?: string
  dateIso?: string
  email?: string
  /** #+SIGNOFF: the closing line a document page signs off with (SB doc shell). */
  signoff?: string
  /** #+DATE_MODIFIED / #+LAST_UPDATE — schema.org dateModified + article:modified_time. */
  dateModified?: string
  dateModifiedIso?: string
  /**
   * The HERO family (P-06) — the asset shown at the top of the ARTICLE, deliberately
   * separate from #+COVER_IMAGE / #+OG_IMAGE, which is the asset shared to a social card.
   * A page can want a wide hero video on the page and a still, cropped image on the card.
   */
  heroImage?: string
  heroVideo?: string
  heroPoster?: string
  heroAlt?: string
  heroCaption?: string
  /**
   * THE MAIN IMAGE — one image IN THE BODY, marked `#+ATTR_O2H: :main t`, promoted to
   * stand for the whole document: the social card and the index card both fall back to
   * it. It is deliberately a MARK rather than another keyword, because the picture that
   * represents an article is almost always one already in it, and naming it twice is how
   * a share card and a page drift apart. #+OG_IMAGE / #+COVER_IMAGE still win where they
   * are set — a document that wants a purpose-made card says so.
   *
   * `mainImage` is the src EXACTLY AS AUTHORED. Resolving it is resolveSeo()'s job.
   */
  mainImage?: string
  mainImageAlt?: string
  /** #+CATEGORY split on commas (P-02); `category` keeps the first for schema/article:section. */
  categories?: string[]
  /** #+SERIES — the name of the series this post belongs to (P-03). */
  series?: string
  /** #+SERIES_INDEX — fixes the post's position; without it the series orders by date. */
  seriesIndex?: number
  /** #+RELATED — slugs that REPLACE the computed related list (P-04). */
  related?: string[]
  /** #+PREV / #+NEXT — slugs that override the computed neighbours (P-05). */
  prevSlug?: string
  nextSlug?: string
  /** #+POST_URL — the X post announcing this document, as the author wrote it. */
  postUrl?: string
  /**
   * The numeric post id extracted from #+POST_URL. The comment thread keys on this; the
   * engine only records it, and never fetches the replies ([P-00] — comments are DATA).
   */
  postId?: string
  /**
   * Corpus relations, computed by the BUILD (never by parse — a document cannot know its
   * siblings). Typed structurally here so the parser stays independent of the CLI.
   */
  relations?: {
    slug: string
    url: string
    breadcrumb: Array<{ name: string; url: string | null }>
    series: {
      name: string
      position: number
      total: number
      items: Array<{ title: string; url: string; date?: string; current: boolean; position: number }>
    } | null
    related: Array<{ title: string; url: string; date?: string }>
    prev: { title: string; url: string; date?: string } | null
    next: { title: string; url: string; date?: string } | null
  }
  /** #+OG_IMAGE_ALT — alt text for the share image (defaults to the description). */
  ogImageAlt?: string
  /** #+SITE_NAME — og:site_name and the JSON-LD publisher. */
  siteName?: string
  /** #+PUBLISHER — overrides siteName for the JSON-LD publisher only. */
  publisher?: string
  /** #+LOCALE — og:locale (falls back to #+LANGUAGE). */
  locale?: string
  /**
   * `#+BEGIN_JSONLD … #+END_JSONLD` bodies, in document order. Each is a JSON object (or
   * array of objects) that NEVER reaches the body: a block carrying an `@type` becomes its
   * own node in the page's @graph, one without merges into the computed node.
   */
  jsonldBlocks?: string[]
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
  twitterImage?: string

  // Additional SEO / misc fields
  themeColor?: string
  robots?: string
  schemaType?: string
  jsonld?: string
  status?: string
  /** Page layout slug from #+HTML_LAYOUT (LAY-001…008); default article. */
  layout?: string
  /** #+TITLE_BLEED: t — masthead extends wider than the body reading column. */
  titleBleed?: boolean
  htmlHead?: string[]
  authorOrcid?: string
  authorAffiliation?: string

  // Allow extension by plugins/tools without having to modify the interface again
  [key: string]: any
}

export interface OrgOptions {
  toc?: boolean | number
  num?: boolean | number
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
  codeHighlight?: boolean
  /**
   * Typeset LaTeX fragments to MathML at build time (default on). `false` keeps the raw
   * fragment WITH its delimiters, which is what a host running KaTeX or MathJax scans for.
   */
  math?: boolean
  fetchRemoteAssets?: 'none' | 'metadata' | 'full'
  maxAssetSize?: number
  baseUrl?: string
  componentMap?: Record<string, string>
  /** Error on a component not in componentMap instead of an inert placeholder ([D-26]). */
  strict?: boolean
  /** Namespace for the emitted class hooks. Default 'org-' ([D-08]). */
  classPrefix?: string
  /** Shiki theme id for code blocks. Default 'css-variables' (→ --o2h-syn-* tokens). */
  codeTheme?: string
  /** Color theme written to the root wrapper as data-theme (e.g. 'light' | 'dark'). */
  theme?: string
  /** Inline the engine's default stylesheet. Default true ([D-28]). */
  injectDefaultStyles?: boolean
  /** How custom CSS combines with the default: 'replace' (default) or 'append'. */
  styleMode?: 'replace' | 'append'
  /** Custom-property overrides emitted as a :root{} block (host tokens or --o2h-*). */
  cssVars?: Record<string, string>
  /** Body font-family stack override → --host-font-editorial. */
  fontStack?: string
  /** Conversion-time plugins loaded by the caller/CLI (registry order — [D-22]). */
  plugins?: OrgPlugin[]
}

/**
 * Template-layer styling controls ([D-28] reference-don't-build). Resolved by the
 * CLI (file reads for customCss / linked hrefs) and passed to applyTemplate.
 */
export interface StyleOptions {
  /** Inline the engine's default stylesheet. Default true. */
  injectDefaultStyles?: boolean
  /** Combine custom CSS with the default: 'replace' (default) or 'append'. */
  styleMode?: 'replace' | 'append'
  /** Raw CSS to inline (from --css / --css-append). */
  customCss?: string
  /** Stylesheet hrefs to reference via <link> instead of inlining (--link-css). */
  linkedStylesheets?: string[]
  /** Link the engine's default stylesheet as /styles.css instead of inlining it
   * (--link-styles) — one cacheable file across pages instead of ~40 KB/page. */
  linkDefaultStyles?: boolean
  /** Reference the default interactive runtime (/o2h.js). Default true; set false
   * with --no-scripts. The engine never executes it ([D-28]). */
  linkDefaultScripts?: boolean
  /** Custom-property overrides emitted as a :root{} block (--css-var). */
  cssVars?: Record<string, string>
  /** Body font-family stack override → --host-font-editorial (--font). */
  fontStack?: string
  /** Inline template HTML (from a resolved Style Book) — used instead of a file. */
  templateHtml?: string
  /** Script hrefs referenced via <script src> before </body> (never executed — [D-28]). */
  linkedScripts?: string[]
  /** Browser-chrome accent declared by the active Style Book. Feeds
   *  <meta name="theme-color"> unless the document sets #+THEME_COLOR. */
  bookThemeColor?: string
  /** Path prefix for every root-absolute asset the engine references (--asset-base).
   *  Empty (the default) leaves output byte-identical; see normaliseAssetBase. */
  assetBase?: string
  /** Basenames of the webfont files the build ACTUALLY copied into <output>/fonts/.
   *  The {{fontPreload}} slot is built from this, so a face that was not emitted can
   *  never be preloaded — the engine does not redistribute fonts ([#41]), and an
   *  unconditional preload of a file that is not there is two silent 404s per page. */
  copiedFonts?: string[]
  /** Faces the active Style Book wants preloaded, from stylebook.json `preload`.
   *  Intersected with copiedFonts; absent means "the book asked for none". */
  preloadFonts?: string[]
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
  | 'inlinetask'
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
  | 'component'
  /** #+BEGIN_TABS and the #+TAB: panels inside it. */
  | 'tabs'
  | 'tabPanel'
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
  | 'target'
  | 'coderef'
  | 'lineBreak'
  | 'horizontalRule'
  | 'specialBlock'
  | 'fixedWidth'
  | 'dynamicBlock'
  | 'subscript'
  | 'superscript'
  | 'math'
  | 'statisticsCookie'
  | 'timestamp'
  | 'inlineSrc'
  | 'citation'
  | 'footnoteDefinition'
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
  /** Render a block node type / special-block name. Return undefined to defer. */
  blockHandlers?: Record<string, (node: AstNode, context: any) => string | Promise<string>>
  /** Render an inline node type. Return undefined to defer to the built-in. */
  inlineHandlers?: Record<string, (node: AstNode, context: any) => string | Promise<string>>
  /** Transform metadata before rendering (sync or async). */
  metadataProcessor?: (metadata: OrgMetadata) => OrgMetadata | Promise<OrgMetadata>
  /** Transform the final HTML after render + sanitize (sync or async). */
  postProcessor?: (html: string, metadata: OrgMetadata) => string | Promise<string>
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
  codeHighlight?: boolean
  /** Typeset LaTeX to MathML at build time (default on); false keeps the raw fragment. */
  math?: boolean
  /** Label for the root crumb in relations.json (default "Home"). */
  homeLabel?: string
  componentMap?: Record<string, string>
  // Styling knobs ([D-28])
  theme?: string
  codeTheme?: string
  classPrefix?: string
  fontStack?: string
  cssVars?: Record<string, string>
  styleMode?: 'replace' | 'append'
  injectDefaultStyles?: boolean
  customCss?: string
  linkedStylesheets?: string[]
}
