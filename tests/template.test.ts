import { describe, expect, it } from "vitest"
import { applyTemplate } from "../src/index.js"

describe("template", () => {
  it("emits an SEO head with title, Open Graph and JSON-LD", async () => {
    const html = await applyTemplate("<p>body</p>", { title: "My Post", description: "desc" })
    expect(html).toContain("<title>My Post</title>")
    expect(html).toContain("og:title")
    expect(html).toContain("application/ld+json")
    expect(html).toContain("<p>body</p>")
  })

  it("defaults theme-color to the book accent and fetches no third-party font", async () => {
    const html = await applyTemplate("<p>x</p>", { title: "T" })
    // The default book is kyo-web-online; its accent is the brand yellow.
    expect(html).toContain('<meta name="theme-color" content="#f9cd26">')
    // Fonts are SELF-HOSTED when they exist at all, so nothing is ever fetched from a
    // third party — that half of the old assertion is unchanged and still matters.
    expect(html).not.toContain("fonts.googleapis.com")
    expect(html).toContain("favicon.svg")
  })

  /*
   * A DELIBERATE SEMANTIC REVERSAL, NOT A RUBBER-STAMPED SNAPSHOT UPDATE.
   *
   * This block used to assert `href="/fonts/GeomanistRegular.woff2"` was ALWAYS present.
   * That assertion was passing while encoding the defect: org2html does not redistribute
   * Geomanist or the Nerd-patched Space Mono ([#41]), so the published tarball ships ZERO
   * .woff2 — and the template preloaded two of them unconditionally anyway. Every page of
   * every real install therefore emitted two preload 404s, silently, and this test called
   * that correct.
   *
   * The contract now is CONDITIONAL, so both directions have to be proven.
   */
  it("preloads NOTHING, and drops the dead @font-face, when no font was copied", async () => {
    const html = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      // `[]` is a BUILD saying "none landed" — distinct from `undefined`, which is a direct
      // library call that cannot know and must not have its own fonts stripped.
      copiedFonts: [],
    })
    expect(html).not.toContain('rel="preload"')
    // Dropping the preload alone was not enough: a browser fetches an @font-face the moment
    // a glyph needs it, so four rules naming files that were never emitted is the same 404
    // count as before, just later and harder to see. Asserted on REFERENCES rather than on
    // the string ".woff2", which also appears in the template's own explanatory comment.
    expect(html).not.toContain("@font-face")
    expect(html).not.toMatch(/url\(['"]?\/fonts\//)
    // The token layer's system fallback is what should paint instead.
    expect(html).toContain("font-family")
  })

  it("leaves the stylesheet alone when the caller cannot say which fonts exist", async () => {
    // A direct applyTemplate() call is a library consumer with their own template dir and
    // their own fonts. Guessing here would silently strip webfonts that do work.
    const html = await applyTemplate("<p>x</p>", { title: "T" })
    expect(html).toContain("@font-face")
    expect(html).toMatch(/url\(['"]?\/fonts\//)
    // Still no preload, because nothing has told the engine a face is actually there.
    expect(html).not.toContain('rel="preload"')
  })

  it("preloads exactly the faces that were copied AND the book asked for", async () => {
    const html = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      copiedFonts: ["Body.woff2", "BodyBold.woff2"],
      preloadFonts: ["Body.woff2", "NeverShipped.woff2"],
    })
    // Asked for and present.
    expect(html).toContain('href="/fonts/Body.woff2"')
    expect(html).toContain('as="font" type="font/woff2" crossorigin')
    // Present but NOT asked for: preloading every weight fetches the bold before
    // anything needs it, which costs the render the preload exists to protect.
    expect(html).not.toContain("BodyBold.woff2")
    // ASKED FOR BUT ABSENT — the whole point. A book may name a face it does not ship,
    // and the answer is silence, never a 404.
    expect(html).not.toContain("NeverShipped.woff2")
  })

  it("prefixes every asset reference under --asset-base, and defaults to no-op", async () => {
    const plain = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      copiedFonts: ["Body.woff2"],
      preloadFonts: ["Body.woff2"],
      linkDefaultStyles: true,
    })
    expect(plain).toContain('href="/styles.css"')
    expect(plain).toContain('src="/o2h.js"')
    expect(plain).toContain('href="/favicon.svg"')
    expect(plain).toContain('href="/fonts/Body.woff2"')

    const based = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      copiedFonts: ["Body.woff2"],
      preloadFonts: ["Body.woff2"],
      linkDefaultStyles: true,
      assetBase: "/my-project",
    })
    // Every root-absolute reference moves together, or a sub-path deploy 404s on the ones
    // that did not ([#45]).
    expect(based).toContain('href="/my-project/styles.css"')
    expect(based).toContain('src="/my-project/o2h.js"')
    expect(based).toContain('href="/my-project/favicon.svg"')
    expect(based).toContain('href="/my-project/manifest.json"')
    expect(based).toContain('href="/my-project/fonts/Body.woff2"')
  })

  it("suppresses optional metas via {{#if}} when the value is absent", async () => {
    const html = await applyTemplate("<p>x</p>", { title: "T" })
    // No canonical / keywords / author → those elements are omitted, not empty.
    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('name="keywords"')
    expect(html).not.toContain("{{") // no unresolved placeholders leak
  })

  it("wires computed OG/Twitter vars and uses the ISO date for article:published_time", async () => {
    const html = await applyTemplate("<p>x</p>", {
      title: "T",
      description: "D",
      ogTitle: "OG T",
      ogType: "article",
      date: "May 21, 2026",
      dateIso: "2026-05-21",
      twitterSite: "@kyo",
      robots: "noindex",
    })
    expect(html).toContain('<meta property="og:title" content="OG T">')
    expect(html).toContain('<meta property="article:published_time" content="2026-05-21">')
    expect(html).toContain('<meta name="twitter:site" content="@kyo">')
    expect(html).toContain('<meta name="robots" content="noindex">')
  })

  it("drops the article:* block when og:type is not an article", async () => {
    const html = await applyTemplate("<p>x</p>", { title: "T", ogType: "website", date: "2026-01-01" })
    expect(html).toContain('<meta property="og:type" content="website">')
    expect(html).not.toContain("article:published_time")
  })

  it("injects #+HTML_HEAD raw and merges an override-able JSON-LD @type", async () => {
    const html = await applyTemplate("<p>x</p>", {
      title: "T",
      htmlHead: ['<link rel="preload" href="/x.js" as="script">'],
      schemaType: "TechArticle",
    })
    expect(html).toContain('<link rel="preload" href="/x.js" as="script">')
    expect(html).toContain('"@type":"TechArticle"')
  })

  it("HTML-escapes {{language}} and other interpolated values", async () => {
    const html = await applyTemplate("<p>x</p>", { title: "T", language: 'en"><script>' })
    expect(html).not.toContain('lang="en"><script>')
    expect(html).toContain("&lt;script&gt;")
  })

  it("inlines the O2H token authority + the .org-root-scoped default styles ([D-16])", async () => {
    const html = await applyTemplate("<p>x</p>", { title: "T" })
    // o2h-tokens.css (single token authority) is concatenated ahead of styles.css…
    expect(html).toContain("--o2h-signal-500")
    // …and styles.css only consumes them, scoped under .org-root.
    expect(html).toContain(".org-root")
  })
})
