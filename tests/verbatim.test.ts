import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/verbatim.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("verbatim integrity", () => {
  it("keeps example content literal — no list/heading/italic interpretation", async () => {
    const html = await render(src)
    expect(html).toContain('<pre class="org-example">')
    // The dash and asterisk survive; no <li>, <h*>, or <em> is produced from them.
    expect(html).toContain("- this stays a dash, not a list")
    expect(html).toContain("* this stays an asterisk, not a heading")
    expect(html).toContain("/no italics here/")
    expect(html).not.toContain("<em>no italics here</em>")
  })

  it("preserves verse line breaks", async () => {
    const html = await render(src)
    expect(html).toContain('<p class="org-verse">')
    expect(html).toContain("Roses are red<br>\nViolets are blue")
  })

  it("keeps source code verbatim (pipes and plus are not tables/lists)", () => {
    const ast = parse(src)
    const code = ast.children.find((n) => n.type === "codeBlock")!
    expect(code.children?.[0]?.value).toBe("| pipes | stay |\n+ plus stays")
  })
})
