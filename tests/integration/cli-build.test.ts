/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/integration/cli-build.test.ts — the whole build, end to end, over a real corpus.
 *
 * THIS FILE REPLACES THE SHOWCASE GATE. `examples/site/` was a demo Vue application whose
 * `npm run smoke` asserted on a fully prerendered site; it is deleted in the same change that
 * adds this file, so what it used to guarantee has to be guaranteed here or declared lost.
 * Nothing in between: a gate that quietly stops covering something is worse than no gate
 * ([#37]).
 *
 * WHAT IS RECOVERED HERE. Everything that is a property of the ENGINE'S OUTPUT: that every
 * emitted .vue actually COMPILES (the single most valuable thing the showcase proved — the
 * engine writes Vue source and nothing else in the suite ever asked a Vue compiler to read
 * it), that routes.js and feed.json describe the SAME SET of documents, that no macro or Vue
 * interpolation leaks into the emitted markup, that the sidecars agree with each other about
 * the same document, and that every table ships inside its scroll frame.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS GENUINELY LOST, DECLARED RATHER THAN QUIETLY DROPPED ([#43]). Each of these needs a
 * real Vue application and an SSG pass, which this package does not contain and should not.
 *
 *  1. THE @unhead v2 RENDERED HEAD. The engine exports `seoMeta` from each SFC and the
 *     showcase proved that unhead actually rendered it into the prerendered <head>. We still
 *     assert the engine's own standalone HTML head, and that `seoMeta` is present and well
 *     formed in the SFC — but the claim "a Vue host that calls useHead(seoMeta) ends up with
 *     this head" is no longer tested anywhere.
 *  2. THE CATEGORY-ARCHIVE AND BREADCRUMB HOST CONTRACT. [P-01] says the SITE builds the
 *     breadcrumb and its BreadcrumbList, because only the site knows whether a term is a
 *     route. The showcase proved the other end of that contract: /category/<slug> pages exist,
 *     the index links them, and each document's crumb links its archive. We keep the DATA half
 *     (relations.json names the category and the crumb) and lose the proof that a host can
 *     build routes from it.
 *  3. THE AVATAR CSS BOX-MODEL GUARD. "The avatar frame is an outline, never a border" — a
 *     border under border-box sizing shifts the background into the next cell, which is
 *     literally another person's face. That, `background-clip: padding-box`, and the
 *     `--sprite-*` custom properties reaching the served HTML were asserted against the
 *     showcase's own stylesheet and component. The sprite GEOMETRY is still proven in
 *     tests/comments/command.test.ts; the CSS that consumes it is host code and is now
 *     unguarded here.
 *  4. THE PRERENDERED COMMENT THREAD. The showcase proved a thread was IN the served HTML
 *     rather than fetched by the reader — the property the whole comment design exists for.
 *     The engine renders no comment markup at all ([P-00]), so there is nothing in this
 *     package to assert it against.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "fs"
import { tmpdir } from "os"
import { join, relative, sep } from "path"
import { compileScript, compileTemplate, parse as parseSfc } from "@vue/compiler-sfc"

import { buildCommand } from "../../src/cli/commands/build.js"

const CORPUS = join(__dirname, "..", "fixtures", "corpus")
const BASE = "https://example.com"

const work = mkdtempSync(join(tmpdir(), "o2h-integration-"))
const out = join(work, "site")
afterAll(() => rmSync(work, { recursive: true, force: true }))

vi.spyOn(console, "log").mockImplementation(() => {})

/** Every directory under `out` that holds a built document. */
function documentDirs(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const abs = join(dir, entry.name)
      if (existsSync(join(abs, "index.html"))) found.push(abs)
      else walk(abs)
    }
  }
  walk(root)
  return found.sort()
}

const json = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T
const routeOf = (dir: string) => "/" + relative(out, dir).split(sep).join("/")

let docs: string[]

beforeAll(async () => {
  await buildCommand(CORPUS, {
    output: out,
    highlight: true,
    sanitize: true,
    baseUrl: BASE,
    quiet: true,
  })
  docs = documentDirs(out)
}, 120_000)

describe("integration — the build produces a complete site", () => {
  it("emits every document with its full sidecar set", () => {
    expect(docs.length).toBe(3)
    for (const dir of docs) {
      for (const file of [
        "index.html",
        "index.vue",
        "metadata.json",
        "og-metadata.json",
        "relations.json",
        "structured-data.json",
      ]) {
        expect(existsSync(join(dir, file)), `${routeOf(dir)}/${file}`).toBe(true)
      }
    }
  })

  it("emits the corpus-level manifests and the runtime assets", () => {
    for (const file of ["routes.js", "feed.json", "sitemap.json", "styles.css", "o2h.js"]) {
      expect(existsSync(join(out, file)), file).toBe(true)
    }
  })

  it("builds a nested source directory into a nested route", () => {
    /* The engine composes a route as <folder>/<date>-<slug>. Anything keying on the bare slug
     * writes a key no route will ever match — the defect that once broke comment lookup. */
    expect(docs.map(routeOf)).toContain("/notes/2026-07-14-a-note-in-a-folder")
  })
})

describe("integration — every emitted .vue actually compiles", () => {
  /*
   * THE HEADLINE RECOVERY. The engine WRITES VUE SOURCE, and until the showcase existed
   * nothing ever asked a Vue compiler to read it — a malformed template, an unbalanced tag or
   * an unescaped brace produced a file that looked plausible and exploded in a consumer's
   * build. This is the only assertion in the suite that a real Vue toolchain accepts the
   * output, and it is why @vue/compiler-sfc is a devDependency.
   */
  it("parses, compiles the template and compiles the script for each document", () => {
    expect(docs.length).toBeGreaterThan(0)
    for (const dir of docs) {
      const filename = join(dir, "index.vue")
      const source = readFileSync(filename, "utf8")
      const id = routeOf(dir)

      const { descriptor, errors } = parseSfc(source, { filename })
      expect(errors, `${id}: SFC parse errors`).toEqual([])
      expect(descriptor.template, `${id}: has a <template>`).toBeTruthy()

      const template = compileTemplate({
        source: descriptor.template!.content,
        filename,
        id,
      })
      expect(template.errors, `${id}: template compile errors`).toEqual([])
      /* A compiled render function, not an empty shell. */
      expect(template.code.length, `${id}: emitted a render function`).toBeGreaterThan(0)

      expect(
        () => compileScript(descriptor, { id }),
        `${id}: <script> compile`,
      ).not.toThrow()
    }
  })

  it("exports the SEO surface the host is expected to consume", () => {
    for (const dir of docs) {
      const sfc = readFileSync(join(dir, "index.vue"), "utf8")
      /* ONE HEAD, TWO OUTPUTS: the .vue head and the HTML head both come from resolveSeo().
       * The RENDERED result of useHead(seoMeta) is item 1 of the declared-lost list above. */
      expect(sfc, routeOf(dir)).toContain("export const seoMeta")
      expect(sfc, routeOf(dir)).toContain("export const metadata")
      expect(sfc, routeOf(dir)).toContain("useHead(seoMeta)")
    }
  })

  it("leaks no unexpanded macro and no literal Vue interpolation", () => {
    for (const dir of docs) {
      for (const file of ["index.html", "index.vue"]) {
        const body = readFileSync(join(dir, file), "utf8")
        expect(body, `${routeOf(dir)}/${file}: unexpanded {{{macro}}}`).not.toContain("{{{")
        /* A literal {{ x }} surviving into the template is worse than cosmetic: Vue would
         * EVALUATE it against the component scope and render nothing, or throw. */
        expect(
          /\{\{\s*\w+\s*\}\}/.test(body),
          `${routeOf(dir)}/${file}: leaked Vue interpolation`,
        ).toBe(false)
      }
    }
  })
})

describe("integration — the manifests agree with the documents", () => {
  it("routes.js and feed.json describe the SAME SET, not merely the same count", () => {
    const routesSrc = readFileSync(join(out, "routes.js"), "utf8")
    const routes = [...routesSrc.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1])
    const feed = json<Array<{ link: string }>>(join(out, "feed.json")).map((e) => e.link)
    const built = docs.map(routeOf)

    /* Comparing LENGTHS would pass while two manifests disagreed about which documents they
     * held — a swap is exactly the shape of bug a count cannot see. */
    expect(new Set(routes)).toEqual(new Set(built))
    expect(new Set(feed)).toEqual(new Set(built))
  })

  it("points every declared route at an index.vue that exists", () => {
    const routesSrc = readFileSync(join(out, "routes.js"), "utf8")
    const imports = [...routesSrc.matchAll(/import\('\.\/([^']+)'\)/g)].map((m) => m[1])
    expect(imports.length).toBe(docs.length)
    for (const rel of imports) {
      expect(existsSync(join(out, rel)), `routes.js imports ${rel}`).toBe(true)
    }
  })

  it("lists every document in the sitemap, keyed by the same route", () => {
    const sitemap = json<Array<{ url: string; lastmod?: string }>>(join(out, "sitemap.json"))
    /* sitemap.json is a DATA sidecar, not a published document: the routes stay SITE-RELATIVE
     * exactly like relations.json, and the host composes sitemap.xml because it is the thing
     * that knows its own origin ([P-00]). The absoluteness law applies to identities the
     * ENGINE publishes — the canonical and the JSON-LD @id — which the next test checks. */
    expect(new Set(sitemap.map((e) => e.url))).toEqual(new Set(docs.map(routeOf)))
    /* A truthiness check here USED to lock the defect it looked like it guarded:
     * an undated document got `new Date()` as its lastmod, so the assertion passed
     * on a value that changed with the calendar. What matters is that a lastmod,
     * when present, is a real ISO date — and that an undated document has none
     * rather than a wall-clock stamp. */
    for (const entry of sitemap) {
      if (entry.lastmod === undefined) continue
      expect(entry.lastmod, `${entry.url}: lastmod is an ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    const dated = sitemap.filter((e) => e.lastmod !== undefined)
    expect(dated.length, "the dated fixtures carry a lastmod").toBeGreaterThan(0)
  })

  it("publishes an ABSOLUTE canonical and JSON-LD @id, because those are identities", () => {
    for (const dir of docs) {
      const html = readFileSync(join(dir, "index.html"), "utf8")
      const canonical = html.match(/rel="canonical"[^>]*href="([^"]+)"/)?.[1]
      expect(canonical, `${routeOf(dir)}: has a canonical`).toBeTruthy()
      /* Given --base-url the canonical MUST be absolute; without one the engine declines to
       * name a url at all rather than publishing a half-answer a crawler cannot resolve. */
      expect(canonical!.startsWith(BASE), `${routeOf(dir)}: canonical ${canonical}`).toBe(true)

      const og = json<{ url?: string; canonical?: string }>(join(dir, "og-metadata.json"))
      expect(og.canonical).toBe(canonical)
    }
  })
})

describe("integration — the sidecars agree about the same document", () => {
  it("names the same main image in feed.json, og-metadata.json and structured-data.json", () => {
    const feed = json<Array<{ link: string; image?: string }>>(join(out, "feed.json"))
    const marked = feed.filter((e) => e.image)
    /* The corpus marks exactly one picture with `#+ATTR_O2H: :main t`. If this is zero the
     * chain is broken upstream and every assertion below would vacuously pass. */
    expect(marked.length).toBeGreaterThan(0)

    for (const entry of marked) {
      const dir = docs.find((d) => routeOf(d) === entry.link)!
      const og = json<{ image?: string }>(join(dir, "og-metadata.json"))
      expect(og.image, `${entry.link}: og-metadata names an image`).toBeTruthy()
      /* og is absolutised by --base-url while the feed stays site-relative, so they agree on
       * the FILE rather than the string. Two sidecars naming different pictures for one
       * document is how a share card and a listing drift apart. */
      expect(og.image!.endsWith(entry.image!), `${entry.link}: ${og.image} vs ${entry.image}`).toBe(
        true,
      )
    }
  })

  it("keeps metadata.json, og-metadata.json and the HTML head on one title", () => {
    for (const dir of docs) {
      const meta = json<{ title?: string }>(join(dir, "metadata.json"))
      const og = json<{ title?: string }>(join(dir, "og-metadata.json"))
      const html = readFileSync(join(dir, "index.html"), "utf8")
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1]

      expect(meta.title, routeOf(dir)).toBeTruthy()
      expect(og.title).toBe(meta.title)
      expect(title).toContain(meta.title!)
    }
  })

  it("carries the category DATA a host needs to build an archive route", () => {
    /* [P-01]: the SITE builds the breadcrumb and its BreadcrumbList, because only the site
     * knows whether a term is a route. This asserts the engine's half of that contract — the
     * host half is item 2 of the declared-lost list. */
    for (const dir of docs) {
      const rel = json<{ url?: string; breadcrumb?: Array<{ name: string; url: string | null }> }>(
        join(dir, "relations.json"),
      )
      expect(rel.url, `${routeOf(dir)}: relations names the route`).toBe(routeOf(dir))
      expect(Array.isArray(rel.breadcrumb), `${routeOf(dir)}: has a breadcrumb`).toBe(true)
      expect(rel.breadcrumb!.length).toBeGreaterThan(0)
    }
  })

  it("relates the two documents that share a category", () => {
    const first = docs.find((d) => routeOf(d).includes("first-corpus"))!
    const rel = json<Record<string, unknown>>(join(first, "relations.json"))
    /* A corpus-wide pre-pass is the only layer that can see this; a per-document parse
     * cannot. Serialising it as DATA is [P-00]. */
    expect(JSON.stringify(rel)).toContain("second-corpus-document")
  })
})

describe("integration — the served HTML is complete on its own", () => {
  it("carries a title, a description, a canonical and JSON-LD in every page", () => {
    for (const dir of docs) {
      const html = readFileSync(join(dir, "index.html"), "utf8")
      const id = routeOf(dir)
      expect(/<title[^>]*>[^<]+<\/title>/.test(html), `${id}: non-empty <title>`).toBe(true)
      expect(
        /<meta[^>]+name="description"[^>]+content="[^"]+"/.test(html),
        `${id}: meta description`,
      ).toBe(true)
      expect(/rel="canonical"/.test(html), `${id}: canonical link`).toBe(true)
      expect(/application\/ld\+json/.test(html), `${id}: JSON-LD block`).toBe(true)
      expect(/class="[^"]*org-root/.test(html), `${id}: the .org-root article`).toBe(true)
    }
  })

  it("puts the JSON-LD in the script BODY, and it parses", () => {
    for (const dir of docs) {
      const html = readFileSync(join(dir, "index.html"), "utf8")
      const blocks = [
        ...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g),
      ].map((m) => m[1].trim())
      /* A block whose payload sits in an ATTRIBUTE is invisible to every consumer that reads
       * structured data, and looks identical in a casual glance at the source. */
      expect(blocks.length, `${routeOf(dir)}: has a JSON-LD body`).toBeGreaterThan(0)
      for (const b of blocks) expect(() => JSON.parse(b)).not.toThrow()
    }
  })

  it("wraps every table in its scroll frame", () => {
    let seen = 0
    for (const dir of docs) {
      const html = readFileSync(join(dir, "index.html"), "utf8")
      for (const m of html.matchAll(/<table[^>]*class="([^"]*)"/g)) {
        seen++
        /* A chart's source table is clipped to one pixel for a crawler and is exempt — a
         * scroll frame around something nobody can reach is furniture. */
        if (m[1].includes("org-chart-data")) continue
        const before = html.slice(0, m.index)
        expect(
          before.lastIndexOf("org-table-scroll") > before.lastIndexOf("</table>"),
          `${routeOf(dir)}: a table escaped its scroll frame`,
        ).toBe(true)
      }
    }
    /* The corpus contains tables; if it stops doing so this whole block goes vacuous. */
    expect(seen).toBeGreaterThan(0)
  })

  it("emits no absolute filesystem path into any output", () => {
    /* A build that leaks the machine it ran on is not reproducible and is a small information
     * disclosure in a published artifact. */
    for (const dir of docs) {
      for (const file of ["index.html", "index.vue", "metadata.json"]) {
        expect(readFileSync(join(dir, file), "utf8")).not.toContain(work)
      }
    }
  })
})

describe("integration — the build is reproducible", () => {
  it("produces byte-identical output from the same input", async () => {
    const second = join(work, "site-again")
    await buildCommand(CORPUS, {
      output: second,
      highlight: true,
      sanitize: true,
      baseUrl: BASE,
      quiet: true,
    })

    const snapshot = (root: string) => {
      const acc: Record<string, string> = {}
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const abs = join(dir, entry.name)
          if (entry.isDirectory()) walk(abs)
          else if (statSync(abs).isFile()) {
            acc[relative(root, abs).split(sep).join("/")] = readFileSync(abs, "utf8")
          }
        }
      }
      walk(root)
      return acc
    }

    const a = snapshot(out)
    const b = snapshot(second)
    /* A timestamp, a Map iteration order or an unsorted glob would show up here and nowhere
     * else, and every one of them makes a "no changes" deploy rewrite every file. */
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort())
    for (const key of Object.keys(a)) {
      expect(b[key], `${key} differs between two builds`).toBe(a[key])
    }
  }, 120_000)
})
