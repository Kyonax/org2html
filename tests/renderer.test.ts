import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(org: string): Promise<string> {
  const result = await renderToHtml(parse(org), { sanitize: false, codeHighlight: false })
  return result.html
}

describe("renderer", () => {
  it("renders inline emphasis", async () => {
    const html = await render("*bold* and /italic/ and ~code~\n")
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<em>italic</em>")
    expect(html).toContain('<code class="org-code">code</code>')
  })

  it("renders a horizontal rule and a namespaced special block", async () => {
    expect(await render("-----\n")).toContain('<hr class="org-hr">')
    expect(await render("#+BEGIN_ASIDE\nx\n#+END_ASIDE\n")).toContain('<div class="org-aside">')
  })

  it("renders a code block inside <pre>", async () => {
    expect(await render("#+BEGIN_SRC js\nconst x = 1\n#+END_SRC\n")).toContain("<pre")
  })
})
