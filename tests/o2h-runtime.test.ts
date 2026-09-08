/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { JSDOM } from "jsdom"
import { applyTemplate } from "../src/index.js"

const O2H = readFileSync(join(__dirname, "..", "templates", "o2h.js"), "utf-8")

/** Boot o2h.js over a body fragment in a fresh JSDOM and return handles. */
function run(bodyHtml: string) {
  const dom = new JSDOM(`<!DOCTYPE html><body><div class="org-root">${bodyHtml}</div></body>`, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
  })
  const win = dom.window as any
  const copied: string[] = []
  win.navigator.clipboard = { writeText: (t: string) => (copied.push(t), Promise.resolve()) }
  const script = win.document.createElement("script")
  script.textContent = O2H
  win.document.body.appendChild(script)
  // In a real browser the deferred script boots at readyState 'interactive'; in
  // JSDOM the appended script sees 'loading' and defers to an already-fired
  // DOMContentLoaded, so trigger the exposed boot to mirror real behaviour.
  win.O2H.enhance()
  return { win, doc: win.document as Document, copied }
}

const CODE_BLOCK =
  '<div class="org-src-block"><div class="org-src-header">' +
  '<button class="org-src-copy" type="button">COPY</button></div>' +
  "<pre class=\"org-src\"><code>const answer = 42</code></pre></div>"

describe("o2h.js — the default interactive runtime", () => {
  it("copies a code block's text when its COPY button is clicked", () => {
    const { doc, copied } = run(CODE_BLOCK)
    const btn = doc.querySelector(".org-src-copy") as HTMLElement
    btn.click()
    expect(copied).toContain("const answer = 42")
  })

  it("flips a toggle component's state on click", () => {
    const { doc } = run('<div data-component="toggle" data-state="off"></div>')
    const t = doc.querySelector('[data-component="toggle"]') as HTMLElement
    expect(t.getAttribute("data-state")).toBe("off")
    t.click()
    expect(t.getAttribute("data-state")).toBe("on")
    expect(t.getAttribute("aria-checked")).toBe("true")
  })

  it("opens a lightbox overlay when a figure image is clicked", () => {
    const { doc } = run('<figure class="org-figure"><img src="/a.png" alt="A"></figure>')
    expect(doc.querySelector(".org-lightbox-overlay")).toBeNull()
    ;(doc.querySelector(".org-figure img") as HTMLElement).click()
    expect(doc.querySelector(".org-lightbox-overlay")).not.toBeNull()
  })

  it("switches tab panels", () => {
    const { doc } = run(
      '<div data-o2h="tabs"><div role="tablist">' +
        '<button data-tab="a">A</button><button data-tab="b">B</button></div>' +
        '<div data-panel="a">PA</div><div data-panel="b">PB</div></div>',
    )
    const panelA = doc.querySelector('[data-panel="a"]') as HTMLElement
    const panelB = doc.querySelector('[data-panel="b"]') as HTMLElement
    expect(panelA.hidden).toBe(false)
    expect(panelB.hidden).toBe(true)
    ;(doc.querySelector('[data-tab="b"]') as HTMLElement).click()
    expect(panelA.hidden).toBe(true)
    expect(panelB.hidden).toBe(false)
  })

  it("opens and Esc-closes a modal", () => {
    const { win, doc } = run(
      '<button data-o2h-open="m">open</button>' +
        '<div data-o2h="modal" id="m"><div>body</div></div>',
    )
    const modal = doc.getElementById("m") as HTMLElement
    expect(modal.classList.contains("is-open")).toBe(false)
    ;(doc.querySelector("[data-o2h-open]") as HTMLElement).click()
    expect(modal.classList.contains("is-open")).toBe(true)
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }))
    expect(modal.classList.contains("is-open")).toBe(false)
  })

  it("is idempotent — a second boot does not double-wire", () => {
    const { win, doc, copied } = run(CODE_BLOCK)
    win.O2H.enhance() // re-scan
    ;(doc.querySelector(".org-src-copy") as HTMLElement).click()
    expect(copied.length).toBe(1) // one copy, not two
  })
})

describe("o2h.js wiring — referenced by default, dropped with --no-scripts", () => {
  it("references /o2h.js by default and omits it when linkDefaultScripts is false", async () => {
    const on = await applyTemplate("<p>x</p>", { title: "T" })
    expect(on).toContain('<script src="/o2h.js" defer></script>')
    const off = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      linkDefaultScripts: false,
    })
    // Assert the absence of the TAG, not of the substring. The default sheet is inlined
    // into the page and its comments name the runtime file they pair with, so a bare
    // "/o2h.js" search matches prose in a CSS comment and fails on a docs edit.
    expect(off).not.toContain('<script src="/o2h.js"')
  })
})
