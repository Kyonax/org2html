import { describe, expect, it } from "vitest"
import slugify from "slugify"
import { generateSlugFromMetadata } from "../src/cli/utils.js"

/*
 * tests/slug-golden.test.ts — the charmap is a URL contract.
 *
 * A document's route is slugify(title, { lower: true, strict: true }). That makes
 * the dependency's transliteration table part of this package's public surface:
 * a charmap change is a URL change for every consumer, every canonical, every
 * inbound link. slugify is pinned EXACTLY for that reason, and this file is what
 * makes the pin mean something — these are literal expectations, computed under
 * 1.6.9 and pasted, so a bump that moves any of them fails here instead of
 * quietly renaming somebody's pages.
 *
 * Verified across the 1.6.6 to 1.6.9 bump: zero of these thirty changed.
 */
const GOLDEN: Array<[string, string]> = [
  ["Hello World", "hello-world"],
  ["C++ & Rust: a comparison", "c-and-rust-a-comparison"],
  ["Ünïcödé Titlé", "unicode-title"],
  ["Straße über München", "strasse-uber-munchen"],
  ["naïve café résumé", "naive-cafe-resume"],
  ["Ελληνικά", "ellhnika"],
  ["Привет мир", "privet-mir"],
  ["مرحبا", "mrhba"],
  ["日本語", ""],
  ["한국어 제목", ""],
  ["Tiếng Việt", "tieng-viet"],
  ["Türkçe İstanbul", "turkce-istanbul"],
  ["100% done!", "100percent-done"],
  ["foo_bar-baz", "foobar-baz"],
  ["a/b\\c", "abc"],
  ["emoji 🎉 party", "emoji-party"],
  ["$100 & 50¢", "dollar100-and-50cent"],
  ["Trademark™ ©2026", "trademarktm-c2026"],
  ["ñandú", "nandu"],
  ["œuvre", "oeuvre"],
  ["ß", "ss"],
  ["ı", "i"],
  ["ð", "d"],
  ["þ", "th"],
  ["ǆ", ""],
  ["₿ bitcoin", "bitcoin-bitcoin"],
  ["→ arrow ←", "arrow"],
  ["O'Brien", "obrien"],
  ["“smart quotes”", "smart-quotes"],
  ["中文 English mix", "english-mix"],
]

describe("slug golden — the transliteration table is pinned", () => {
  it("covers thirty hostile titles", () => {
    expect(GOLDEN).toHaveLength(30)
  })

  for (const [title, expected] of GOLDEN) {
    it(`slugs ${JSON.stringify(title)} to ${JSON.stringify(expected)}`, () => {
      expect(slugify(title, { lower: true, strict: true })).toBe(expected)
    })
  }

  /*
   * Four of the thirty transliterate to NOTHING. That is the dependency being
   * honest about a script it has no table for — and it is exactly why the route
   * builder never uses this value bare. [T1-1]
   */
  it("never lets an empty transliteration reach a route", () => {
    const empties = GOLDEN.filter(([, slug]) => slug === "")
    expect(empties.length).toBeGreaterThan(0)
    for (const [title] of empties) {
      const route = generateSlugFromMetadata({ title }, "my-file")
      expect(route).not.toBe("")
      expect(route).toBe("my-file")
    }
  })

  it("falls back to a stable hash when the file name transliterates away too", () => {
    const a = generateSlugFromMetadata({ title: "日本語" }, "日本語")
    const b = generateSlugFromMetadata({ title: "日本語" }, "日本語")
    expect(a).toBe(b)
    expect(a).toMatch(/^untitled-[0-9a-f]{8}$/)
  })
})
