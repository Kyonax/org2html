/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const REF = readFileSync(
  join(__dirname, "..", "templates", "style-book", "reference.html"),
  "utf-8",
)

describe("Style-book reference.html — the hand-authored class/component catalog", () => {
  it("is standalone HTML (not an org conversion) and loads the live assets", () => {
    expect(REF).toContain("<!DOCTYPE html>")
    expect(REF).toContain('<link rel="stylesheet" href="/styles.css">')
    expect(REF).toContain('<script src="/o2h.js" defer>')
    // it renders through .org-root so the design-system styles apply
    expect(REF).toContain('class="org-root ref-main"')
  })

  it("labels every category with its NAME + CSS selector", () => {
    for (const label of [
      "--o2h-signal-500",
      ".org-callout--danger",
      ".org-src-block",
      '[data-component="button"]',
      '[data-component="carousel"]',
      ".org-deco-ribbon",
      ".org-nav",
      ".org-layout--magazine",
      '[data-o2h="tabs"]',
    ]) {
      expect(REF, `reference missing selector label: ${label}`).toContain(label)
    }
  })

  it("catalogs all 35 component names", () => {
    const names = [
      "accordion", "avatar-group", "back-to-top", "badge", "button", "callout", "card",
      "carousel", "command", "connector", "diagram", "empty", "error", "file-tree",
      "gallery", "input", "kbd", "lightbox", "modal", "newsletter", "pagination",
      "progress", "read-progress", "reticle", "search", "select", "skeleton", "spinner",
      "stat-grid", "tabs", "terminal", "textarea", "toggle", "tooltip",
    ]
    for (const n of names) {
      expect(REF, `reference missing component: ${n}`).toContain(`data-component="${n}"`)
    }
  })
})
