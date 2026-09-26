/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { JSDOM } from "jsdom"
import axe from "axe-core"
import { org2html } from "../src/index.js"

const showcase = readFileSync(join(__dirname, "fixtures", "showcase.org"), "utf-8")

// The 35 unique component names the showcase must actually render (authoring path,
// not just CSS existence) — the exhaustive coverage the SB-6 goal asked for.
const COMPONENTS = [
  "accordion", "avatar-group", "back-to-top", "badge", "button", "callout", "card",
  "carousel", "command", "connector", "diagram", "empty", "error", "file-tree",
  "gallery", "input", "kbd", "lightbox", "modal", "newsletter", "pagination",
  "progress", "read-progress", "reticle", "search", "select", "skeleton", "spinner",
  "stat-grid", "tabs", "terminal", "textarea", "toggle", "tooltip",
]

// Structural WCAG rules only (color-contrast needs a real layout engine).
async function axeViolations(html: string): Promise<any[]> {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true })
  const { window } = dom as any
  window.eval(axe.source)
  const results = await window.axe.run(window.document, {
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  })
  return results.violations
}

describe("Phase SB-6 — exhaustive Style Book showcase", () => {
  it("renders every SB object without throwing", async () => {
    const { html } = await org2html(showcase, { codeHighlight: false })
    expect(html).toContain("org-root")
  })

  it("applies the #+HTML_LAYOUT hook and carries construct + component + chrome hooks", async () => {
    const { html } = await org2html(showcase, { codeHighlight: false })
    for (const hook of [
      "org-layout--magazine",
      "org-nav",
      "org-breadcrumb",
      "org-quote--pull",
      "org-callout--danger",
      "org-inlinetask",
      "org-drawer--logbook",
      "org-figure--bracket",
      'data-component="button"',
      'data-component="terminal"',
      'data-component="error"',
      "org-footer-bar",
      "org-deco-ribbon",
    ]) {
      expect(html, `missing showcase hook: ${hook}`).toContain(hook)
    }
  })

  it("actually renders all 35 component names via the authoring path", async () => {
    const { html } = await org2html(showcase, { codeHighlight: false })
    for (const name of COMPONENTS) {
      expect(html, `showcase does not render [data-component="${name}"]`).toContain(
        `data-component="${name}"`,
      )
    }
  })

  it("has zero structural axe violations across the whole showcase", async () => {
    const { html } = await org2html(showcase, { codeHighlight: false })
    const violations = await axeViolations(html)
    if (violations.length > 0) {
      const summary = violations.map((v) => `${v.id}: ${v.help}`).join("\n")
      throw new Error(`axe violations:\n${summary}`)
    }
    expect(violations).toEqual([])
    /*
     * A BUDGET SIZED FOR THE INSTRUMENTED RUN. A full axe pass over the whole showcase takes
     * ~8s uninstrumented, but v8 coverage roughly triples it — so under `npm run
     * test:coverage` this was the one test that blew its 20s budget, and it took the entire
     * coverage run down with it. That is why the 80% thresholds had never actually been
     * enforced: the command that checks them could not finish. Raised only here; every other
     * test keeps the global budget.
     */
  }, 60000)
})
