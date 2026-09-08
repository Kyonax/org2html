/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse, renderToHtml } from "../src/index.js"

const STYLES = readFileSync(join(__dirname, "..", "templates", "styles.css"), "utf-8")

const LAYOUTS = [
  "magazine", "archive", "editorial", "feed", "author", "article", "category", "newsletter",
]

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), { sanitize: true })
  return html
}

describe("Phase SB-5 — page layouts + template chrome (LAY / CHR)", () => {
  it("parses #+HTML_LAYOUT into metadata.layout for each of the 8 layouts", () => {
    for (const lay of LAYOUTS) {
      const ast = parse(`#+HTML_LAYOUT: ${lay}\n\nBody.`)
      expect(ast.metadata.layout, `layout ${lay}`).toBe(lay)
    }
  })

  it("ignores an unknown layout (falls back to the article default)", () => {
    const ast = parse("#+HTML_LAYOUT: bogus\n\nBody.")
    expect(ast.metadata.layout).toBeUndefined()
  })

  it("puts an org-layout--<slug> hook on .org-root", async () => {
    const html = await render("#+HTML_LAYOUT: magazine\n\nBody.")
    expect(html).toContain('<div class="org-root org-layout--magazine">')
  })

  it("leaves .org-root untouched when no layout is set", async () => {
    const html = await render("Body only.")
    expect(html).toContain('<div class="org-root">')
    expect(html).not.toContain("org-layout--")
  })

  it("ships per-layout CSS for all 8 layouts", () => {
    for (const lay of LAYOUTS) {
      expect(STYLES, `missing .org-layout--${lay}`).toContain(`.org-layout--${lay}`)
    }
  })

  it("ships the template chrome classes (CHR-002…006)", () => {
    for (const cls of [
      ".org-nav",
      ".org-brand",
      ".org-breadcrumb",
      ".org-statusbar",
      ".org-footer",
      ".org-footer-bar",
      ".org-cover",
      ".org-cover-ribbon",
    ]) {
      expect(STYLES, `missing chrome class ${cls}`).toContain(cls)
    }
  })
})
