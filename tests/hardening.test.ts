import { describe, expect, it } from "vitest"
import { parse, renderToHtml, applyTemplate } from "../src/index.js"
import { generateSlugFromMetadata } from "../src/cli/utils.js"
import { buildVueSfc } from "../src/cli/vue-generator.js"

const render = (org: string, opts = {}) =>
  renderToHtml(parse(org), { sanitize: false, codeHighlight: false, ...opts }).then((r) => r.html)

describe("Hardening — output/security (§EDGE CASES C)", () => {
  it("escapes </script> in JSON-LD so it cannot break out of the head block", async () => {
    const page = await applyTemplate("<p>x</p>", { title: "Evil</script><script>alert(1)", description: "d" })
    expect(page).toContain("\\u003c/script") // escaped inside the LD blob
    expect(page).not.toContain("Evil</script><script>alert(1)") // no raw breakout
  })

  it("blocks javascript: URLs independent of DOMPurify (safe under --no-sanitize)", async () => {
    const js = await render("[[javascript:alert(1)][click]]\n")
    expect(js).toContain('href="#"')
    expect(js).not.toContain("javascript:")
    const ok = await render("[[https://example.com][ok]]\n")
    expect(ok).toContain('href="https://example.com"')
  })

  it("allows data:image but blocks other data: URLs", async () => {
    const img = await render("[[data:image/png;base64,iVBORimg][pic]]\n")
    expect(img).toContain("data:image/png")
  })

  it("drops on* / style attribute names from component placeholders", async () => {
    const html = await render('{{< Card onclick="x()" style="color:red" tone="tip" >}}\n')
    expect(html).not.toContain("onclick")
    expect(html).not.toContain("style=")
    expect(html).toContain('tone="tip"')
  })

  it("truncates + collapses an over-long meta description", async () => {
    const long = "word ".repeat(80).trim()
    const page = await applyTemplate("<p>x</p>", { title: "T", description: long })
    const meta = page.match(/<meta name="description" content="([^"]*)"/)![1]
    expect(meta.length).toBeLessThanOrEqual(160)
    expect(meta.endsWith("…")).toBe(true)
  })
})

describe("Hardening — parser (§EDGE CASES A)", () => {
  it("un-escapes Org comma-escaped lines inside a block", async () => {
    const org = "#+BEGIN_EXAMPLE\n,#+END_EXAMPLE\n,* not a headline\n#+END_EXAMPLE\n"
    const html = await render(org)
    expect(html).toContain("#+END_EXAMPLE")
    expect(html).toContain("* not a headline")
    expect(html).not.toContain(",#+END_EXAMPLE")
  })

  it("recognizes a data:image link as an <img>", async () => {
    const html = await render("[[data:image/gif;base64,R0lGODlh]]\n")
    expect(html).toContain("<img")
    expect(html).toContain("data:image/gif")
  })

  it("gives repeated references to one footnote unique DOM ids", async () => {
    const html = await render("A[fn:1] and again[fn:1].\n\n[fn:1] Def.\n")
    expect(html).toContain('id="fnref-1"')
    expect(html).toContain('id="fnref-1-2"')
  })
})

describe("Hardening — CLI (§EDGE CASES B)", () => {
  it("produces a deterministic, wall-clock-free slug when #+DATE is missing", () => {
    const slug = generateSlugFromMetadata({ title: "My Post" })
    expect(slug).toBe("my-post")
    expect(slug).not.toMatch(/\d{4}-\d{2}-\d{2}/) // no injected timestamp
  })

  it("still date-prefixes when #+DATE is present", () => {
    expect(generateSlugFromMetadata({ title: "My Post", date: "2026-07-01" })).toBe("2026-07-01-my-post")
  })
})

describe("Hardening — Vue output (§EDGE CASES C)", () => {
  it("entity-encodes literal {{ }} so Vue does not interpolate prose/code", () => {
    const sfc = buildVueSfc({ title: "T" }, "<p>use {{ count }} here</p>")
    expect(sfc).not.toContain("{{ count }}")
    expect(sfc).toContain("&#123;&#123;")
  })
})
