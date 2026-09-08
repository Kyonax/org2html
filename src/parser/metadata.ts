/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/parser/metadata.ts — #+KEY: extraction + derived fields.
 *
 * extractMetadata scans the file's leading metadata block,
 * normalizing the recognized #+KEY: lines into OrgMetadata.
 * calculateReadingTime + extractExcerpt produce derived
 * fields from the plain-text projection.
 */

import type { OrgMetadata, OrgOptions } from "../types.js"
import slugify from "slugify"

// The eight page layouts (LAY-001…008). #+HTML_LAYOUT normalizes against these;
// an unrecognized value leaves the layout unset (the default article look).
const LAYOUTS = new Set([
  'magazine', 'archive', 'editorial', 'feed', 'author', 'article', 'category', 'newsletter',
])

export function extractMetadata(lines: string[]): {
  metadata: OrgMetadata
  contentStartLine: number
} {
  const metadata: OrgMetadata = {
    options: {},
    properties: {},
    tags: [],
    keywords: [],
  }

  let i = 0
  let inPropertyDrawer = false
  const propertyDrawerProps: Record<string, string> = {}

  // Parse metadata lines at the top
  while (i < lines.length) {
    const line = lines[i].trim()

    // Property drawer
    if (line === ":PROPERTIES:") {
      inPropertyDrawer = true
      i++
      continue
    }

    if (line === ":END:" && inPropertyDrawer) {
      inPropertyDrawer = false
      metadata.properties = { ...metadata.properties, ...propertyDrawerProps }
      i++
      continue
    }

    if (inPropertyDrawer) {
      const propMatch = line.match(/^:(\w+):\s*(.*)$/)
      if (propMatch) {
        propertyDrawerProps[propMatch[1]] = propMatch[2]
      }
      i++
      continue
    }

    // Affiliated keywords (#+ATTR_HTML / #+CAPTION / #+NAME / #+RESULTS / #+HEADER)
    // attach to the FOLLOWING element, not the document — they mark where content
    // begins, so the body parser (not front-matter extraction) handles them. Without
    // this, a hero image's `#+ATTR_HTML: :class …` at the top of a file is swallowed.
    if (/^#\+(?:ATTR_HTML|ATTR_ORG|ATTR_O2H|CAPTION|NAME|RESULTS|HEADER|PLOT):/i.test(line)) {
      break
    }

    // …and so does a dynamic block. `#+BEGIN: columnview :hlines 1` has exactly
    // the shape of a `#+KEY: value` line, so a document that OPENED with one had
    // the block's delimiters eaten as keywords named BEGIN and END and lost the
    // block entirely — while the same construct one line lower parsed fine,
    // which is what made it hard to see.
    if (/^#\+(?:BEGIN|END)\b/i.test(line)) {
      break
    }

    // Metadata lines
    const metaMatch = line.match(/^#\+(\w+):\s*(.*)$/i)
    if (metaMatch) {
      const key = metaMatch[1].toUpperCase()
      const value = metaMatch[2].trim()

      switch (key) {
        case "TITLE":
          metadata.title = value
          break
        case "SUBTITLE":
          metadata.subtitle = value
          break
        case "AUTHOR": {
          // Rich #+AUTHOR: peel \orcidlink{ID} + \affiliation{…} into structured
          // fields and clean the display name (drop LaTeX cmds + ~ nbsp).
          const a = parseAuthor(value)
          metadata.author = a.name
          if (a.orcid) metadata.authorOrcid = a.orcid
          if (a.affiliation) metadata.authorAffiliation = a.affiliation
          break
        }
        case "DATE": {
          metadata.date = value
          // Normalize to an ISO date (YYYY-MM-DD) for article:published_time +
          // JSON-LD datePublished; the raw #+DATE stays for display.
          const iso = normalizeDateIso(value)
          if (iso) metadata.dateIso = iso
          break
        }
        case "EMAIL":
          metadata.email = value
          break
        case "DATE_MODIFIED":
        case "LAST_UPDATE": {
          // Both spellings reach the same field: DATE_MODIFIED is the SEO name, and
          // LAST_UPDATE is what the author's own notes already carry.
          metadata.dateModified = value
          const iso = value.match(/\d{4}-\d{2}-\d{2}/)
          if (iso) metadata.dateModifiedIso = iso[0]
          break
        }
        case "SERIES":
          metadata.series = value
          break
        case "SERIES_INDEX": {
          const n = Number.parseInt(value, 10)
          if (Number.isFinite(n)) metadata.seriesIndex = n
          break
        }
        case "RELATED":
          metadata.related = value
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean)
          break
        case "PREV":
          metadata.prevSlug = value.trim()
          break
        case "NEXT":
          metadata.nextSlug = value.trim()
          break
        case "HERO_IMAGE":
          metadata.heroImage = value
          break
        case "HERO_VIDEO":
          metadata.heroVideo = value
          break
        case "HERO_POSTER":
          metadata.heroPoster = value
          break
        case "HERO_ALT":
          metadata.heroAlt = value
          break
        case "HERO_CAPTION":
          metadata.heroCaption = value
          break
        case "OG_IMAGE_ALT":
          metadata.ogImageAlt = value
          break
        case "SITE_NAME":
          metadata.siteName = value
          break
        case "PUBLISHER":
          metadata.publisher = value
          break
        case "LOCALE":
          metadata.locale = value
          break
        case "SIGNOFF":
          // The document shell's closing unit: kyo-web-online's document-page.vue
          // renders one only when the page passes a `signoff` string, so this is
          // author-driven too — no default, no invented colophon.
          metadata.signoff = value
          break
        case "DESCRIPTION":
          metadata.description = value
          break
        case "KEYWORDS":
          metadata.keywords = value.split(",").map((k) => k.trim())
          break
        case "LANGUAGE":
          metadata.language = value
          break
        case "CATEGORY":
          // P-02: a comma-separated list is a documented extension of Org's single-valued
          // convention. `category` keeps the FIRST term, so article:section and
          // schema.org's articleSection — both singular by definition — stay correct.
          metadata.categories = value
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
          metadata.category = metadata.categories[0] || value
          break
        case "FILETAGS":
          metadata.tags = parseFileTags(value)
          break
        case "OPTIONS":
          metadata.options = { ...metadata.options, ...parseOptions(value) }
          break
        case "CANONICAL":
          metadata.canonical = value
          break
        case "COVER_IMAGE":
          metadata.coverImage = value
          break
        case "OG_IMAGE":
          metadata.ogImage = value
          break
        case "OG_TITLE":
          metadata.ogTitle = value
          break
        case "OG_DESCRIPTION":
          metadata.ogDescription = value
          break
        case "OG_TYPE":
          metadata.ogType = value
          break
        case "TWITTER_CARD":
          metadata.twitterCard = value as any
          break
        case "TWITTER_SITE":
          metadata.twitterSite = value
          break
        case "TWITTER_CREATOR":
          metadata.twitterCreator = value
          break
        case "TWITTER_IMAGE":
          metadata.twitterImage = value
          break
        case "THEME_COLOR":
          metadata.themeColor = value
          break
        case "ROBOTS":
          metadata.robots = value
          break
        case "SCHEMA_TYPE":
          metadata.schemaType = value
          break
        case "JSONLD":
          metadata.jsonld = value
          break
        case "STATUS":
          metadata.status = value
          break
        case "HTML_LAYOUT": {
          // Page layout (LAY-001…008). Normalized to a known slug; an unknown
          // value falls back to the default article layout.
          const slug = value.trim().toLowerCase()
          if (LAYOUTS.has(slug)) metadata.layout = slug
          break
        }
        case "TITLE_BLEED":
          // Opt-in wide, centred masthead: the title/deck extend past the body
          // reading column. #+TITLE_BLEED: t | true | yes.
          metadata.titleBleed = /^(t|true|yes|1)$/i.test(value.trim())
          break
        case "HTML_HEAD":
        case "HTML_HEAD_EXTRA":
          // Arbitrary trusted-author head injection; multiple lines accumulate.
          ;(metadata.htmlHead ??= []).push(value)
          break
        case "POST_URL": {
          // #+POST_URL: https://x.com/<handle>/status/<id> — the post that ANNOUNCES this
          // document. The engine records it and nothing more: it never calls X, and it
          // renders no comment markup. Comments are DATA, exactly as relations are ([P-00])
          // — a separate tool fetches the thread and the host renders it.
          //
          // The host is anchored, so a status URL on another domain is not accepted. The id
          // is extracted here because everything downstream keys on it, and because an
          // unparseable value should fail once, at the edge, rather than at fetch time.
          // Like #+HTML_LAYOUT with an unknown slug, a bad value leaves the field unset
          // rather than throwing: a malformed announcement URL must not fail a build.
          const raw = value.trim()
          const m =
            raw.match(
              /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x)\.com\/[^/\s]+\/status(?:es)?\/(\d{5,25})/,
            ) || raw.match(/^(\d{5,25})$/)
          if (m) {
            metadata.postUrl = raw
            metadata.postId = m[1]
          }
          break
        }
        default:
          // Store unknown metadata
          if (!metadata.properties) metadata.properties = {}
          metadata.properties[key] = value
      }
      i++
      continue
    }

    // A block delimiter (#+BEGIN.../#+END...) marks the start of content — the
    // metadata region ends here so the block is not swallowed as front-matter.
    if (/^#\+(?:BEGIN|END)/i.test(line)) {
      break
    }

    // A "# " comment inside the header is skipped, not treated as content, so
    // metadata keywords that follow a header comment are still collected.
    if (/^#(?:\s|$)/.test(line)) {
      i++
      continue
    }

    // Any other non-metadata, non-blank line (plain text, a stray "#+foo") is
    // where the body begins.
    if (line && !line.startsWith(":")) {
      break
    }

    i++
  }

  // Generate slug
  if (metadata.title) {
    metadata.slug = slugify(metadata.title, { lower: true, strict: true })
  }

  return { metadata, contentStartLine: i }
}

// Parse a rich #+AUTHOR value into a clean display name + structured ORCID /
// affiliation. Recognizes \orcidlink{ID} (→ an orcid.org URL) and
// \affiliation{…}; strips any remaining \cmd{…} and ~ (nbsp) from the name.
function parseAuthor(value: string): { name: string; orcid?: string; affiliation?: string } {
  let name = value
  let orcid: string | undefined
  let affiliation: string | undefined

  const orcidMatch = name.match(/\\orcidlink\{([0-9-]+[0-9X])\}/)
  if (orcidMatch) {
    orcid = `https://orcid.org/${orcidMatch[1]}`
    name = name.replace(orcidMatch[0], "")
  }
  const affMatch = name.match(/\\affiliation\{([^}]*)\}/)
  if (affMatch) {
    affiliation = affMatch[1].trim()
    name = name.replace(affMatch[0], "")
  }
  name = name
    .replace(/\\[a-zA-Z]+\{[^}]*\}/g, "")
    .replace(/~/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return { name, orcid, affiliation }
}

function parseFileTags(value: string): string[] {
  // Parse :tag1:tag2:tag3: (also space-separated). Org tag chars are widened
  // to [\w@#%] so tags like :@work: / :#urgent: survive.
  const tags = value.match(/[\w@#%]+/g)
  return tags ? tags : []
}

// Normalize a #+DATE value to an ISO date (YYYY-MM-DD). Handles an Org
// timestamp (<2026-07-01 …> / [..]), a bare ISO date, and common freeform
// forms ("May 21, 2026"). Freeform parsing uses LOCAL date components so a
// midnight-local parse is not shifted a day by a UTC conversion.
// Month names for the non-English forms `new Date()` cannot parse. Org is used
// far beyond en-US and a date that fails to normalize costs the document its
// article:published_time and its JSON-LD datePublished — a silent SEO loss.
const MONTH_NAMES: Record<string, number> = {
  // Spanish
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // Portuguese (differs from Spanish where it matters)
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, maio: 5, junho: 6, julho: 7,
  setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  // French
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
}

// "13 de mayo de 2026" / "12 de Mayo del 2026" / "13 mai 2026"
const LONG_FORM_DATE = /\b(\d{1,2})\s+(?:de\s+)?([A-Za-zÀ-ÿ]+)\s+(?:de[l]?\s+|d[eu]\s+)?(\d{4})\b/

function normalizeDateIso(value: string): string | undefined {
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const long = value.match(LONG_FORM_DATE)
  if (long) {
    const month = MONTH_NAMES[long[2].toLowerCase()]
    if (month) {
      return `${long[3]}-${String(month).padStart(2, "0")}-${long[1].padStart(2, "0")}`
    }
  }

  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const da = String(d.getDate()).padStart(2, "0")
    return `${y}-${mo}-${da}`
  }
  return undefined
}

export function parseOptions(optionsString: string): OrgOptions {
  const options: OrgOptions = {}

  // Org #+OPTIONS is a space-separated list of key:value tokens where the key
  // may be a symbol (^ _ : | - * < ' \n) as well as a word (toc num H …). Split
  // on whitespace and at the FIRST colon so symbol keys survive. The one key
  // whose NAME is a colon (fixed-width sections, "::t") must be peeled before
  // that split or it would read as an empty key.
  for (const part of optionsString.split(/\s+/).filter(Boolean)) {
    let key: string
    let value: string
    if (part.startsWith("::")) {
      key = ":"
      value = part.slice(2)
    } else {
      const idx = part.indexOf(":")
      if (idx === -1) continue
      key = part.slice(0, idx)
      value = part.slice(idx + 1)
    }

    switch (key.toLowerCase()) {
      case "toc":
        options.toc = value === "nil" ? false : value === "t" ? true : Number.parseInt(value, 10)
        break
      case "num":
        // nil → off, t → on (all levels), N → number down to depth N.
        options.num = value === "nil" ? false : value === "t" ? true : Number.parseInt(value, 10)
        break
      case "date":
        options.date = value !== "nil"
        break
      case "h":
        options.H = Number.parseInt(value, 10)
        break
      case "author":
        options.author = value !== "nil"
        break
      case "email":
        options.email = value !== "nil"
        break
      case "title":
        options.title = value !== "nil"
        break
      case "_":
        // ^:/_: accept t / nil / {} — {} means "braces required".
        options.subscript = value === "nil" ? false : value === "{}" ? "braces" : true
        break
      case "^":
        options.superscript = value === "nil" ? false : value === "{}" ? "braces" : true
        break
      case "tex":
        // t → export math fragments, nil → drop them, verbatim → show source.
        options.tex = value === "nil" ? false : value === "verbatim" ? "verbatim" : true
        break
      case "tasks":
        // t / nil / todo / done — the keyword-filter values stay strings.
        options.tasks = value === "nil" ? false : value === "t" ? true : value
        break
      case "tags":
        // t / nil / not-in-toc (the TOC never carries tags here, so
        // not-in-toc behaves as t).
        options.tags = value === "nil" ? false : value === "t" ? true : value
        break
      case "arch":
        // t / nil / headline (Emacs default: archived trees keep only their
        // headline).
        options.arch = value === "nil" ? false : value === "t" ? true : value
        break
      case "d":
        // t / nil / ("NAME" …) — per-name drawer filtering is not implemented;
        // any list form behaves as t.
        options.d = value !== "nil"
        break
      default:
        // Store unknown options (symbol keys included: | : - * < ' \n f e p c
        // pri stat todo inline …).
        options[key] = value === "nil" ? false : value === "t" ? true : value
    }
  }

  return options
}

export function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200
  const words = text.split(/\s+/).length
  return Math.ceil(words / wordsPerMinute)
}

export function extractExcerpt(text: string, maxLength = 160): string {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.substring(0, maxLength).trim() + "..."
}
