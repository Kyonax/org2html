import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"
import { parseOptions } from "../src/parser/metadata.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/options-num.org")

describe("1C #+OPTIONS symbol keys + numbering", () => {
  it("parses symbol-key options (^:{}) and a num depth", () => {
    const opts = parseOptions("num:2 ^:{} _:nil toc:nil")
    expect(opts.num).toBe(2)
    expect(opts.superscript).toBe("braces")
    expect(opts.subscript).toBe(false)
    expect(opts.toc).toBe(false)
  })

  it("numbers headings down to the requested depth only", async () => {
    const { html } = await renderToHtml(parse(src), {
      sanitize: false,
      codeHighlight: false,
    })
    expect(html).toContain('<span class="org-heading-number">1</span>')
    expect(html).toContain('<span class="org-heading-number">1.1</span>')
    expect(html).toContain('<span class="org-heading-number">1.2</span>')
    expect(html).toContain('<span class="org-heading-number">2</span>')
    expect(html).toContain('<span class="org-heading-number">2.1</span>')
    // Depth 3 is beyond num:2 → not numbered.
    expect(html).not.toContain('<span class="org-heading-number">2.1.1</span>')
  })
})
