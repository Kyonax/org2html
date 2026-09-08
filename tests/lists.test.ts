import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/lists.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("lists", () => {
  it("nests deeper-indented items inside the preceding item", () => {
    const ast = parse(src)
    const firstList = ast.children.find((n) => n.type === "list")!
    const topItem = firstList.children![0]
    expect(topItem.type).toBe("listItem")
    // The top item owns a nested sublist.
    const sub = topItem.children!.find((c) => c.type === "list")
    expect(sub).toBeDefined()
    expect(sub!.children!.length).toBe(3)
  })

  it("renders checkbox items with a hook and native checkbox state", async () => {
    const html = await render(src)
    expect(html).toContain('<li class="org-li--checkbox" data-checkbox="checked">')
    expect(html).toContain('<li class="org-li--checkbox" data-checkbox="unchecked">')
    expect(html).toContain('<input type="checkbox" disabled checked aria-label="checked">')
  })

  it("emits an explicit ordinal for a [@n] counter", async () => {
    const html = await render(src)
    expect(html).toContain("<ol")
    expect(html).toContain('<li value="5">')
  })

  it("renders 'term :: desc' as a description list", async () => {
    const ast = parse(src)
    const dl = ast.children.find(
      (n) => n.type === "list" && n.properties?.description,
    )!
    expect(dl).toBeDefined()
    expect(dl.children![0].properties?.term).toBeDefined()

    const html = await render(src)
    expect(html).toContain('<dl class="org-dl">')
    expect(html).toContain('<dt class="org-dt">Term A</dt>')
    expect(html).toContain('<dd class="org-dd">the definition of A</dd>')
  })
})
