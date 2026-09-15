import { describe, expect, it } from "vitest"
import { org2html, parse, renderToHtml } from "../src/index.js"

async function render(org: string, opts = {}): Promise<string> {
  const { html } = await renderToHtml(parse(org), { sanitize: false, codeHighlight: false, ...opts })
  return html
}

describe("Phase 4 — ADA / WCAG 2.1 AA", () => {
  it("promotes #+TITLE to the single <h1> and offsets content headings", async () => {
    const html = await render("#+TITLE: My Doc\n\n* Section\n\n** Sub\n")
    expect(html).toContain('<h1 class="org-heading org-heading--title" id="doc-title">My Doc</h1>')
    // org level 1 → <h2>, level 2 → <h3>; the outline-N hook keeps the org level
    expect(html).toContain('<h2 class="org-heading outline-1"')
    expect(html).toContain('<h3 class="org-heading outline-2"')
    // exactly one <h1>
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
  })

  it("keeps content headings at their level when there is no title", async () => {
    const html = await render("* Section\n")
    expect(html).not.toContain('org-heading--title')
    expect(html).toContain('<h1 class="org-heading outline-1"')
  })

  it("places the TOC after the H1 title", async () => {
    const html = await render("#+TITLE: T\n#+OPTIONS: toc:2\n\n* One\n\n* Two\n")
    const h1 = html.indexOf('org-heading--title')
    const toc = html.indexOf('class="org-toc"')
    expect(h1).toBeGreaterThan(-1)
    expect(toc).toBeGreaterThan(h1)
  })

  it("de-duplicates repeated heading anchors (WCAG 4.1.1)", async () => {
    const html = await render("* Intro\n\n* Intro\n")
    expect(html).toContain('id="intro"')
    expect(html).toContain('id="intro-2"')
  })

  it("keeps a real anchor for a non-ASCII heading instead of id=\"\"", async () => {
    const html = await render("* 日本語\n")
    expect(html).not.toContain('id=""')
    expect(html).toMatch(/id="[^"]+"/)
  })

  it("gives a described image a meaningful alt and a bare image alt=\"\"", async () => {
    const described = await render("[[/img/cat.png][A sleeping cat]]\n")
    expect(described).toContain('alt="A sleeping cat"')
    const bare = await render("[[/img/deco.png]]\n")
    expect(bare).toContain('alt=""')
  })

  it("footnotes carry doc-noteref / doc-backlink roles + aria-labels", async () => {
    const html = await render("Text.[fn:1]\n\n[fn:1] Def.\n")
    expect(html).toContain('role="doc-noteref"')
    expect(html).toContain('role="doc-backlink"')
    expect(html).toContain("aria-label=")
  })

  it("full document gets a skip link + <main id=main> landmark", async () => {
    const { html } = await org2html("#+TITLE: T\n\n* One\n", { codeHighlight: false })
    expect(html).toContain('<a class="skip-link" href="#main">')
    expect(html).toContain('<main id="main">')
  })
})
