import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/sectioning.org")

const plain = (nodes: any[] | undefined): string =>
  (nodes ?? [])
    .map((n) => (n.type === "text" ? String(n.value ?? "") : plain(n.children)))
    .join("")

describe("AST sectioning", () => {
  it("a headline owns content up to the next same-or-higher headline", () => {
    const ast = parse(src)

    // Root: preamble paragraph, then two level-1 sections.
    expect(ast.children.map((n) => n.type)).toEqual([
      "paragraph",
      "heading",
      "heading",
    ])

    const first = ast.children[1]
    const second = ast.children[2]
    expect(first.properties?.level).toBe(1)
    expect(plain(first.properties?.title)).toBe("First Section")

    // First section owns its intro paragraph AND the nested subsection.
    expect(first.children?.map((n) => n.type)).toEqual(["paragraph", "heading"])

    const nested = first.children!.find((n) => n.type === "heading")!
    expect(nested.properties?.level).toBe(2)
    expect(nested.children?.[0]?.type).toBe("paragraph")

    // Second section's paragraph does NOT leak into the first section.
    expect(second.properties?.level).toBe(1)
    expect(second.children?.map((n) => n.type)).toEqual(["paragraph"])
  })

  it("keeps the title out of the section body", () => {
    const ast = parse(src)
    const first = ast.children[1]
    // children hold the body, never the title inline nodes.
    expect(first.children?.every((n) => n.type !== "text")).toBe(true)
    expect(Array.isArray(first.properties?.title)).toBe(true)
  })

  it("emits section + heading hooks and nests h2 inside the first section", async () => {
    const { html } = await renderToHtml(parse(src), {
      sanitize: false,
      codeHighlight: false,
    })

    expect(html).toContain('<section class="org-section">')
    // Tag-independent: the outline-N hook is the stable contract (the actual
    // <hN> tag shifts by the doc-title offset — WCAG 2.4.6, tested separately).
    expect(html).toContain('class="org-heading outline-1"')
    expect(html).toContain('class="org-heading outline-2"')
    // The document #+TITLE is the single <h1>; content headings start at <h2>.
    expect(html).toContain('<h1 class="org-heading org-heading--title"')
    expect(html).toContain('<h2 class="org-heading outline-1"')

    // The nested outline-2 sits before the SECOND section's outline-1 in the body.
    const h2 = html.indexOf("outline-2")
    const lastH1 = html.lastIndexOf("outline-1")
    expect(h2).toBeGreaterThan(-1)
    expect(h2).toBeLessThan(lastH1)
  })
})
