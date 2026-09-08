import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/footnotes.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1B footnotes done right", () => {
  it("renders references with accessible roles and a footnotes section", async () => {
    const html = await render(src)
    expect(html).toContain('<sup id="fnref-1" class="org-fnref">')
    expect(html).toContain('role="doc-noteref"')
    expect(html).toContain('<section class="org-footnotes">')
    expect(html).toContain('role="doc-backlink"')
  })

  it("collects the real column-0 definition (no placeholder)", async () => {
    const html = await render(src)
    expect(html).toContain("real definition, collected from column zero.")
    // No leftover "Footnote {ref}" placeholder text.
    expect(html).not.toMatch(/>Footnote 1<\/li>/)
  })

  it("renders inline and anonymous definitions", async () => {
    const html = await render(src)
    expect(html).toContain("the inline definition text")
    expect(html).toContain("an anonymous note")
  })

  it("reuses one number for a repeated reference", async () => {
    const html = await render(src)
    // Only one <li> for label 1 despite two references.
    const lis = html.match(/<li id="fn-1"/g) ?? []
    expect(lis.length).toBe(1)
  })
})
