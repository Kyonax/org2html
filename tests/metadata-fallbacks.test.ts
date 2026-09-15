import { describe, expect, it } from "vitest"
import { parse } from "../src/index.js"
import { generateSlugFromMetadata, titleFromFilename } from "../src/cli/utils.js"

const isoOf = (dateLine: string) => parse(`#+TITLE: T\n#+DATE: ${dateLine}\n\nBody.\n`).metadata.dateIso

describe("#+DATE normalization beyond en-US", () => {
  it("keeps the existing ISO, Org-timestamp and English forms working", () => {
    expect(isoOf("2026-05-21")).toBe("2026-05-21")
    expect(isoOf("<2026-07-01 Wed>")).toBe("2026-07-01")
    expect(isoOf("[2025-02-19 Wed 00:19]")).toBe("2025-02-19")
    expect(isoOf("May 21, 2026")).toBe("2026-05-21")
  })

  it("normalizes Spanish long-form dates", () => {
    // Both spellings the corpus actually uses: "de 2026" and "del 2026".
    expect(isoOf("13 de mayo de 2026")).toBe("2026-05-13")
    expect(isoOf("12 de Mayo del 2026")).toBe("2026-05-12")
    expect(isoOf("1 de enero de 2027")).toBe("2027-01-01")
    expect(isoOf("30 de septiembre de 2025")).toBe("2025-09-30")
  })

  it("normalizes Portuguese and French long-form dates", () => {
    expect(isoOf("13 de maio de 2026")).toBe("2026-05-13")
    expect(isoOf("3 mars 2026")).toBe("2026-03-03")
  })

  it("leaves an unparseable date unnormalized rather than guessing", () => {
    // An org-capture placeholder must not become a bogus published date.
    expect(isoOf("%<%b %d, %Y>")).toBeUndefined()
    expect(isoOf("sometime soon")).toBeUndefined()
  })

  it("still exposes the raw #+DATE for display", () => {
    const { metadata } = parse(`#+TITLE: T\n#+DATE: 13 de mayo de 2026\n\nBody.\n`)
    expect(metadata.date).toBe("13 de mayo de 2026")
    expect(metadata.dateIso).toBe("2026-05-13")
  })
})

describe("titleFromFilename — the no-#+TITLE fallback", () => {
  it("turns a file name into a readable title", () => {
    expect(titleFromFilename("/n/DEPLOYMENT.org")).toBe("DEPLOYMENT")
    expect(titleFromFilename("/n/release-checklist.org")).toBe("Release checklist")
    expect(titleFromFilename("/n/some_notes.org")).toBe("Some notes")
  })

  it("drops date and ordering prefixes from filing conventions", () => {
    expect(titleFromFilename("/n/2026-08-21-000000-session_org_2_html.org")).toBe("Session org 2 html")
    expect(titleFromFilename("/n/2026-05-21-my-post.org")).toBe("My post")
    expect(titleFromFilename("/n/03-getting-started.org")).toBe("Getting started")
  })

  it("never returns empty, even for a name that is only a prefix", () => {
    // Stripping the prefix would leave nothing, so the whole stem is used.
    expect(titleFromFilename("/n/2026-08-21-.org")).toBe("2026 08 21")
    expect(titleFromFilename("/n/x.org")).toBe("X")
  })

  it("gives two untitled documents DISTINCT slugs", () => {
    // Both would previously slug to "untitled" and the second would be rejected
    // by the output-collision guard.
    const a = generateSlugFromMetadata({ title: titleFromFilename("/n/alpha.org") })
    const b = generateSlugFromMetadata({ title: titleFromFilename("/n/beta.org") })
    expect(a).not.toBe(b)
    expect(a).toContain("alpha")
    expect(b).toContain("beta")
  })
})

describe("default template — no dangling root-relative assets", () => {
  /*
   * THIS USED TO SCAN templates/default.html FOR LITERALS, and passed while the template was
   * wrong. It matched `href="/fonts/GeomanistRegular.woff2"` against the repo's own
   * templates/fonts/ directory — which exists HERE but is excluded from the published tarball
   * ([#41]), so the check confirmed a file the consumer never receives.
   *
   * The template no longer hardcodes those paths at all: the favicon, the manifest and the
   * preload list are slots. So the assertion moves to where the truth is — the RENDERED page,
   * built with an explicit statement of which fonts exist.
   */
  it("emits no reference the build has not written, whatever the font situation", async () => {
    const { applyTemplate } = await import("../src/index.js")

    for (const copiedFonts of [[], ["Body.woff2"]]) {
      const html = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
        copiedFonts,
        preloadFonts: ["Body.woff2"],
        linkDefaultStyles: true,
      })

      // Everything the page points at, from the head and from the composed stylesheet.
      const refs = [
        ...[...html.matchAll(/(?:href|src)="\/([^"]+)"/g)].map((m) => m[1]),
        ...[...html.matchAll(/url\(['"]?\/([^'")]+)['"]?\)/g)].map((m) => m[1]),
      ]

      // These five are written by copyTemplateAssets on every build, unconditionally.
      const alwaysWritten = new Set([
        "favicon.svg",
        "manifest.json",
        "robots.txt",
        "styles.css",
        "o2h.js",
      ])
      const dangling = refs.filter(
        (r) => !alwaysWritten.has(r) && !copiedFonts.includes(r.replace(/^fonts\//, "")),
      )
      expect(dangling, `copiedFonts=${JSON.stringify(copiedFonts)}`).toEqual([])
    }
  })

  it("preloads a copied face and never one that was not copied", async () => {
    const { applyTemplate } = await import("../src/index.js")

    const without = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      copiedFonts: [],
      preloadFonts: ["Body.woff2"],
    })
    expect(without).not.toContain("Body.woff2")

    const with_ = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      copiedFonts: ["Body.woff2"],
      preloadFonts: ["Body.woff2"],
    })
    expect(with_).toContain('href="/fonts/Body.woff2"')
  })
})
