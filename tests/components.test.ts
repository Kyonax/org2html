import { describe, expect, it, vi } from "vitest"
import { parse, renderToHtml } from "../src/index.js"
import { parseComponentArgs } from "../src/plugins/shortcode.js"
import { processComponentPlaceholders, stripDocumentWrapper } from "../src/cli/vue-generator.js"

const render = (org: string, opts = {}) =>
  renderToHtml(parse(org), { sanitize: false, codeHighlight: false, ...opts }).then((r) => r.html)

describe("Phase 6 — component bridge", () => {
  it("parses a #+BEGIN_COMPONENT header into name + :key val attrs", () => {
    expect(parseComponentArgs('Ad :slot top :network adsense')).toEqual({
      name: "Ad",
      attrs: { slot: "top", network: "adsense" },
    })
  })

  it("renders an inline shortcode as an inert data-component placeholder", async () => {
    const html = await render('{{< Callout tone="tip" >}}\n')
    expect(html).toContain('data-component="Callout"')
    expect(html).toContain('tone="tip"')
  })

  it("renders a block component with a JSON props body (data-props channel)", async () => {
    const org = '#+BEGIN_COMPONENT Chart :height 320\n{ "series": [1, 2, 3] }\n#+END_COMPONENT\n'
    const html = await render(org)
    expect(html).toContain('data-component="Chart"')
    expect(html).toContain('height="320"')
    expect(html).toContain("data-props=")
    // the JSON body is URL-encoded into data-props
    expect(decodeURIComponent(html.match(/data-props="([^"]*)"/)![1])).toContain('"series"')
  })

  it("emits data-component-src from the --components map", async () => {
    const html = await render('{{< Ad >}}\n', { componentMap: { Ad: "@site/Ad.vue" } })
    expect(html).toContain('data-component-src="@site/Ad.vue"')
  })

  it("warns on an unknown component, errors under strict", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {})
    await render('{{< Ghost >}}\n', { componentMap: { Ad: "x" } })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    await expect(render('{{< Ghost >}}\n', { componentMap: { Ad: "x" }, strict: true })).rejects.toThrow(
      /unknown component/,
    )
  })
})

describe("Phase 6 — Vue placeholder rewrite honors the props channels", () => {
  it("merges data-props JSON and uses data-component-src as the import", () => {
    const html =
      '<div data-component="Chart" data-component-src="@ui/Chart.vue" height="320" data-props="' +
      encodeURIComponent(JSON.stringify({ series: [1, 2] })) +
      '"></div>'
    const out = processComponentPlaceholders(html, {})
    expect(out.imports).toContain("import Chart from '@ui/Chart.vue'")
    const decl = out.propsDeclarations[0]
    const decoded = JSON.parse(decodeURIComponent(decl.match(/decodeURIComponent\('([^']*)'\)/)![1]))
    expect(decoded.series).toEqual([1, 2])
    expect(decoded.height).toBe(320)
    expect(decoded).not.toHaveProperty("data-props")
  })
})

/*
 * COMPONENT PROPS THROUGH THE DEFAULT SANITIZER (T1-4).
 *
 * The placeholder carries props as BARE attributes. DOMPurify strips any bare
 * attribute it does not know, so under the DEFAULT pipeline a component received
 * only the handful of names that happen to have a data-* twin — the SFC got
 * {title, height} where the author wrote five props. Every case in this file
 * above renders with sanitize:false, so the suite could not see it.
 */
const CARD_ORG =
  "#+BEGIN_COMPONENT Card :image /images/card.jpg :title Hello :variant wide :count 3 :height 320\n#+END_COMPONENT\n"
const CARD_MAP = { Card: "./Card.vue" }

async function propsThroughPipeline(org: string, sanitize: boolean, map = CARD_MAP) {
  const { html } = await renderToHtml(parse(org), {
    sanitize,
    codeHighlight: false,
    componentMap: map,
  })
  const { propsDeclarations } = processComponentPlaceholders(stripDocumentWrapper(html), map)
  const encoded = propsDeclarations[0]?.match(/decodeURIComponent\('([^']*)'\)/)?.[1]
  return encoded ? JSON.parse(decodeURIComponent(encoded)) : undefined
}

describe("component props survive the default sanitizer (T1-4)", () => {
  it("delivers the same props with the sanitizer on and off", async () => {
    const off = await propsThroughPipeline(CARD_ORG, false)
    const on = await propsThroughPipeline(CARD_ORG, true)
    expect(on).toEqual(off)
  })

  it("delivers every authored prop under the default pipeline", async () => {
    expect(await propsThroughPipeline(CARD_ORG, true)).toEqual({
      image: "/images/card.jpg",
      title: "Hello",
      variant: "wide",
      count: 3,
      height: 320,
    })
  })

  it("keeps the existing precedence when a flat attr and the JSON body collide", async () => {
    const org =
      '#+BEGIN_COMPONENT Chart :height 320 :series flat\n{ "series": [1, 2, 3] }\n#+END_COMPONENT\n'
    const map = { Chart: "./Chart.vue" }
    const on = await propsThroughPipeline(org, true, map)
    const off = await propsThroughPipeline(org, false, map)
    // Parity is the invariant. The WINNER is unchanged from today: the Vue
    // generator has always layered flat attrs on top of the JSON channel, and
    // this step does not renegotiate that.
    expect(on).toEqual(off)
    expect(on.series).toBe("flat")
    expect(on.height).toBe(320)
  })

  it("does not smuggle a dropped attribute name through the channel", async () => {
    const org = '#+BEGIN_COMPONENT Card :title Safe :style color:red :onclick evil()\n#+END_COMPONENT\n'
    const props = await propsThroughPipeline(org, true)
    expect(props).toEqual({ title: "Safe" })
    expect(props).not.toHaveProperty("style")
    expect(props).not.toHaveProperty("onclick")
  })

  it("carries an inline shortcode's props through the sanitizer too", async () => {
    const org = '{{< Callout tone="tip" title="Note" level="2" >}}\n'
    const map = { Callout: "./Callout.vue" }
    expect(await propsThroughPipeline(org, true, map)).toEqual(
      await propsThroughPipeline(org, false, map),
    )
  })
})
