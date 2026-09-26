import { describe, expect, it } from "vitest"
import { join } from "path"
import { applyTemplate, parse, renderToHtml } from "../src/index.js"
import { getDefaultStyles } from "../src/renderer/template.js"
import { parseCssVars, resolveStyleOptions } from "../src/cli/style-flags.js"

const meta = { title: "T", description: "d" }
const body = "<p>x</p>"

describe("Phase 3(b/c/d) — styling injection", () => {
  it("inlines the default stylesheet by default", async () => {
    const html = await applyTemplate(body, meta)
    expect(html).toContain("--o2h-signal-500")
    // empty slots collapse — no stray placeholders leak
    expect(html).not.toContain("{{themeVars}}")
    expect(html).not.toContain("{{stylesheetLink}}")
  })

  it("--no-default-styles drops the engine CSS", async () => {
    const html = await applyTemplate(body, meta, undefined, undefined, {
      injectDefaultStyles: false,
    })
    expect(html).not.toContain("--o2h-signal-500")
  })

  it("customCss replace substitutes the whole stylesheet", async () => {
    const html = await applyTemplate(body, meta, undefined, undefined, {
      customCss: ".mine{color:red}",
      styleMode: "replace",
    })
    expect(html).toContain(".mine{color:red}")
    expect(html).not.toContain("--o2h-signal-500")
  })

  it("customCss append keeps the default and adds custom after it", async () => {
    const html = await applyTemplate(body, meta, undefined, undefined, {
      customCss: ".mine{color:red}",
      styleMode: "append",
    })
    expect(html).toContain("--o2h-signal-500")
    expect(html).toContain(".mine{color:red}")
    expect(html.indexOf("--o2h-signal-500")).toBeLessThan(html.indexOf(".mine{color:red}"))
  })

  it("cssVars + fontStack emit a :root override block after the styles", async () => {
    const html = await applyTemplate(body, meta, undefined, undefined, {
      cssVars: { "--host-signal-500": "#00f", "o2h-measure": "60ch" },
      fontStack: "Inter, sans-serif",
    })
    expect(html).toContain("--host-signal-500: #00f;")
    expect(html).toContain("--o2h-measure: 60ch;") // bare key gets the -- prefix
    expect(html).toContain("--host-font-editorial: Inter, sans-serif;")
    // override block sits after the main styles so it wins the cascade
    expect(html.indexOf("--o2h-signal-500")).toBeLessThan(html.indexOf("--host-signal-500: #00f;"))
  })

  it("strips angle brackets from cssVars values (no style-tag breakout)", async () => {
    const html = await applyTemplate(body, meta, undefined, undefined, {
      cssVars: { "--x": "red}</style><script>alert(1)</script>" },
    })
    expect(html).not.toContain("<script>alert(1)")
  })

  it("--link-css references stylesheets without inlining them", async () => {
    const html = await applyTemplate(body, meta, undefined, undefined, {
      linkedStylesheets: ["/a.css", "https://cdn.example/b.css"],
    })
    expect(html).toContain('<link rel="stylesheet" href="/a.css">')
    expect(html).toContain('<link rel="stylesheet" href="https://cdn.example/b.css">')
  })

  it("per-file fallback: a custom default.html survives a missing styles.css", async () => {
    const dir = join(__dirname, "fixtures", "custom-template")
    const html = await applyTemplate(body, meta, undefined, dir)
    expect(html).toContain("data-custom-template") // custom template used
    expect(html).toContain("--o2h-signal-500") // default styles injected as fallback
  })
})

describe("Phase 3(b) — theme knob on the root wrapper", () => {
  it("writes data-theme when RenderOptions.theme is set", async () => {
    const { html } = await renderToHtml(parse("* H\n\nx\n"), {
      sanitize: false,
      theme: "dark",
    })
    expect(html).toContain('<div class="org-root" data-theme="dark">')
  })

  it("omits data-theme by default (OS preference drives dark mode)", async () => {
    const { html } = await renderToHtml(parse("x\n"), { sanitize: false })
    expect(html).toContain('<div class="org-root">')
    expect(html).not.toContain("data-theme")
  })
})

describe("Phase 3 — CLI style-flag resolver", () => {
  it("parses name=value pairs from --css-var", () => {
    expect(parseCssVars(["--a=1", "b=two", "bad", "c=x=y"])).toEqual({
      "--a": "1",
      b: "two",
      c: "x=y",
    })
  })

  it("resolveStyleOptions defaults injectDefaultStyles true", async () => {
    const s = await resolveStyleOptions({})
    expect(s.injectDefaultStyles).toBe(true)
    expect(s.customCss).toBeUndefined()
  })

  it("resolveStyleOptions honors --no-default-styles + --link-css + --css-var", async () => {
    const s = await resolveStyleOptions({
      defaultStyles: false,
      linkCss: ["/x.css"],
      cssVar: ["--host-ink=#111"],
      font: "Inter",
    })
    expect(s.injectDefaultStyles).toBe(false)
    expect(s.linkedStylesheets).toEqual(["/x.css"])
    expect(s.cssVars).toEqual({ "--host-ink": "#111" })
    expect(s.fontStack).toBe("Inter")
  })
})

describe("the default book is kyo-web-online", () => {
  it("ships the KWO token values, the shared constructs, and the book layer", async () => {
    const css = await getDefaultStyles()
    // 1. token layer — dark surface, brand yellow, KWO type scale
    expect(css).toMatch(/--o2h-paper:\s+var\(--host-paper,\s+oklch\(14\.5% 0\s+0\)\)/)
    expect(css).toContain("oklch(85.9% 0.1686 91.3)") // #f9cd26
    // The document shell renders its body at fs-300; see the note in kwo-tokens.css.
    expect(css).toContain("--o2h-fs-body:    var(--host-fs-body,    15px)")
    // 2. shared construct layer
    expect(css).toContain(".org-root .org-heading")
    // 3. the book's own layer, applied AFTER the constructs it overrides
    expect(css).toContain("@font-face")
    expect(css.indexOf("@font-face")).toBeGreaterThan(css.indexOf(".org-root .org-heading"))
  })

  it("self-hosts its fonts rather than fetching them from a third party", async () => {
    const css = await getDefaultStyles()
    expect(css).toContain("/fonts/GeomanistRegular.woff2")
    expect(css).toContain("/fonts/SpaceMonoNerdFont-Regular.woff2")
    expect(css).not.toContain("fonts.googleapis.com")
    expect(css).not.toContain("fonts.gstatic.com")
  })

  it("keeps every --host-* override seam intact after the swap", async () => {
    const css = await getDefaultStyles()
    // The whole point of the token indirection: a consumer re-skins without
    // touching the engine, and that seam must survive a change of default book.
    for (const seam of ["--host-paper", "--host-ink", "--host-signal-500", "--host-font-editorial", "--host-measure"]) {
      expect(css).toContain(seam)
    }
  })

  it("opts into a LIGHT inverse, mirroring how the O2H book opted into dark", async () => {
    const css = await getDefaultStyles()
    expect(css).toContain('.org-root[data-theme="light"]')
  })
})
