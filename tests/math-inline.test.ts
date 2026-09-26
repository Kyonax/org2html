import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/math-inline.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1B math / entities / cookies / timestamps", () => {
  it("TYPESETS inline, dollar, and display LaTeX into MathML", async () => {
    // A fragment is typeset at build time, so the reader needs no math library: the
    // browser draws the MathML. The .org-math hook still marks every fragment, and the
    // display form still carries .org-math-display.
    const html = await render(src)
    expect(html).toContain('<span class="org-math" data-math="mathml">')
    expect(html).toContain('<span class="org-math org-math-display" data-math="mathml">')
    expect(html.match(/<math/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html).toContain('display="block"')
  })

  it("falls back to the raw fragment WITH its delimiters when typesetting fails", async () => {
    // Nothing is ever lost to a rendering error, and the fallback is exactly the form a
    // host running KaTeX or MathJax scans for.
    const html = await render("Bad \\(\\frobnicate{x}\\) here.\n")
    expect(html).toContain('data-math="raw"')
    expect(html).toContain("\\frobnicate{x}")
  })

  it("keeps the raw form when math typesetting is switched off", async () => {
    const { html } = await renderToHtml(parse("A \\(x^2\\) fragment.\n"), {
      codeHighlight: false,
      math: false,
    })
    expect(html).toContain('data-math="raw"')
    expect(html).not.toContain("<math")
  })

  it("resolves entities to glyphs and leaves currency literal", async () => {
    const html = await render(src)
    expect(html).toContain("α")
    expect(html).toContain("β")
    expect(html).toContain("→")
    expect(html).toContain("×")
    // Currency is NOT math.
    expect(html).toContain("$5 and $10")
    expect(html).not.toContain('org-math">$5')
  })

  it("renders statistics cookies", async () => {
    const html = await render(src)
    expect(html).toContain('<span class="org-statistics-cookie">2/5</span>')
    expect(html).toContain('<span class="org-statistics-cookie">40%</span>')
  })

  it("renders active and inactive timestamps as <time> with a datetime", async () => {
    const html = await render(src)
    expect(html).toContain('<time class="org-timestamp" datetime="2024-01-15T10:00">')
    expect(html).toContain('<time class="org-timestamp org-timestamp--inactive" datetime="2024-02-01">')
  })
})
