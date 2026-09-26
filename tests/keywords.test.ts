import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/keywords.org")

describe("1C generic keyword lines", () => {
  it("does not leak body-level #+KEYWORD lines as paragraphs", async () => {
    const { html } = await renderToHtml(parse(src), {
      sanitize: false,
      codeHighlight: false,
    })
    expect(html).not.toContain("#+NAME")
    expect(html).not.toContain("#+CAPTION")
    expect(html).not.toContain("#+ATTR_HTML")
    expect(html).not.toContain("#+RESULTS")
    // The real paragraphs survive.
    expect(html).toContain("Real paragraph one.")
    expect(html).toContain("Real paragraph two.")
  })

  it("keeps only the two real paragraphs in the tree", () => {
    const ast = parse(src)
    const paras = ast.children.filter((n) => n.type === "paragraph")
    expect(paras.length).toBe(2)
  })
})
