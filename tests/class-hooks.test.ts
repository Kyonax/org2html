import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(org: string, opts = {}): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
    ...opts,
  })
  return html
}

describe("Phase 3 — class-hook contract [D-08]", () => {
  it("wraps the whole article body in .org-root", async () => {
    const html = await render("* H\n\nBody.\n")
    expect(html).toContain('<div class="org-root">')
  })

  it("namespaces paragraph, inline code and verbatim hooks", async () => {
    const html = await render("A ~inline~ and =verb= word.\n")
    expect(html).toContain('<p class="org-paragraph">')
    expect(html).toContain('<code class="org-code">')
    expect(html).toContain('<code class="org-verbatim">')
    expect(html).not.toContain('class="verbatim"') // old un-namespaced hook gone
  })

  it("renders a standalone image paragraph as a lazy .org-figure", async () => {
    const html = await render("[[/img/cover.png]]\n")
    expect(html).toContain('<figure class="org-figure">')
    expect(html).toContain('<img class="org-image"')
    expect(html).toContain('loading="lazy"')
  })

  it("re-namespaces every hook when classPrefix is set", async () => {
    const html = await render("* H\n\nBody.\n", { classPrefix: "doc-" })
    expect(html).toContain('<div class="doc-root">')
    expect(html).toContain('class="doc-heading outline-1"')
    expect(html).not.toContain("org-")
  })
})
