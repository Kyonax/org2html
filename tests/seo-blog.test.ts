/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/seo-blog.test.ts — the SEO surface, held to its contract.
 *
 * These are the assertions that make the head and the structured data provable rather than
 * hopeful. Several of them lock behaviour that is deliberately CONSERVATIVE — the engine
 * declining to publish a relative @id, or a breadcrumb trail whose middle link goes
 * nowhere. Publishing a half-answer to a crawler is worse than publishing nothing, and a
 * future "improvement" that starts emitting those should fail here first.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml, applyTemplate } from "../src/index.js"
import { resolveSeo, buildJsonLd, absoluteUrl, isAbsoluteUrl } from "../src/renderer/seo.js"
import { computeRelations, type CorpusEntry } from "../src/cli/relations.js"

async function head(src: string): Promise<string> {
  const { html, metadata } = await renderToHtml(parse(src), { codeHighlight: false })
  const page = await applyTemplate(html, metadata)
  return page.slice(0, page.indexOf("</head>"))
}

function ld(src: string, extra: Partial<Record<string, unknown>> = {}): any {
  const ast = parse(src)
  Object.assign(ast.metadata, extra)
  return JSON.parse(buildJsonLd(ast.metadata, resolveSeo(ast.metadata)))
}

const FULL = `#+TITLE: De Org-mode a Trilium Notes
#+DESCRIPTION: A field report on moving a knowledge base
#+AUTHOR: Cristian D. Moreno
#+CATEGORY: Software, Productividad
#+FILETAGS: :orgmode:trilium:homelab:
#+KEYWORDS: trilium, notes
#+LANGUAGE: es
#+SITE_NAME: kyonax.com
#+DATE: 2026-03-02
#+DATE_MODIFIED: 2026-08-25
#+CANONICAL: https://kyonax.com/blog/trilium

Body text here.
`

describe("the head carries what a crawler reads", () => {
  it("names the SITE in og:site_name, not the article", async () => {
    // The template used to fill og:site_name with {{title}}, which tells a crawler every
    // page belongs to a differently-named site.
    const h = await head(FULL)
    expect(h).toContain('<meta property="og:site_name" content="kyonax.com">')
    expect(h).not.toContain('<meta property="og:site_name" content="De Org-mode')
  })

  it("repeats article:tag once per tag", async () => {
    const h = await head(FULL)
    expect(h).toContain('<meta property="article:tag" content="orgmode">')
    expect(h).toContain('<meta property="article:tag" content="trilium">')
    expect(h).toContain('<meta property="article:tag" content="homelab">')
    // The comma-joined single tag is the shape this replaced.
    expect(h).not.toContain('content="orgmode, trilium, homelab"')
  })

  it("carries section, locale and both dates", async () => {
    const h = await head(FULL)
    expect(h).toContain('<meta property="article:section" content="Software">')
    expect(h).toContain('<meta property="og:locale" content="es">')
    expect(h).toContain('<meta property="article:published_time" content="2026-03-02">')
    expect(h).toContain('<meta property="article:modified_time" content="2026-08-25">')
  })

  it("only claims an image alt when there is an image", async () => {
    const withImage = await head(FULL.replace("#+DATE:", "#+OG_IMAGE: /card.jpg\n#+DATE:"))
    expect(withImage).toContain('<meta property="og:image:alt"')
    const without = await head(FULL)
    expect(without).not.toContain("og:image:alt")
  })
})

describe("structured data refuses to publish a half-answer", () => {
  it("omits url and mainEntityOfPage when the canonical is relative", () => {
    const data = ld(FULL.replace("https://kyonax.com/blog/trilium", "/blog/trilium"))
    expect(data.url).toBeUndefined()
    expect(data.mainEntityOfPage).toBeUndefined()
    // Everything else still ships — a missing identity is not a missing document.
    expect(data.headline).toBe("De Org-mode a Trilium Notes")
  })

  it("names the identity once the canonical is absolute", () => {
    const data = ld(FULL)
    expect(data.url).toBe("https://kyonax.com/blog/trilium")
    expect(data.mainEntityOfPage["@id"]).toBe("https://kyonax.com/blog/trilium")
  })

  it("carries the fields a blog post is judged on", () => {
    const data = ld(FULL)
    expect(data["@type"]).toBe("BlogPosting")
    expect(data.dateModified).toBe("2026-08-25")
    expect(data.articleSection).toBe("Software")
    expect(data.inLanguage).toBe("es")
    expect(data.publisher).toEqual({ "@type": "Organization", name: "kyonax.com" })
    expect(data.author.name).toBe("Cristian D. Moreno")
  })

  it("emits a BreadcrumbList only when every crumb resolves", () => {
    const trail = (crumbs: Array<{ name: string; url: string | null }>) =>
      ld(FULL, {
        relations: { slug: "s", url: "/s", breadcrumb: crumbs, series: null, related: [], prev: null, next: null },
      })

    // A category crumb with no route: the trail travels in relations.json instead.
    const partial = trail([
      { name: "Home", url: "https://kyonax.com/" },
      { name: "Software", url: null },
      { name: "Post", url: "https://kyonax.com/post" },
    ])
    expect(JSON.stringify(partial)).not.toContain("BreadcrumbList")

    // Relative URLs are equally unusable as an @id.
    const relative = trail([
      { name: "Home", url: "/" },
      { name: "Post", url: "/post" },
    ])
    expect(JSON.stringify(relative)).not.toContain("BreadcrumbList")

    const complete = trail([
      { name: "Home", url: "https://kyonax.com/" },
      { name: "Post", url: "https://kyonax.com/post" },
    ])
    const node = complete["@graph"].find((n: any) => n["@type"] === "BreadcrumbList")
    expect(node.itemListElement).toHaveLength(2)
    expect(node.itemListElement[0]).toMatchObject({ position: 1, item: "https://kyonax.com/" })
  })

  it("says a series post is part of its series", () => {
    const data = ld(FULL, {
      relations: {
        slug: "s", url: "/s", breadcrumb: [], related: [], prev: null, next: null,
        series: { name: "Trilium Notes", position: 2, total: 7, items: [] },
      },
    })
    expect(data.isPartOf).toEqual({
      "@type": "CreativeWorkSeries",
      name: "Trilium Notes",
      numberOfItems: 7,
      position: 2,
    })
  })
})

describe("JSON-LD configuration blocks", () => {
  const WITH_BLOCKS = `#+TITLE: T
#+DESCRIPTION: D

#+BEGIN_JSONLD
{ "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "Why?" }] }
#+END_JSONLD

#+BEGIN_JSONLD
{ "timeRequired": "PT12M" }
#+END_JSONLD

Body.
`

  it("never renders a configuration block into the body", async () => {
    const { html } = await renderToHtml(parse(WITH_BLOCKS), { codeHighlight: false })
    expect(html).not.toContain("FAQPage")
    expect(html).not.toContain("timeRequired")
    expect(html).toContain("Body.")
  })

  it("a typed block becomes its own node in the graph", () => {
    const data = ld(WITH_BLOCKS)
    expect(data["@graph"]).toHaveLength(2)
    expect(data["@graph"][1]["@type"]).toBe("FAQPage")
    // @context is declared ONCE, at the top.
    expect(data["@graph"][1]["@context"]).toBeUndefined()
  })

  it("an untyped block adds fields to the article node", () => {
    const data = ld(WITH_BLOCKS)
    expect(data["@graph"][0].timeRequired).toBe("PT12M")
  })

  it("ignores malformed JSON, keeps the computed node, and says so", () => {
    const warnings: string[] = []
    const ast = parse("#+TITLE: T\n\n#+BEGIN_JSONLD\n{ oops }\n#+END_JSONLD\n\nBody.\n")
    const data = JSON.parse(buildJsonLd(ast.metadata, resolveSeo(ast.metadata), (m) => warnings.push(m)))
    expect(data.headline).toBe("T")
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("not valid JSON")
  })

  it("accepts an array of entities in one block", () => {
    const data = ld(`#+TITLE: T

#+BEGIN_JSONLD
[{ "@type": "HowTo", "name": "A" }, { "@type": "VideoObject", "name": "B" }]
#+END_JSONLD

Body.
`)
    const types = data["@graph"].map((n: any) => n["@type"])
    expect(types).toEqual(["BlogPosting", "HowTo", "VideoObject"])
  })
})

describe("one head, two outputs", () => {
  it("puts rel=prev / rel=next in the VUE head too, not only the static one", async () => {
    const { generateSeoMetadata } = await import("../src/cli/vue-generator.js")
    const ast = parse(FULL)
    ast.metadata.relations = {
      slug: "s", url: "/s", breadcrumb: [], series: null, related: [],
      prev: { title: "Older", url: "/older" },
      next: { title: "Newer", url: "/newer" },
    }
    const literal = generateSeoMetadata(ast.metadata)
    expect(literal).toContain('"rel": "prev"')
    expect(literal).toContain('"href": "/older"')
    expect(literal).toContain('"rel": "next"')
    expect(literal).toContain('"href": "/newer"')
  })

  /*
   * The JSON-LD used to ride the Vue head under the key `children`, which @unhead v2 does
   * not know — so it rendered as an ATTRIBUTE and the script element shipped EMPTY. Every
   * assertion in the suite still passed, because they all asked whether the string
   * "application/ld+json" appeared somewhere. It did. It named a tag with nothing in it.
   *
   * So this test asks the only question that distinguishes the two: is the payload the
   * script's BODY, and does it parse?
   */
  it("puts the JSON-LD in the script BODY, not in an attribute", async () => {
    const { generateSeoMetadata } = await import("../src/cli/vue-generator.js")
    const meta = JSON.parse(generateSeoMetadata(parse(FULL).metadata))
    const [block] = meta.script

    expect(block.type).toBe("application/ld+json")
    expect(block.children).toBeUndefined()
    expect(typeof block.innerHTML).toBe("string")

    // Parseable, and actually about this document.
    const data = JSON.parse(block.innerHTML)
    expect(data["@context"]).toBe("https://schema.org")
    expect(data.headline).toBe("De Org-mode a Trilium Notes")
  })

  it("names the SITE in the VUE head's og:site_name too, and omits it when unnamed", async () => {
    const { generateSeoMetadata } = await import("../src/cli/vue-generator.js")
    const named = JSON.parse(generateSeoMetadata(parse(FULL).metadata))
    const siteNameTag = named.meta.find((m: any) => m.property === "og:site_name")
    expect(siteNameTag?.content).toBe("kyonax.com")
    // The article title is what it used to carry; that is the regression.
    expect(siteNameTag?.content).not.toBe("De Org-mode a Trilium Notes")

    // No #+SITE_NAME: the static template guards with {{#if siteName}}, so this must too —
    // an empty og:site_name is a claim about the site, not the absence of one.
    const anon = JSON.parse(generateSeoMetadata(parse("#+TITLE: Lonely\n\nBody.\n").metadata))
    expect(anon.meta.some((m: any) => m.property === "og:site_name")).toBe(false)
  })
})

describe("absolute-URL helpers", () => {
  it("joins a base and a path, and leaves an absolute path alone", () => {
    expect(absoluteUrl("https://kyonax.com/", "/blog/x")).toBe("https://kyonax.com/blog/x")
    expect(absoluteUrl("https://kyonax.com", "blog/x")).toBe("https://kyonax.com/blog/x")
    expect(absoluteUrl("https://kyonax.com", "https://other.com/x")).toBe("https://other.com/x")
    // No base is the signal a caller needs, not an excuse to invent one.
    expect(absoluteUrl(undefined, "/blog/x")).toBe("")
  })

  it("knows what a crawler can resolve", () => {
    expect(isAbsoluteUrl("https://kyonax.com/x")).toBe(true)
    expect(isAbsoluteUrl("/x")).toBe(false)
    expect(isAbsoluteUrl(undefined)).toBe(false)
  })
})

// ── The corpus features (P-02 … P-06) ────────────────────────────────────────────────
const CORPUS: CorpusEntry[] = [
  { url: "/a", slug: "a", title: "Part one", date: "2026-03-02", series: "Trilium", seriesIndex: 1, categories: ["Software"], tags: ["trilium", "orgmode"], keywords: ["notes"] },
  { url: "/b", slug: "b", title: "Part two", date: "2026-03-09", series: "Trilium", seriesIndex: 2, categories: ["Software"], tags: ["trilium"], keywords: [] },
  { url: "/c", slug: "c", title: "Part three", date: "2026-03-16", series: "Trilium", seriesIndex: 3, categories: ["Software"], tags: ["trilium"], keywords: [] },
  { url: "/gnome", slug: "gnome", title: "GNOME over KDE", date: "2026-02-20", categories: ["Software"], tags: ["linux"], keywords: [] },
  { url: "/emacs", slug: "emacs", title: "Emacs config", date: "2026-01-10", categories: ["Software"], tags: ["orgmode"], keywords: ["notes"] },
]

describe("P-03 — the series block", () => {
  it("orders by index, marks the current post and counts the whole set", () => {
    const r = computeRelations(CORPUS[1], CORPUS)
    expect(r.series?.name).toBe("Trilium")
    expect(r.series?.position).toBe(2)
    expect(r.series?.total).toBe(3)
    expect(r.series?.items.map((i) => i.title)).toEqual(["Part one", "Part two", "Part three"])
    expect(r.series?.items.filter((i) => i.current)).toHaveLength(1)
  })

  it("leaves a post outside any series with no block", () => {
    expect(computeRelations(CORPUS[3], CORPUS).series).toBeNull()
  })
})

describe("P-04 — related reading", () => {
  it("ranks by shared tags first, and never repeats the series", () => {
    const r = computeRelations(CORPUS[0], CORPUS)
    const urls = r.related.map((x) => x.url)
    expect(urls).not.toContain("/b")
    expect(urls).not.toContain("/c")
    // Emacs shares a tag AND a keyword; GNOME shares only the category.
    expect(urls[0]).toBe("/emacs")
  })

  it("an explicit list replaces the computed one", () => {
    const self = { ...CORPUS[0], related: ["gnome"] }
    const r = computeRelations(self, [...CORPUS.slice(1), self])
    expect(r.related.map((x) => x.url)).toEqual(["/gnome"])
  })

  it("drops an explicit slug that does not resolve rather than inventing a link", () => {
    const self = { ...CORPUS[0], related: ["nope"] }
    expect(computeRelations(self, [...CORPUS.slice(1), self]).related).toEqual([])
  })
})

describe("P-05 — previous and next", () => {
  it("follows the series inside a series", () => {
    const r = computeRelations(CORPUS[1], CORPUS)
    expect(r.prev?.title).toBe("Part one")
    expect(r.next?.title).toBe("Part three")
  })

  it("walks the timeline outside one: previous is older, next is newer", () => {
    const r = computeRelations(CORPUS[3], CORPUS) // GNOME, 2026-02-20
    expect(r.prev?.title).toBe("Emacs config") // 2026-01-10
    expect(r.next?.title).toBe("Part one") // 2026-03-02
  })

  it("stops at the ends of a series instead of wrapping", () => {
    expect(computeRelations(CORPUS[0], CORPUS).prev).toBeNull()
    expect(computeRelations(CORPUS[2], CORPUS).next).toBeNull()
  })

  it("an explicit neighbour overrides both rules", () => {
    const self = { ...CORPUS[1], prevSlug: "gnome" }
    const r = computeRelations(self, [CORPUS[0], self, ...CORPUS.slice(2)])
    expect(r.prev?.url).toBe("/gnome")
  })
})

describe("P-01 — the breadcrumb trail is data", () => {
  it("names the category but leaves its route to the site", () => {
    const r = computeRelations(CORPUS[0], CORPUS, { homeLabel: "Inicio" })
    expect(r.breadcrumb[0]).toEqual({ name: "Inicio", url: "/" })
    expect(r.breadcrumb[1]).toEqual({ name: "Software", url: null })
    expect(r.breadcrumb[2].name).toBe("Part one")
  })

  it("makes the resolvable crumbs absolute when the site base is known", () => {
    const r = computeRelations(CORPUS[0], CORPUS, { baseUrl: "https://kyonax.com" })
    expect(r.breadcrumb[0].url).toBe("https://kyonax.com/")
    expect(r.breadcrumb[2].url).toBe("https://kyonax.com/a")
  })
})

describe("P-02 / P-06 — what the document itself declares", () => {
  it("splits a comma-separated category, keeping the first as the section", async () => {
    const { html, metadata } = await renderToHtml(
      parse("#+TITLE: T\n#+CATEGORY: Software, Productividad\n#+FILETAGS: :orgmode:\n\nBody.\n"),
      { codeHighlight: false },
    )
    expect(metadata.categories).toEqual(["Software", "Productividad"])
    // article:section and schema.org's articleSection are singular by definition.
    expect(metadata.category).toBe("Software")
    expect(html).toContain('<span class="org-category" data-term="Software">')
    expect(html).toContain('<span class="org-taxonomy-group org-taxonomy-group--tags">')
  })

  it("renders a hero video as a facade, before the contents", async () => {
    const { html } = await renderToHtml(
      parse("#+TITLE: T\n#+OPTIONS: toc:t\n#+HERO_VIDEO: /media/x.mp4\n#+HERO_POSTER: /media/x.jpg\n#+HERO_CAPTION: A caption\n\n* One\nBody.\n"),
      { codeHighlight: false },
    )
    expect(html).toContain('class="org-hero"')
    expect(html).toContain('data-embed="video"')
    expect(html).toContain('class="org-embed-poster"')
    expect(html).toContain("A caption")
    expect(html).not.toContain("<video")  // the player arrives on click, not on load
    expect(html.indexOf("org-hero")).toBeLessThan(html.indexOf("org-toc"))
  })

  /*
   * #+POST_URL is the one absolute URL a document reliably has even when the site has no
   * --base-url, so discussionUrl is publishable where url and mainEntityOfPage are not. It is
   * also the reader's route to verifying somebody else's quoted words, which is why it is
   * held here rather than left to the host.
   */
  it("publishes #+POST_URL as discussionUrl", () => {
    const post = "https://x.com/kyonax_on_tech/status/2094691954227400762"
    expect(ld(`#+TITLE: T\n#+POST_URL: ${post}\n\nBody.\n`).discussionUrl).toBe(post)
  })

  it("publishes no discussionUrl when the document names no post", () => {
    expect(ld("#+TITLE: T\n\nBody.\n")).not.toHaveProperty("discussionUrl")
  })

  it("publishes no discussionUrl for a status URL on another host", () => {
    const bad = "https://evil.example/x.com/u/status/1"
    expect(ld(`#+TITLE: T\n#+POST_URL: ${bad}\n\nBody.\n`)).not.toHaveProperty("discussionUrl")
  })

  it("keeps the hero separate from the social card", async () => {
    const { metadata } = await renderToHtml(
      parse("#+TITLE: T\n#+HERO_IMAGE: /page.jpg\n#+OG_IMAGE: /card.jpg\n\nBody.\n"),
      { codeHighlight: false },
    )
    const seo = resolveSeo(metadata)
    expect(metadata.heroImage).toBe("/page.jpg")
    expect(seo.ogImage).toBe("/card.jpg")
  })
})
