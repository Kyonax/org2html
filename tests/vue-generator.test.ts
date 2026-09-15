import { describe, expect, it } from "vitest"
import { buildVueSfc, processComponentPlaceholders, stripDocumentWrapper } from "../src/cli/vue-generator.js"

describe("Phase 3(e) — Vue SFC is class-only", () => {
  it("emits no <style> block (inherits the host app)", () => {
    const sfc = buildVueSfc({ title: "T" }, '<div class="org-root"><p class="org-paragraph">x</p></div>')
    expect(sfc).not.toContain("<style")
    // dead .article-* / hardcoded skin is gone
    expect(sfc).not.toContain("820px")
    expect(sfc).not.toContain("system-ui")
    expect(sfc).not.toContain(".article-")
  })

  it("keeps the .org-* class hooks in the template", () => {
    const sfc = buildVueSfc({ title: "T" }, '<div class="org-root"><p class="org-paragraph">x</p></div>')
    expect(sfc).toContain('class="org-root"')
    expect(sfc).toContain('class="org-paragraph"')
    // semantic <article> wrapper still added when content lacks one
    expect(sfc).toContain("<article")
  })

  it("still exports seoMeta + metadata for the host head", () => {
    const sfc = buildVueSfc({ title: "T", description: "d" }, "<p>x</p>")
    expect(sfc).toContain("export const seoMeta")
    expect(sfc).toContain("export const metadata")
    expect(sfc).toContain("useHead(seoMeta)")
  })
})

describe("Phase 6 (pre) — component placeholder rewrite", () => {
  it("rewrites data-component into an imported <Comp v-bind>", () => {
    const html = '<div data-component="Callout" tone="tip"></div>'
    const out = processComponentPlaceholders(html, { Callout: "@ui/Callout.vue" })
    expect(out.imports).toContain("import Callout from '@ui/Callout.vue'")
    expect(out.html).toContain('<Callout v-bind="__props0" />')
    expect(out.propsDeclarations[0]).toContain("decodeURIComponent")
  })

  it("strips the document wrapper for fragment/vue output", () => {
    const doc = "<!DOCTYPE html><html><head><title>x</title></head><body><article>keep</article></body></html>"
    const out = stripDocumentWrapper(doc)
    expect(out).toContain("keep")
    expect(out).not.toContain("<head")
    expect(out).not.toContain("<!DOCTYPE")
  })
})

describe("SFC string-literal safety", () => {
  it("survives an apostrophe in the metadata (encodeURIComponent leaves ' raw)", () => {
    const sfc = buildVueSfc(
      { title: "A galaxy that shouldn't exist", description: "It's fine" } as never,
      "<p>Body</p>",
    )
    // The encoded payload must not contain a bare quote that would close the
    // decodeURIComponent('…') string literal.
    const payload = /decodeURIComponent\('([^']*)'\)/.exec(sfc)
    expect(payload).not.toBeNull()
    expect(payload![1]).toContain("%27")
    // And it must still round-trip to the original value.
    const decoded = JSON.parse(decodeURIComponent(payload![1]))
    expect(decoded.title).toBe("A galaxy that shouldn't exist")
  })

  it("escapes an apostrophe inside component props too", () => {
    const { propsDeclarations } = processComponentPlaceholders(
      `<div data-component="Card" label="Ada's engine"></div>`,
      { Card: "./Card.vue" },
    )
    expect(propsDeclarations).toHaveLength(1)
    const payload = /decodeURIComponent\('([^']*)'\)/.exec(propsDeclarations[0])
    expect(payload).not.toBeNull()
    expect(JSON.parse(decodeURIComponent(payload![1])).label).toBe("Ada's engine")
  })
})

describe("unmapped components degrade instead of breaking the host build", () => {
  const placeholder = `<p>a</p><div data-component="command" text="ls -la"></div><p>b</p>`

  it("leaves an unmapped component as an inert placeholder", () => {
    const { imports, html } = processComponentPlaceholders(placeholder, {})
    // No import a consumer cannot resolve, and the div survives for the default
    // [data-component] CSS to style — the same outcome as the static HTML path.
    expect(imports).toEqual([])
    expect(html).toContain('data-component="command"')
    expect(html).not.toContain("<command")
  })

  it("still wires a component the map DOES resolve", () => {
    const { imports, html } = processComponentPlaceholders(placeholder, {
      command: "@site/components/Command.vue",
    })
    expect(imports).toEqual(["import command from '@site/components/Command.vue'"])
    expect(html).toContain("<command v-bind=")
  })

  it("prefers data-component-src over the map", () => {
    const { imports } = processComponentPlaceholders(
      `<div data-component="Card" data-component-src="@book/Card.vue"></div>`,
      { Card: "./ignored.vue" },
    )
    expect(imports).toEqual(["import Card from '@book/Card.vue'"])
  })
})
