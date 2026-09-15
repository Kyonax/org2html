import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { JSDOM } from "jsdom"
import axe from "axe-core"
import { org2html } from "../src/index.js"

const fixture = readFileSync(join(__dirname, "fixtures", "all-constructs.org"), "utf-8")

// Run axe-core over a rendered document inside jsdom. Layout-dependent rules
// (color-contrast) cannot run without a real layout engine, so they are disabled;
// the structural WCAG rules (landmarks, headings, alt text, roles, labels) run.
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

describe("Phase 8 — axe-core ADA gate", () => {
  it("the full rendered document has zero structural axe violations", async () => {
    const { html } = await org2html(fixture, { codeHighlight: false })
    const violations = await axeViolations(html)
    if (violations.length > 0) {
      // Surface a readable summary on failure.
      const summary = violations.map((v) => `${v.id}: ${v.help}`).join("\n")
      throw new Error(`axe violations:\n${summary}`)
    }
    expect(violations).toEqual([])
  }, 20000)
})
