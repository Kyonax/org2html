import { afterAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { buildCommand } from "../src/cli/commands/build.js"

/*
 * tests/sidecars.test.ts — the sidecars a crawler reads, and the routes they name.
 *
 * ONE HEAD, TWO OUTPUTS. The page's JSON-LD and the sidecar beside it describe
 * the same document, so they may not disagree — and STRUCTURED DATA NEVER
 * PUBLISHES A HALF-ANSWER. Everything here failed that quietly: a raw Org
 * timestamp in four sidecars while the head said ISO, a lastmod that was the
 * wall clock, a route in relations.json that was never written, a robots.txt
 * pointing at a sitemap the engine does not produce, and a manifest shipping a
 * brand colour from a template nobody edited.
 */

const work = mkdtempSync(join(tmpdir(), "o2h-sidecars-"))
afterAll(() => rmSync(work, { recursive: true, force: true }))
vi.spyOn(console, "log").mockImplementation(() => {})

const build = (input: string, out: string, extra: Record<string, unknown> = {}) =>
  buildCommand(input, { output: out, highlight: false, quiet: true, ...extra })

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf-8"))

describe("T1-5 — the untitled document's route", () => {
  it("gives an untitled document a relations sidecar and a route its neighbours can reach", async () => {
    const inDir = join(work, "untitled-in")
    const out = join(work, "untitled-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "first.org"), "#+TITLE: First\n#+DATE: 2026-01-01\n#+TAGS: x\n\na\n")
    // No #+TITLE at all: the pre-pass slugged this "untitled" while the render
    // pass slugged it from the file name, so the two disagreed about the route.
    writeFileSync(join(inDir, "my-second-post.org"), "#+DATE: 2026-01-02\n#+TAGS: x\n\nb\n")
    writeFileSync(join(inDir, "third.org"), "#+TITLE: Third\n#+DATE: 2026-01-03\n#+TAGS: x\n\nc\n")

    await build(inDir, out)

    const dir = join(out, "2026-01-02-my-second-post")
    expect(existsSync(join(dir, "index.html"))).toBe(true)
    expect(existsSync(join(dir, "relations.json"))).toBe(true)

    // Every url any relations sidecar names must be a url the sitemap lists.
    const sitemap = readJson(join(out, "sitemap.json")) as { url: string }[]
    const known = new Set(sitemap.map((e) => e.url))
    for (const slug of ["2026-01-01-first", "2026-01-02-my-second-post", "2026-01-03-third"]) {
      const rel = readJson(join(out, slug, "relations.json"))
      const urls: string[] = []
      const collect = (v: unknown) => {
        if (!v) return
        if (Array.isArray(v)) v.forEach(collect)
        else if (typeof v === "object") {
          const o = v as Record<string, unknown>
          if (typeof o.url === "string") urls.push(o.url)
          Object.values(o).forEach(collect)
        }
      }
      collect(rel)
      // "/" is the home link the relations block always carries — the site root,
      // not a page, so it is legitimately absent from the sitemap.
      for (const u of urls.filter((x) => x !== "/")) {
        expect(known, `${slug} points at ${u}`).toContain(u)
      }
    }
  })

  /*
   * The stem fallback alone is not enough. titleFromFilename STRIPS a date or
   * ordering prefix ("2026-08-21-my-post" reads as "My post"), so the render
   * pass slugs "my-post" while a pre-pass slugging the bare stem produces
   * "2026-08-21-my-post". The two passes must run the same filename through the
   * same function, not merely both have a fallback.
   */
  it("agrees on the route when the file name carries a date prefix", async () => {
    const inDir = join(work, "prefixed-in")
    const out = join(work, "prefixed-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "2026-08-21-my-post.org"), "#+TAGS: y\n\nbody\n")
    writeFileSync(join(inDir, "other.org"), "#+TITLE: Other\n#+TAGS: y\n\nbody\n")
    await build(inDir, out)

    const sitemap = readJson(join(out, "sitemap.json")) as { url: string }[]
    for (const entry of sitemap) {
      const route = entry.url.replace(/^\//, "")
      expect(existsSync(join(out, route, "index.html")), `${entry.url} was written`).toBe(true)
      expect(existsSync(join(out, route, "relations.json")), `${entry.url} has relations`).toBe(true)
    }
  })

  /*
   * T3-12 was a HYPOTHESIS: a #+TITLE that comes from a #+SETUPFILE macro is not
   * expanded by the header-only pre-pass, so the two passes could disagree the
   * same way. Reproduce it here rather than assume it.
   */
  it("agrees on the route for a macro-driven title", async () => {
    const inDir = join(work, "macro-title-in")
    const out = join(work, "macro-title-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "setup.org"), "#+MACRO: sitename Kyonax Journal\n")
    writeFileSync(
      join(inDir, "post.org"),
      '#+SETUPFILE: setup.org\n#+TITLE: {{{sitename}}} Weekly\n#+DATE: 2026-02-01\n\nbody\n',
    )
    // Build the FILE, not the directory: setup.org lives beside it and would
    // otherwise be globbed in as a document of its own.
    await build(join(inDir, "post.org"), out)

    const sitemap = readJson(join(out, "sitemap.json")) as { url: string }[]
    expect(sitemap).toHaveLength(1)
    const route = sitemap[0].url.replace(/^\//, "")
    // Whatever the route is, the page must actually be at it.
    expect(existsSync(join(out, route, "index.html"))).toBe(true)
    expect(existsSync(join(out, route, "relations.json"))).toBe(true)
  })
})

describe("T1-6 — robots.txt", () => {
  it("ships no unsubstituted placeholder and names no sitemap the engine never writes", async () => {
    const src = join(work, "r.org")
    writeFileSync(src, "#+TITLE: R\n#+DATE: 2026-03-01\n\nx\n")
    const out = join(work, "robots-out")
    await build(src, out)

    const robots = readFileSync(join(out, "robots.txt"), "utf-8")
    expect(robots).not.toContain("{{")
    expect(robots).not.toContain("sitemap.xml")
    expect(robots).toContain("User-agent: *")
    expect(existsSync(join(out, "sitemap.xml"))).toBe(false)
  })
})

describe("T1-9 / T1-10 — the sidecars carry ISO dates, or no date at all", () => {
  const ORG_TS = "#+TITLE: Stamped\n#+DATE: <2026-03-01 Sun>\n\nbody\n"

  it("never leaks a raw Org timestamp into a sidecar a crawler reads", async () => {
    const inDir = join(work, "ts-in")
    const out = join(work, "ts-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "stamped.org"), ORG_TS)
    await build(inDir, out)

    const slug = (readJson(join(out, "sitemap.json")) as { url: string }[])[0].url.replace(/^\//, "")
    const og = readJson(join(out, slug, "og-metadata.json"))
    const sd = readJson(join(out, slug, "structured-data.json"))
    const sitemap = readJson(join(out, "sitemap.json"))
    const feed = readJson(join(out, "feed.json"))

    expect(og.publishedTime).toBe("2026-03-01")
    expect(sd.datePublished).toBe("2026-03-01")
    expect(sitemap[0].lastmod).toBe("2026-03-01")
    expect(feed[0].pubDate ?? feed.items?.[0]?.pubDate).toBe("2026-03-01")

    // …and the head agrees, which is the whole point.
    const html = readFileSync(join(out, slug, "index.html"), "utf-8")
    expect(html).toContain('"datePublished":"2026-03-01"')
    // Every MACHINE-readable surface is ISO. The visible byline is allowed to
    // read exactly as the author wrote it — that is what <time datetime> is
    // for, and the datetime attribute is the machine's copy.
    expect(html).toMatch(/<time[^>]*datetime="2026-03-01"/)
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? ""
    expect(jsonLd).not.toContain("Sun")
  })

  it("omits lastmod for an undated document rather than stamping the wall clock", async () => {
    const inDir = join(work, "undated-in")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "undated.org"), "#+TITLE: Undated\n\nbody\n")

    const a = join(work, "undated-a")
    const b = join(work, "undated-b")
    await build(inDir, a)
    await build(inDir, b)

    const sm = readJson(join(a, "sitemap.json"))
    expect(sm[0].lastmod).toBeUndefined()
    // Two builds of an undated corpus are byte-identical, whatever day it is.
    expect(readFileSync(join(a, "sitemap.json"), "utf-8")).toBe(
      readFileSync(join(b, "sitemap.json"), "utf-8"),
    )
  })

  it("still carries a plain ISO date through untouched", async () => {
    const inDir = join(work, "iso-in")
    const out = join(work, "iso-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "iso.org"), "#+TITLE: Iso\n#+DATE: 2026-07-01\n\nbody\n")
    await build(inDir, out)
    const sm = readJson(join(out, "sitemap.json"))
    expect(sm[0].lastmod).toBe("2026-07-01")
  })
})

describe("T2-4 — manifest.json is composed, not copied", () => {
  it("matches the theme colour the page's own head resolves", async () => {
    const src = join(work, "m.org")
    writeFileSync(src, "#+TITLE: M\n#+DATE: 2026-05-01\n\nx\n")
    const out = join(work, "manifest-out")
    await build(src, out)

    const manifest = readJson(join(out, "manifest.json"))
    const slug = (readJson(join(out, "sitemap.json")) as { url: string }[])[0].url.replace(/^\//, "")
    const html = readFileSync(join(out, slug, "index.html"), "utf-8")
    const headColor = html.match(/<meta name="theme-color" content="([^"]+)"/)?.[1]

    expect(headColor).toBeTruthy()
    expect(manifest.theme_color).toBe(headColor)
  })

  it("takes its name from the site the corpus declares", async () => {
    const src = join(work, "named.org")
    writeFileSync(src, "#+TITLE: Named\n#+SITE_NAME: kyonax.com\n#+DATE: 2026-05-02\n\nx\n")
    const out = join(work, "named-out")
    await build(src, out)
    const manifest = readJson(join(out, "manifest.json"))
    expect(manifest.name).toBe("kyonax.com")
    expect(manifest.name).not.toBe("Blog")
  })
})
