import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { parse, renderToHtml, applyTemplate } from "../src/index.js"

const render = (org: string) =>
  renderToHtml(parse(org), { sanitize: false, codeHighlight: false }).then((r) => r.html)

describe("S2-1 — tab-aware indentation", () => {
  it("nests a tab-indented child under a space-indented parent", async () => {
    const html = await render("- parent\n\t- child via tab\n")
    // the tab counts as a deeper visual column, so the child nests
    expect(html).toMatch(/<li>parent[\s\S]*<ul[^>]*>[\s\S]*child via tab/)
  })

  it("leaves space-only indentation unchanged", async () => {
    const html = await render("- a\n  - b\n")
    expect(html).toMatch(/<li>a[\s\S]*<ul[^>]*>[\s\S]*<li>b/)
  })
})

describe("S2-2 — literal-escape entities", () => {
  it("emits literal structure chars without triggering markup", async () => {
    const html = readFileSync(join(__dirname, "fixtures", "literal-escape.org"), "utf-8")
    const out = await render(html)
    expect(out).toContain("*not bold*")
    expect(out).not.toContain("<strong>not bold</strong>")
    expect(out).toContain("|") // \vert{}
    expect(out).toContain("[") // \lbrack{}
  })
})

describe("S2-3 — canonical validation", () => {
  it("keeps a site-relative canonical", async () => {
    const page = await applyTemplate("<p>x</p>", { title: "T", canonical: "/blog/post" })
    expect(page).toContain('rel="canonical" href="/blog/post"')
  })

  it("keeps an absolute canonical", async () => {
    const page = await applyTemplate("<p>x</p>", { title: "T", canonical: "https://ex.com/p" })
    expect(page).toContain('href="https://ex.com/p"')
  })

  it("drops an unsafe / malformed canonical", async () => {
    const page = await applyTemplate("<p>x</p>", { title: "T", canonical: "javascript:alert(1)" })
    expect(page).not.toContain("javascript:alert")
    expect(page).not.toContain('rel="canonical"')
  })
})
