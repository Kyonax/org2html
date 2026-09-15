import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml, applyTemplate } from "../src/index.js"
import { buildVueSfc } from "../src/cli/vue-generator.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/seo-head.org")

describe("Phase 2 — SEO head + rich author + HTML/Vue parity", () => {
  it("parses a rich #+AUTHOR into name + ORCID + affiliation", () => {
    const { metadata } = parse(src)
    expect(metadata.author).toBe("Cristian D. Moreno")
    expect(metadata.authorOrcid).toBe("https://orcid.org/0009-0006-4459-5538")
    expect(metadata.authorAffiliation).toBe("Kyonax")
    expect(metadata.dateIso).toBe("2026-07-01")
  })

  it("emits a correct static SEO head (ISO date, ORCID sameAs, schema type, #+HTML_HEAD)", async () => {
    const { metadata } = parse(src)
    const { html } = await renderToHtml(parse(src), { sanitize: false, codeHighlight: false })
    const page = await applyTemplate(html, metadata)
    expect(page).toContain('<meta property="article:published_time" content="2026-07-01">')
    expect(page).toContain('<link rel="canonical" href="https://example.com/seo-demo">')
    expect(page).toContain('<link rel="preload" href="/app.js" as="script">')
    expect(page).toContain('"@type":"TechArticle"')
    expect(page).toContain('"sameAs":"https://orcid.org/0009-0006-4459-5538"')
    expect(page).toContain('"affiliation":"Kyonax"')
    expect(page).toContain('content="#f9cd26"') // theme-color = the default book's accent
  })

  it("keeps the Vue SFC head in parity with the static head", () => {
    const { metadata } = parse(src)
    const sfc = buildVueSfc(metadata, "<p>x</p>")
    // Same resolved SEO fields flow into the Vue head.
    expect(sfc).toContain("article:published_time")
    expect(sfc).toContain("2026-07-01")
    expect(sfc).toContain("theme-color") // present unconditionally now
    expect(sfc).toContain("#f9cd26") // theme-color default, not "if present"
    expect(sfc).toContain("og:type")
    // Not just the string: the payload must be the script's BODY. `children` renders as an
    // attribute under @unhead v2, which shipped an empty tag that passed a contains() check.
    expect(sfc).toContain("application/ld+json") // JSON-LD rides the Vue head too
    expect(sfc).toContain('"innerHTML"')
    expect(sfc).not.toContain('"children"')
    expect(sfc).toContain("https://orcid.org/0009-0006-4459-5538")
  })
})
