/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(org: string, sanitize = false): Promise<string> {
  const { html } = await renderToHtml(parse(org), { sanitize })
  return html
}

describe("Phase SB-3 — remaining native constructs + decorations", () => {
  it("renders a >=15-star headline as a boxed inlinetask, not an <hN> (MAP-051)", async () => {
    const html = await render(
      ["Intro.", "", "*************** TODO Fix it :urgent:", "*************** END"].join("\n"),
    )
    expect(html).toContain('<div class="org-inlinetask">')
    expect(html).toContain('<span class="org-todo">TODO</span>')
    expect(html).toContain('<span class="org-tag">urgent</span>')
    // Never a real heading: no h15/outline-15, and the END marker is dropped.
    expect(html).not.toMatch(/<h1[0-9]/)
    expect(html).not.toContain("outline-15")
    expect(html).not.toContain(">END<")
  })

  it("collapses a :LOGBOOK: drawer into a <details> accordion (MAP-046)", async () => {
    const html = await render(["Log.", "", ":LOGBOOK:", "CLOCK: [2026-07-01] => 1:00", ":END:"].join("\n"))
    expect(html).toContain('<details class="org-drawer org-drawer--logbook" data-drawer="LOGBOOK">')
    expect(html).toContain('<summary class="org-drawer-summary">LOGBOOK</summary>')
  })

  it("keeps a non-LOGBOOK drawer as a plain <div class=org-drawer>", async () => {
    const html = await render(["Notes.", "", ":NOTES:", "some note", ":END:"].join("\n"))
    expect(html).toContain('<div class="org-drawer" data-drawer="NOTES">')
    expect(html).not.toContain("<details")
  })

  it("turns a quote into a pull-quote via #+ATTR_HTML :class (MAP-030 / SB-108)", async () => {
    const html = await render(
      ["Q.", "", "#+ATTR_HTML: :class org-quote--pull", "#+BEGIN_QUOTE", "Big idea.", "#+END_QUOTE"].join("\n"),
    )
    expect(html).toContain('<blockquote class="org-quote org-quote--pull">')
  })

  it("adds figure bracket-frame / hatch decorations via #+ATTR_HTML (DEC-006 / DEC-008)", async () => {
    const bracket = await render("F.\n\n#+ATTR_HTML: :class org-figure--bracket\n[[/img/a.png]]")
    expect(bracket).toContain('<figure class="org-figure org-figure--bracket">')
    const hatch = await render("F.\n\n#+ATTR_HTML: :class org-figure--hatch\n[[/img/b.png]]")
    expect(hatch).toContain('<figure class="org-figure org-figure--hatch">')
  })

  it("sanitizes #+ATTR_HTML class values to [\\w-] tokens (no attribute injection)", async () => {
    // A hostile value has no valid class token → nothing is attached.
    const html = await render(
      ["Q.", "", '#+ATTR_HTML: :class evil" onmouseover="alert(1)', "#+BEGIN_QUOTE", "x", "#+END_QUOTE"].join(
        "\n",
      ),
    )
    expect(html).toContain('<blockquote class="org-quote">')
    expect(html).not.toContain("onmouseover")
  })

  it("keeps the <details>/<summary> accordion through the sanitizer", async () => {
    const html = await render(["Log.", "", ":LOGBOOK:", "CLOCK: x", ":END:"].join("\n"), true)
    expect(html).toContain("<details")
    expect(html).toContain("<summary")
  })
})
