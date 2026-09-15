/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/renderer/seo.ts — single source of SEO/head truth.
 *
 * resolveSeo() derives the canonical, defaulted SEO field set from OrgMetadata
 * and buildJsonLd() builds the structured-data blob. BOTH the static-HTML head
 * (template.ts) and the Vue SFC head (vue-generator.ts) consume these, so the
 * two conversion targets never drift ([D-22]).
 */

import type { OrgMetadata } from "../types.js"

/**
 * Escape a JSON string for safe embedding inside an HTML <script> block. The
 * <head> is never sanitized, so a </script> in #+TITLE/description/author would
 * otherwise break out of the JSON-LD (or Vue <script>) block ([D-14]).
 */
export function escapeJsonForScript(json: string): string {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
}

// Collapse whitespace and cap a meta value to an SEO-friendly length.
function seoText(value: string, max = 160): string {
  const collapsed = value.replace(/\s+/g, " ").trim()
  return collapsed.length > max ? collapsed.slice(0, max - 1).trimEnd() + "…" : collapsed
}

// Validate the canonical / og:url value. Absolute (https://…) and site-relative
// (/path — the converter's norm, the host prepends its origin [D-22]) both pass;
// a value with whitespace or an unsafe scheme is garbage → dropped + warned. [S2]
function validateCanonical(raw: string | undefined): string {
  const v = (raw ?? "").trim()
  if (!v) return ""
  if (/\s/.test(v) || /^(?:javascript|vbscript|data):/i.test(v)) {
    console.error(`org2html: ignoring invalid #+CANONICAL "${v}"`)
    return ""
  }
  return v
}

/**
 * Join a site base with a site-relative path. Returns "" when there is no base, which is
 * the signal the caller needs: a relative URL is fine in a <link rel="canonical"> (the
 * browser resolves it against the page) but NOT in structured data, where an @id is an
 * identity and a relative one identifies nothing.
 */
export function absoluteUrl(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "")
  if (!base) return ""
  if (/^https?:\/\//i.test(path)) return path
  return `${base}/${String(path).replace(/^\/+/, "")}`
}

/** True for a URL a crawler can resolve without knowing which page it was found on. */
export function isAbsoluteUrl(url: string | undefined): boolean {
  return /^https?:\/\//i.test((url ?? "").trim())
}

export interface SeoFields {
  title: string
  subtitle: string
  description: string
  keywords: string
  author: string
  language: string
  canonical: string
  date: string
  /** ISO date for machine-readable fields (article:published_time, datePublished). */
  datePublished: string
  ogType: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  isArticle: boolean
  twitterCard: string
  twitterSite: string
  twitterCreator: string
  twitterImage: string
  themeColor: string
  robots: string
  tags: string
  /** og:site_name — the SITE's name, never the article's (see the note in resolveSeo). */
  siteName: string
  /** og:locale — #+LOCALE, else #+LANGUAGE. */
  locale: string
  /** article:modified_time / dateModified. */
  dateModified: string
  /** article:section — the primary category. */
  articleSection: string
  /** og:image:alt — #+OG_IMAGE_ALT, else the description. Only emitted with an image. */
  ogImageAlt: string
  /**
   * THE CARD IMAGE — what a LISTING shows for this document (an index, a related-reading
   * block, a feed reader). Same picture as the share card in the ordinary case, but they
   * are resolved separately and on purpose: the card is rendered BY THE SITE ITSELF, so a
   * site-relative path is correct and portable there, while ogImage has to survive being
   * fetched by a stranger's crawler and is made absolute wherever that is possible.
   */
  cardImage: string
  cardImageAlt: string
}

/**
 * THE SOCIAL IMAGE HAS TO BE FETCHABLE BY SOMEONE WHO IS NOT LOOKING AT THE PAGE.
 * A crawler reads og:image out of the head and goes to get it with no idea which page it
 * came from, so a root-relative path is resolved here against the canonical whenever the
 * canonical is absolute — the same --base-url that already earns the page its @id.
 *
 * A data: URI is REFUSED for this slot. It renders perfectly in the page, which is exactly
 * why it is a trap: every social consumer wants a URL it can request, and handing one an
 * inline blob produces a share card with no picture and no error. Better to publish no
 * og:image than one that cannot be fetched — the same rule this file already applies to a
 * relative @id. The CARD slot keeps it, because the site renders that one itself.
 */
function resolveSocialImage(raw: string | undefined, canonical: string): string {
  const src = String(raw ?? "").trim()
  if (!src) return ""
  if (isAbsoluteUrl(src)) return src
  if (/^data:/i.test(src)) return ""
  if (!isAbsoluteUrl(canonical)) return src
  try {
    return new URL(src, canonical).href
  } catch {
    return src
  }
}

// Resolve the defaulted SEO field set. theme-color defaults to the O2H signal
// color; og/twitter fall back through title/description/coverImage; the ISO
// date is preferred for machine fields while the raw #+DATE stays for display.
/**
 * The accent used for <meta name="theme-color"> when neither the document
 * (#+THEME_COLOR) nor the active Style Book names one. Matches the default
 * book's --o2h-theme-color; a swapped book overrides it through its manifest,
 * so the browser chrome follows the look instead of a literal frozen here.
 */
export const DEFAULT_THEME_COLOR = "#f9cd26"

export function resolveSeo(metadata: OrgMetadata, bookThemeColor?: string): SeoFields {
  const title = metadata.title || "Untitled"
  // Collapse whitespace + cap the description at the SEO-visible length.
  const description = seoText(metadata.description || metadata.excerpt || "")
  const canonical = validateCanonical(metadata.canonical)
  /*
   * WHICH PICTURE STANDS FOR THIS DOCUMENT. Three sources, and the order says what each
   * one MEANS rather than which is newest: #+OG_IMAGE is a purpose-made share card and
   * beats everything; #+COVER_IMAGE is the document's own cover; the `:main` mark on an
   * image in the body is the fallback, because the picture that represents an article is
   * usually one already inside it. The card flips the first two — a listing wants the
   * cover before it wants a card cropped for Twitter — and both end at the same mark, so
   * a document that only marks an image gets a consistent picture everywhere.
   */
  const socialSource = metadata.ogImage || metadata.coverImage || metadata.mainImage || ""
  const cardImage = (metadata.coverImage || metadata.mainImage || metadata.ogImage || "").trim()
  const ogImage = resolveSocialImage(socialSource, canonical)
  // The mark's own alt describes the marked picture and nothing else, so it is only ever
  // used as a default for the slot that actually ended up showing that picture.
  const mainAltFor = (chosen: string) =>
    chosen && chosen === metadata.mainImage ? metadata.mainImageAlt || "" : ""
  const ogType = metadata.ogType || "article"
  return {
    title,
    subtitle: metadata.subtitle || "",
    description,
    keywords: metadata.keywords?.join(", ") || "",
    author: metadata.author || "",
    language: metadata.language || "en",
    canonical,
    date: metadata.date || "",
    datePublished: metadata.dateIso || metadata.date || "",
    ogType,
    ogTitle: metadata.ogTitle || title,
    ogDescription: metadata.ogDescription || description,
    ogImage,
    isArticle: ogType === "article",
    twitterCard: metadata.twitterCard || "summary_large_image",
    twitterSite: metadata.twitterSite || "",
    twitterCreator: metadata.twitterCreator || "",
    twitterImage: metadata.twitterImage ? resolveSocialImage(metadata.twitterImage, canonical) : ogImage,
    themeColor: metadata.themeColor || bookThemeColor || DEFAULT_THEME_COLOR,
    robots: metadata.robots || "index, follow",
    tags: metadata.tags?.join(", ") || "",
    /*
     * og:site_name is the SITE's name. The template used to fill it with the article
     * title, which tells a crawler that every page belongs to a differently-named site —
     * the kind of quiet wrongness that never breaks a build and does real damage to how a
     * domain is understood. It now comes from #+SITE_NAME and is simply omitted when the
     * document does not name one.
     */
    siteName: metadata.siteName || "",
    locale: metadata.locale || metadata.language || "",
    dateModified: metadata.dateModifiedIso || metadata.dateModified || "",
    articleSection: metadata.category || "",
    // An image without alt text is an accessibility gap that also costs the share card
    // its description; the page description is a better default than nothing.
    ogImageAlt: metadata.ogImageAlt || mainAltFor(socialSource) || metadata.description || "",
    cardImage,
    cardImageAlt: mainAltFor(cardImage) || metadata.ogImageAlt || metadata.description || "",
  }
}

/**
 * Build the page's structured data.
 *
 * THE SHAPE. One node ships as a plain object; more than one ships as an `@graph`, which
 * is how schema.org expects a page that describes several things at once (the article, its
 * breadcrumb trail, an FAQ, the series it belongs to). The `@context` is declared once at
 * the top either way — repeating it inside every node is legal but noisy, and consumers
 * read it from the document.
 *
 * WHERE THE NODES COME FROM.
 *   · the computed article node — headline, description, author, dates, section, language,
 *     canonical, publisher, image;
 *   · `#+JSONLD: {…}` — a one-line object shallow-merged INTO that node (fields, not a new
 *     entity), which is what it has always done;
 *   · `#+BEGIN_JSONLD … #+END_JSONLD` blocks — a block with an `@type` becomes its own node
 *     in the graph; a block without one merges into the article node, so it can add fields
 *     that are too long to write on a keyword line.
 *
 * MALFORMED JSON IS IGNORED, LOUDLY-ENOUGH. A bad block never breaks the build and never
 * silently replaces good data: the computed node always ships. The build prints a warning
 * naming the document ([D-26] — no silent corruption).
 */
export function buildJsonLd(
  metadata: OrgMetadata,
  f: SeoFields,
  onWarn?: (message: string) => void,
): string {
  const authorNode: Record<string, unknown> = { "@type": "Person", name: f.author || "Unknown" }
  if (metadata.authorOrcid) authorNode.sameAs = metadata.authorOrcid
  if (metadata.authorAffiliation) authorNode.affiliation = metadata.authorAffiliation

  const data: Record<string, unknown> = {
    "@type": metadata.schemaType || "BlogPosting",
    headline: f.title,
    description: f.description,
    author: authorNode,
    wordCount: metadata.wordCount || 0,
    keywords: f.keywords,
  }
  if (f.datePublished) data.datePublished = f.datePublished
  // dateModified is what tells a crawler the page is maintained; without it a re-crawl
  // has nothing to compare against and an updated article looks stale.
  if (metadata.dateModifiedIso || metadata.dateModified) {
    data.dateModified = metadata.dateModifiedIso || metadata.dateModified
  }
  if (f.ogImage) data.image = f.ogImage
  if (metadata.category) data.articleSection = metadata.category
  if (metadata.language || metadata.locale) data.inLanguage = metadata.locale || metadata.language
  /*
   * `url` and `mainEntityOfPage` are IDENTITIES, so they are emitted only when the canonical
   * is absolute. A relative @id names nothing a crawler can resolve, and publishing one is
   * worse than leaving the field out: it looks like an answer. Give the build a --base-url
   * and both appear.
   */
  if (f.canonical && isAbsoluteUrl(f.canonical)) {
    data.mainEntityOfPage = { "@type": "WebPage", "@id": f.canonical }
    data.url = f.canonical
  }
  /*
   * #+POST_URL names the post that announces this document, and schema.org has the exact
   * property for it: discussionUrl is "a link to the page containing the comments of the
   * CreativeWork". Unlike the canonical above it is ABSOLUTE by construction — the parser
   * refuses a status URL on any other host — so it names something a crawler can resolve and
   * a reader can verify. That is the whole point of publishing it: the replies are somebody
   * else's words, and the page says where to go and check them.
   */
  if (metadata.postUrl) data.discussionUrl = metadata.postUrl

  const publisherName = metadata.publisher || metadata.siteName
  if (publisherName) data.publisher = { "@type": "Organization", name: publisherName }

  const graph: Array<Record<string, unknown>> = []

  /*
   * A post in a series IS PART OF that series — schema.org has a word for it, and saying so
   * is how a crawler learns the pages belong together rather than competing with each other
   * for the same terms.
   */
  const rel = metadata.relations
  if (rel?.series) {
    data.isPartOf = {
      "@type": "CreativeWorkSeries",
      name: rel.series.name,
      numberOfItems: rel.series.total,
      position: rel.series.position,
    }
  }

  /*
   * The breadcrumb trail is emitted ONLY when every crumb has a URL. The engine knows the
   * site root and the page's own route; it does NOT know what a category's archive URL is
   * on this site — that is the host's to decide (P-01), and the trail travels in
   * relations.json for the shell to render. A BreadcrumbList with a URL-less middle item is
   * worse than no BreadcrumbList: it publishes a trail no one can follow.
   */
  if (rel?.breadcrumb && rel.breadcrumb.length > 1) {
    const complete = rel.breadcrumb.every(
      (crumb, i) => (crumb.url && isAbsoluteUrl(crumb.url)) || i === rel.breadcrumb.length - 1,
    )
    if (complete) {
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: rel.breadcrumb.map((crumb, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: crumb.name,
          ...(crumb.url && isAbsoluteUrl(crumb.url) ? { item: crumb.url } : {}),
        })),
      })
    }
  }

  if (metadata.jsonld) {
    try {
      Object.assign(data, JSON.parse(metadata.jsonld))
    } catch {
      onWarn?.("#+JSONLD is not valid JSON — ignored")
    }
  }

  for (const [i, block] of (metadata.jsonldBlocks ?? []).entries()) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block)
    } catch (err) {
      onWarn?.(`#+BEGIN_JSONLD block ${i + 1} is not valid JSON — ignored (${(err as Error).message})`)
      continue
    }
    // An array declares several entities at once; each is treated as its own node.
    const nodes = Array.isArray(parsed) ? parsed : [parsed]
    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        onWarn?.(`#+BEGIN_JSONLD block ${i + 1} is not an object — ignored`)
        continue
      }
      const record = node as Record<string, unknown>
      if (record["@type"]) graph.push(record)
      else Object.assign(data, record)
    }
  }

  const payload =
    graph.length > 0
      ? { "@context": "https://schema.org", "@graph": [data, ...graph] }
      : { "@context": "https://schema.org", ...data }

  // Raw JSON — each embed point (static <script> in template.ts, the Vue seoMeta
  // literal) applies escapeJsonForScript ONCE so nothing double-escapes ([603]).
  return JSON.stringify(payload)
}
