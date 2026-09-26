import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/subsup.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1B subscript/superscript", () => {
  it("renders braced subscript and superscript with hooks", async () => {
    const html = await render(src)
    expect(html).toContain('H<sub class="org-subscript">2</sub>O')
    expect(html).toContain('mc<sup class="org-superscript">2</sup>')
  })

  it("leaves snake_case untouched (no bare-form subscript by default)", async () => {
    const html = await render(src)
    expect(html).toContain("snake_case")
    expect(html).not.toContain("snake<sub")
  })
})
