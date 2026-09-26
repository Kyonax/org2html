/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/relations.ts — what a document cannot know about itself.
 *
 * A single .org file has no idea what else exists. Its series, the posts closest to it and
 * its neighbours in reading order are all facts about the CORPUS, so they are computed here,
 * in the CLI, from an index the build collects before it renders anything — and they are
 * DELIVERED AS DATA (a relations.json sidecar beside metadata.json), not as markup.
 *
 * WHY DATA AND NOT HTML (owner ruling P-00). These blocks are navigation, and navigation
 * belongs to the site shell: its routes, its wording, its language, its arrangement. The
 * engine knows which posts are related; it does not know whether the heading above them
 * should read "Leer también" or "Read next", or whether a category term is a route on this
 * site at all. So it hands over the relationships and stays out of the shell's way — the
 * same split the engine already makes between metadata and the head a host renders from it.
 */

export interface CorpusEntry {
  /** Route-relative URL the build assigned this document. */
  url: string
  /** The last path segment — what #+RELATED / #+PREV / #+NEXT refer to. */
  slug: string
  title: string
  description?: string
  /** ISO date when the document has one; the empty string sorts last. */
  date: string
  series?: string
  seriesIndex?: number
  categories: string[]
  tags: string[]
  keywords: string[]
  /**
   * The picture a LISTING may show for this document.
   *
   * HEADER-DERIVED ONLY, and that is a real limit worth stating. This index is built by a
   * metadata-only pre-pass that reads keywords WITHOUT tokenising bodies — which is what
   * keeps a corpus of hundreds cheap — so it can see #+COVER_IMAGE and #+OG_IMAGE but not
   * an `#+ATTR_O2H: :main t` mark, which only exists once a body has been parsed. A
   * document whose only picture is a body mark therefore carries an image in its own
   * outputs (head, feed.json, og-metadata.json) and none here. Closing that gap means
   * feeding the corpus from PARSED metadata instead of a header skim — a worthwhile
   * change, and a different one from this field.
   */
  image?: string
  /** Author-declared overrides, by slug. */
  related?: string[]
  prevSlug?: string
  nextSlug?: string
}

export interface RelationLink {
  title: string
  url: string
  date?: string
  /** See CorpusEntry.image — present only when the document DECLARES one in its header. */
  image?: string
}

export interface Relations {
  slug: string
  url: string
  /** Ordered root → current. `url` is null where only the site knows the route. */
  breadcrumb: Array<{ name: string; url: string | null }>
  series: {
    name: string
    position: number
    total: number
    items: Array<RelationLink & { current: boolean; position: number }>
  } | null
  related: RelationLink[]
  prev: RelationLink | null
  next: RelationLink | null
}

/** How many related posts to offer when the author has not curated a list. */
const RELATED_LIMIT = 5

/**
 * Closeness, scored on what the documents already declare. A shared TAG is the strongest
 * signal because a tag is a deliberate act of filing; a shared keyword is weaker (keywords
 * are written for search engines and drift); a shared category is weakest of all, since a
 * blog with four categories would otherwise call a quarter of itself "related".
 */
const WEIGHT_TAG = 3
const WEIGHT_KEYWORD = 2
const WEIGHT_CATEGORY = 1

function norm(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean))
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const value of a) if (b.has(value)) n++
  return n
}

function link(entry: CorpusEntry): RelationLink {
  return {
    title: entry.title,
    url: entry.url,
    date: entry.date || undefined,
    image: entry.image || undefined,
  }
}

/** Newest first; a document with no date sorts last rather than first. */
function byDateDesc(a: CorpusEntry, b: CorpusEntry): number {
  if (a.date === b.date) return a.slug.localeCompare(b.slug)
  if (!a.date) return 1
  if (!b.date) return -1
  return a.date < b.date ? 1 : -1
}

/** Series order: an explicit index wins, otherwise oldest first — a series reads forward. */
function bySeriesOrder(a: CorpusEntry, b: CorpusEntry): number {
  const ai = a.seriesIndex ?? Number.MAX_SAFE_INTEGER
  const bi = b.seriesIndex ?? Number.MAX_SAFE_INTEGER
  if (ai !== bi) return ai - bi
  if (a.date === b.date) return a.slug.localeCompare(b.slug)
  if (!a.date) return 1
  if (!b.date) return -1
  return a.date < b.date ? -1 : 1
}

function findBySlug(corpus: CorpusEntry[], slug: string): CorpusEntry | undefined {
  const wanted = slug.trim().toLowerCase().replace(/^\//, "")
  return corpus.find((e) => e.slug.toLowerCase() === wanted || e.url.replace(/^\//, "").toLowerCase() === wanted)
}

/**
 * Compute one document's relations against the corpus.
 *
 * `homeLabel` names the root crumb; the site owns every route in the trail except the
 * document's own, so the other entries carry a null url for the shell to fill in.
 */
/*
 * Work that belongs to the CORPUS, computed once for it.
 *
 * computeRelations runs once per document against the same corpus array, and it
 * used to re-derive the whole corpus every time: normalising every other entry's
 * tag / keyword / category sets, re-sorting the entire timeline, and scanning
 * for a slug. That is a per-document cost proportional to the corpus, which is
 * quadratic overall — measured at 239 ms for 500 documents, 935 ms for 1000 and
 * 4019 ms for 2000, roughly quadrupling each time the corpus doubled.
 *
 * Keyed by the array itself, so the cache lives exactly as long as the build
 * that owns it and two concurrent builds cannot see each other's.
 */
interface CorpusIndex {
  normalized: Map<CorpusEntry, { tags: Set<string>; keywords: Set<string>; categories: Set<string> }>
  timeline: CorpusEntry[]
  bySlug: Map<string, CorpusEntry>
}

const corpusIndexes = new WeakMap<CorpusEntry[], CorpusIndex>()

function indexOf(corpus: CorpusEntry[]): CorpusIndex {
  const cached = corpusIndexes.get(corpus)
  if (cached) return cached
  const normalized = new Map<
    CorpusEntry,
    { tags: Set<string>; keywords: Set<string>; categories: Set<string> }
  >()
  const bySlug = new Map<string, CorpusEntry>()
  for (const entry of corpus) {
    normalized.set(entry, {
      tags: norm(entry.tags),
      keywords: norm(entry.keywords),
      categories: norm(entry.categories),
    })
    // First wins, which is the order a linear scan would have found anyway.
    if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, entry)
  }
  const index: CorpusIndex = { normalized, timeline: [...corpus].sort(byDateDesc), bySlug }
  corpusIndexes.set(corpus, index)
  return index
}

export function computeRelations(
  self: CorpusEntry,
  corpus: CorpusEntry[],
  options: { homeLabel?: string; baseUrl?: string } = {},
): Relations {
  const index = indexOf(corpus)
  const others = corpus.filter((e) => e.url !== self.url)

  // ── Series (P-03: explicit key) ────────────────────────────────────────────────────
  let series: Relations["series"] = null
  if (self.series) {
    const members = corpus
      .filter((e) => e.series && e.series.toLowerCase() === self.series!.toLowerCase())
      .sort(bySeriesOrder)
    if (members.length > 0) {
      const position = members.findIndex((e) => e.url === self.url) + 1
      series = {
        name: self.series,
        position,
        total: members.length,
        items: members.map((e, i) => ({ ...link(e), current: e.url === self.url, position: i + 1 })),
      }
    }
  }

  // ── Related (P-04: computed, explicit overrides) ───────────────────────────────────
  let related: RelationLink[]
  if (self.related && self.related.length > 0) {
    related = self.related
      .map((slug) => findBySlug(corpus, slug))
      .filter((e): e is CorpusEntry => Boolean(e) && e!.url !== self.url)
      .map(link)
  } else {
    const selfNorm = index.normalized.get(self) ?? {
      tags: norm(self.tags),
      keywords: norm(self.keywords),
      categories: norm(self.categories),
    }
    const selfTags = selfNorm.tags
    const selfKeywords = selfNorm.keywords
    const selfCategories = selfNorm.categories
    // Posts already listed in the series block are excluded: the block sits right above,
    // and repeating them spends a slot that could surface something new.
    const seriesUrls = new Set((series?.items ?? []).map((i) => i.url))
    related = others
      .filter((e) => !seriesUrls.has(e.url))
      .map((e) => {
        const other = index.normalized.get(e)
        return {
          entry: e,
          score:
            overlap(selfTags, other ? other.tags : norm(e.tags)) * WEIGHT_TAG +
            overlap(selfKeywords, other ? other.keywords : norm(e.keywords)) * WEIGHT_KEYWORD +
            overlap(selfCategories, other ? other.categories : norm(e.categories)) * WEIGHT_CATEGORY,
        }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : byDateDesc(a.entry, b.entry)))
      .slice(0, RELATED_LIMIT)
      .map((s) => link(s.entry))
  }

  // ── Previous / next (P-05: chronological, series takes over inside a series) ───────
  let prev: RelationLink | null = null
  let next: RelationLink | null = null
  if (series && series.position > 0) {
    const items = series.items
    const i = series.position - 1
    prev = i > 0 ? { title: items[i - 1].title, url: items[i - 1].url, date: items[i - 1].date } : null
    next = i < items.length - 1 ? { title: items[i + 1].title, url: items[i + 1].url, date: items[i + 1].date } : null
  } else {
    // Newest first, so the entry BEFORE self in the list is the newer post ("next") and
    // the one after it is older ("previous") — the order a reader walks a blog in.
    const timeline = index.timeline
    const i = timeline.findIndex((e) => e.url === self.url)
    if (i !== -1) {
      if (i + 1 < timeline.length) prev = link(timeline[i + 1])
      if (i - 1 >= 0) next = link(timeline[i - 1])
    }
  }

  // An explicit #+PREV / #+NEXT wins over either rule.
  if (self.prevSlug) {
    const target = findBySlug(corpus, self.prevSlug)
    prev = target ? link(target) : prev
  }
  if (self.nextSlug) {
    const target = findBySlug(corpus, self.nextSlug)
    next = target ? link(target) : next
  }

  // ── Breadcrumb (P-01: data only; the site owns the routes) ─────────────────────────
  // The crumb URLs are ABSOLUTE when the build knows the site base — that is what lets the
  // structured data name them at all (a relative @id identifies nothing). Without a base
  // they stay site-relative, which the host's router understands and the JSON-LD declines
  // to publish. The category has no URL either way: only the site knows its archive route.
  const abs = (path: string) => {
    const base = (options.baseUrl ?? "").trim().replace(/\/+$/, "")
    return base ? `${base}/${path.replace(/^\/+/, "")}` : path
  }
  const breadcrumb: Relations["breadcrumb"] = [{ name: options.homeLabel || "Home", url: abs("/") }]
  if (self.categories.length > 0) breadcrumb.push({ name: self.categories[0], url: null })
  breadcrumb.push({ name: self.title, url: abs(self.url) })

  return { slug: self.slug, url: self.url, breadcrumb, series, related, prev, next }
}
