import { describe, expect, it } from "vitest"
import { parse, renderToHtml, applyTemplate } from "../src/index.js"
import { resolveSeo } from "../src/renderer/seo.js"

/*
 * THE MAIN IMAGE — `#+ATTR_O2H: :main t` marks the one picture that stands for a document.
 *
 * What is actually being defended here is a CHAIN, not a field: the mark has to survive
 * parsing, reach the head as og:image / twitter:image, reach the JSON-LD as `image`, and
 * reach a listing as a card — and it has to be the AUTHOR'S choice at every step rather
 * than "whichever image happened to come first".
 */

const doc = (body: string) => `#+TITLE: Marked\n#+DESCRIPTION: A document with a chosen picture.\n\n${body}\n`

describe("the main image — the mark", () => {
  it("promotes the marked image, not the first one", () => {
    const { metadata } = parse(
      doc(`[[/img/first.png]]\n\n#+ATTR_O2H: :main t\n[[/img/chosen.png]]\n\n[[/img/last.png]]`),
    )
    expect(metadata.mainImage).toBe("/img/chosen.png")
  })

  it("treats a bare :main as affirmative and an explicit negative as off", () => {
    expect(parse(doc(`#+ATTR_O2H: :main\n[[/img/a.png]]`)).metadata.mainImage).toBe("/img/a.png")
    // `no` is not in the affirmative set, so the mark simply does not apply — and the
    // document is then left with NO main image rather than falling through to some image.
    expect(parse(doc(`#+ATTR_O2H: :main no\n[[/img/a.png]]`)).metadata.mainImage).toBeUndefined()
  })

  it("never guesses: an unmarked document has no main image", () => {
    expect(parse(doc(`[[/img/a.png]]\n\n[[/img/b.png]]`)).metadata.mainImage).toBeUndefined()
  })

  it("takes the FIRST mark when a document marks two, so the card cannot depend on scroll order", () => {
    const { metadata } = parse(
      doc(`#+ATTR_O2H: :main t\n[[/img/one.png]]\n\n#+ATTR_O2H: :main t\n[[/img/two.png]]`),
    )
    expect(metadata.mainImage).toBe("/img/one.png")
  })

  it("falls back to the caption for alt text, and prefers a real alt when there is one", () => {
    const captioned = parse(
      doc(`#+ATTR_O2H: :main t\n#+CAPTION: A cross-section of the plate.\n[[/img/a.png]]`),
    )
    expect(captioned.metadata.mainImageAlt).toBe("A cross-section of the plate.")
    const described = parse(doc(`#+ATTR_O2H: :main t\n[[/img/a.png][The plate itself]]`))
    expect(described.metadata.mainImageAlt).toBe("The plate itself")
  })

  it("coexists with #+ATTR_HTML on the same figure — two independent channels", () => {
    const { metadata } = parse(
      doc(`#+ATTR_HTML: :class org-figure--hatch\n#+ATTR_O2H: :main t\n[[/img/a.png]]`),
    )
    expect(metadata.mainImage).toBe("/img/a.png")
  })
})

describe("the main image — where it ends up", () => {
  it("puts a hook on the marked image and on no other", async () => {
    const ast = parse(doc(`[[/img/plain.png]]\n\n#+ATTR_O2H: :main t\n[[/img/chosen.png]]`))
    const { html } = await renderToHtml(ast, { sanitize: false, codeHighlight: false })
    expect(html).toContain('class="org-image org-image--main" src="/img/chosen.png"')
    expect(html).toContain('class="org-image" src="/img/plain.png"')
    expect(html.match(/org-image--main/g)?.length).toBe(1)
  })

  it("reaches og:image, twitter:image and the JSON-LD image", async () => {
    const ast = parse(doc(`#+ATTR_O2H: :main t\n[[/img/chosen.png]]`))
    const { html, metadata } = await renderToHtml(ast, { sanitize: false, codeHighlight: false })
    const page = await applyTemplate(html, metadata)
    expect(page).toContain('<meta property="og:image" content="/img/chosen.png">')
    expect(page).toContain('<meta name="twitter:image" content="/img/chosen.png">')
    expect(page).toContain('"image":"/img/chosen.png"')
  })

  it("ranks an explicit keyword above the mark", () => {
    const withCover = resolveSeo({ title: "T", coverImage: "/img/cover.png", mainImage: "/img/mark.png" })
    expect(withCover.ogImage).toBe("/img/cover.png")
    const withOg = resolveSeo({ title: "T", ogImage: "/img/og.png", mainImage: "/img/mark.png" })
    expect(withOg.ogImage).toBe("/img/og.png")
    // ...and with neither keyword, the mark IS the answer.
    expect(resolveSeo({ title: "T", mainImage: "/img/mark.png" }).ogImage).toBe("/img/mark.png")
  })

  it("gives a LISTING the cover before a share-cropped card, and both end at the mark", () => {
    expect(resolveSeo({ title: "T", ogImage: "/og.png", coverImage: "/cover.png" }).cardImage).toBe("/cover.png")
    expect(resolveSeo({ title: "T", ogImage: "/og.png", mainImage: "/mark.png" }).cardImage).toBe("/mark.png")
    expect(resolveSeo({ title: "T", mainImage: "/mark.png" }).cardImage).toBe("/mark.png")
  })
})

describe("the main image — what a crawler can actually fetch", () => {
  it("makes the social image ABSOLUTE against an absolute canonical", () => {
    const f = resolveSeo({
      title: "T",
      mainImage: "/img/chosen.png",
      canonical: "https://example.com/posts/marked",
    })
    expect(f.ogImage).toBe("https://example.com/img/chosen.png")
    expect(f.twitterImage).toBe("https://example.com/img/chosen.png")
    // The CARD is rendered by the site itself, so it stays relative and stays portable.
    expect(f.cardImage).toBe("/img/chosen.png")
  })

  it("leaves it relative when the build was given no base URL", () => {
    const f = resolveSeo({ title: "T", mainImage: "/img/chosen.png", canonical: "/posts/marked" })
    expect(f.ogImage).toBe("/img/chosen.png")
  })

  it("REFUSES a data: URI as the social image, because no crawler can fetch one", () => {
    const inline = "data:image/svg+xml;base64,PHN2Zy8+"
    const f = resolveSeo({ title: "T", mainImage: inline, canonical: "https://example.com/p" })
    expect(f.ogImage).toBe("")
    expect(f.twitterImage).toBe("")
    // The card renders in the site's own page, so an inline picture is still usable there.
    expect(f.cardImage).toBe(inline)
  })

  it("leaves an already-absolute image alone", () => {
    const f = resolveSeo({
      title: "T",
      ogImage: "https://cdn.example.net/card.png",
      canonical: "https://example.com/p",
    })
    expect(f.ogImage).toBe("https://cdn.example.net/card.png")
  })

  it("uses the mark's own alt for the slot that shows the mark, and the description otherwise", () => {
    const marked = resolveSeo({
      title: "T",
      description: "The page description.",
      mainImage: "/m.png",
      mainImageAlt: "A cross-section of the plate.",
    })
    expect(marked.ogImageAlt).toBe("A cross-section of the plate.")
    expect(marked.cardImageAlt).toBe("A cross-section of the plate.")
    // The mark's alt describes the MARK. When a cover wins the slot it must not be reused.
    const covered = resolveSeo({
      title: "T",
      description: "The page description.",
      coverImage: "/c.png",
      mainImage: "/m.png",
      mainImageAlt: "A cross-section of the plate.",
    })
    expect(covered.ogImageAlt).toBe("The page description.")
  })
})
