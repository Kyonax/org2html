import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/inline-objects.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1B macros / inline-src / snippets / citations", () => {
  it("renders inline source with the org-inline-src hook", async () => {
    const html = await render(src)
    expect(html).toContain('<code class="org-inline-src" data-lang="js">const x = 1</code>')
  })

  it("renders a citation with the org-cite hook", async () => {
    const html = await render(src)
    expect(html).toContain('<span class="org-cite">@doe2020</span>')
  })

  it("passes an html export snippet through and drops a non-html one", async () => {
    const html = await render(src)
    expect(html).toContain("<mark>kept</mark>")
    expect(html).not.toContain("dropped")
  })

  it("consumes an undefined macro (no literal leak)", async () => {
    const html = await render(src)
    expect(html).not.toContain("{{{")
    expect(html).not.toContain("unknown(x)")
  })
})
