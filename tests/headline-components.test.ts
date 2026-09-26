import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/headline-components.org")

const plain = (nodes: any[] | undefined): string =>
  (nodes ?? [])
    .map((n) => (n.type === "text" ? String(n.value ?? "") : plain(n.children)))
    .join("")

describe("headline components", () => {
  it("parses TODO keyword, priority, and tags off the title", () => {
    const ast = parse(src)
    const first = ast.children.find((n) => n.type === "heading")!

    expect(first.properties?.todo).toBe("TODO")
    expect(first.properties?.todoDone).toBe(false)
    expect(first.properties?.priority).toBe("A")
    expect(first.properties?.tags).toEqual(["work", "@office"])
    // The title no longer carries the keyword / priority / tags.
    expect(plain(first.properties?.title)).toBe("Ship the release")
  })

  it("flags DONE as the done state", () => {
    const ast = parse(src)
    const done = ast.children.find(
      (n) => n.type === "heading" && n.properties?.todo === "DONE",
    )!
    expect(done.properties?.todoDone).toBe(true)
    expect(plain(done.properties?.title)).toBe("Write the tests")
  })

  it("drops a COMMENT headline and its whole subtree", () => {
    const ast = parse(src)
    const titles = ast.children
      .filter((n) => n.type === "heading")
      .map((n) => plain(n.properties?.title))

    expect(titles).toContain("Ship the release")
    expect(titles).toContain("Plain Heading")
    // The COMMENT headline and its buried child never make it into the tree.
    expect(titles).not.toContain("Internal Notes")
    expect(JSON.stringify(ast)).not.toContain("Buried Detail")
  })

  it("renders TODO/priority/tag hooks and omits the COMMENT subtree", async () => {
    const { html } = await renderToHtml(parse(src), {
      sanitize: false,
      codeHighlight: false,
    })

    expect(html).toContain('<span class="org-todo">TODO</span>')
    expect(html).toContain('<span class="org-todo org-done">DONE</span>')
    expect(html).toContain('<span class="org-priority" data-priority="A">[#A]</span>')
    expect(html).toContain('<span class="org-tag">@office</span>')
    expect(html).toContain('<span class="org-tags">')

    // The dropped COMMENT subtree leaves no trace in the rendered output.
    expect(html).not.toContain("Internal Notes")
    expect(html).not.toContain("Buried Detail")
    expect(html).toContain("Plain Heading")
  })
})
