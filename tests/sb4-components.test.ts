/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse, renderToHtml } from "../src/index.js"

const STYLES = readFileSync(join(__dirname, "..", "templates", "styles.css"), "utf-8")

// The 35 unique data-component names behind the 38 CMP rows (input/modal/error
// each carry two variants under one name).
const COMPONENTS = [
  "button", "card", "stat-grid", "callout", "kbd", "command", "terminal",
  "file-tree", "diagram", "input", "search", "select", "textarea", "toggle",
  "tabs", "newsletter", "modal", "toast", "tooltip", "accordion", "pagination",
  "skeleton", "spinner", "progress", "empty", "error", "avatar-group", "badge",
  "back-to-top", "read-progress", "gallery", "carousel", "lightbox", "reticle",
  "connector",
]

describe("Phase SB-4 — component default static looks (CMP-001…038)", () => {
  it("ships a [data-component] default-look rule for every component name", () => {
    for (const name of COMPONENTS) {
      expect(STYLES, `missing default look for [data-component="${name}"]`).toContain(
        `[data-component="${name}"]`,
      )
    }
  })

  it("ships the key variant / state / size looks keyed on data-*", () => {
    for (const sel of [
      '[data-component="button"][data-variant="outline"]',
      '[data-component="button"][data-size="lg"]',
      '[data-component="button"][data-state="loading"]',
      '[data-component="input"][data-state="error"]',
      '[data-component="modal"][data-variant="alert"]',
      '[data-component="error"][data-variant="offline"]',
      '[data-component="progress"][data-variant="indeterminate"]',
    ]) {
      expect(STYLES, `missing variant look ${sel}`).toContain(sel)
    }
  })

  it("mirrors styling attrs to data-* so they survive sanitization (SB-4)", async () => {
    const { html } = await renderToHtml(
      parse('Intro.\n\n{{< button variant="primary" size="lg" label="Save" >}}\n'),
      { sanitize: true },
    )
    expect(html).toContain('data-component="button"')
    expect(html).toContain('data-variant="primary"')
    expect(html).toContain('data-size="lg"')
    expect(html).toContain('data-label="Save"')
  })

  it("parses hyphenated inline component names (stat-grid, avatar-group, back-to-top)", async () => {
    // Regression: the inline {{< >}} lexer captured \w+ and truncated names at the
    // first hyphen, so stat-grid → "stat". Names are [\w-]+.
    for (const name of ["stat-grid", "avatar-group", "back-to-top", "file-tree", "read-progress"]) {
      const { html } = await renderToHtml(parse(`Intro.\n\n{{< ${name} >}}\n`), { sanitize: true })
      expect(html, `hyphenated name ${name}`).toContain(`data-component="${name}"`)
    }
  })

  it("keeps hydration props intact — the plain attr twin still rides for the Vue generator", async () => {
    // The bare `variant` twin (read by the Vue generator as a prop) is emitted
    // pre-sanitize alongside the data-* mirror.
    const { html } = await renderToHtml(
      parse('Intro.\n\n{{< button variant="primary" label="Go" >}}\n'),
      { sanitize: false },
    )
    expect(html).toContain('variant="primary"')
    expect(html).toContain('data-variant="primary"')
  })
})
