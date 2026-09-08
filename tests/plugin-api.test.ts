import { describe, expect, it } from "vitest"
import { parse, renderToHtml, PluginRegistry } from "../src/index.js"
import type { OrgPlugin } from "../src/types.js"

describe("Phase 5 — PluginRegistry unit", () => {
  it("folds metadata processors in registration order", async () => {
    const r = new PluginRegistry()
    r.register({ name: "a", metadataProcessor: (m) => ({ ...m, title: (m.title ?? "") + "A" }) })
    r.register({ name: "b", metadataProcessor: async (m) => ({ ...m, title: (m.title ?? "") + "B" }) })
    const out = await r.runMetadataProcessors({ title: "" })
    expect(out.title).toBe("AB")
  })

  it("runBlockHandler: first matching plugin wins, undefined defers", async () => {
    const r = new PluginRegistry()
    r.register({ name: "defer", blockHandlers: { foo: () => undefined as any } })
    r.register({ name: "win", blockHandlers: { foo: () => "<foo/>" } })
    expect(await r.runBlockHandler("foo", {} as any, {})).toBe("<foo/>")
    expect(await r.runBlockHandler("bar", {} as any, {})).toBeUndefined()
  })

  it("runInlineHandler resolves an inline node type", async () => {
    const r = new PluginRegistry()
    r.register({ name: "i", inlineHandlers: { bold: () => "<b-custom/>" } })
    expect(await r.runInlineHandler("bold", {} as any, {})).toBe("<b-custom/>")
  })

  it("chains async post-processors in order", async () => {
    const r = new PluginRegistry()
    r.register({ name: "1", postProcessor: (h) => h + "1" })
    r.register({ name: "2", postProcessor: async (h) => h + "2" })
    expect(await r.runPostProcessors("x", {})).toBe("x12")
  })
})

describe("Phase 5 — plugins through renderToHtml", () => {
  const render = (org: string, plugins: OrgPlugin[]) =>
    renderToHtml(parse(org), { sanitize: false, codeHighlight: false, plugins }).then((r) => r.html)

  it("a metadataProcessor feeds the title h1", async () => {
    const html = await render("Body.\n", [
      { name: "t", metadataProcessor: (m) => ({ ...m, title: "Injected" }) },
    ])
    expect(html).toContain('<h1 class="org-heading org-heading--title" id="doc-title">Injected</h1>')
  })

  it("a block handler claims a special block by name", async () => {
    const org = "#+BEGIN_CHART\ndata\n#+END_CHART\n"
    const html = await render(org, [
      { name: "chart", blockHandlers: { chart: () => '<div class="my-chart"></div>' } },
    ])
    expect(html).toContain('<div class="my-chart"></div>')
    expect(html).not.toContain("org-chart")
  })

  it("an inline handler overrides a built-in node type", async () => {
    const html = await render("a *bold* b\n", [
      { name: "b", inlineHandlers: { bold: () => "[[B]]" } },
    ])
    expect(html).toContain("[[B]]")
    expect(html).not.toContain("<strong>")
  })

  it("a post-processor transforms the final HTML", async () => {
    const html = await render("Body.\n", [
      { name: "pp", postProcessor: (h) => h + "<!-- processed -->" },
    ])
    expect(html.trimEnd().endsWith("<!-- processed -->")).toBe(true)
  })

  it("the built-in code highlighter runs through the same registry", async () => {
    // codeHighlight defaults on → the built-in plugin renders the block via Shiki
    const { html } = await renderToHtml(parse("#+BEGIN_SRC javascript\nconst x=1\n#+END_SRC\n"), {
      sanitize: false,
    })
    expect(html).toContain('class="org-src shiki')
  })
})
