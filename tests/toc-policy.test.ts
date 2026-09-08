/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/toc-policy.test.ts — the author-driven TOC contract + :noexport:.
 *
 * The engine never volunteers a TOC. It appears only when the document opts
 * in: an explicit #+OPTIONS toc:t / toc:N, or a :toc:-tagged headline (the
 * toc-org convention) acting as a SLOT — its hand-written link list is
 * discarded and the generated .org-toc card represents it. toc:nil and a
 * :toc:noexport: slot silence it. A :noexport:-tagged subtree is excluded
 * from every output surface, as ox.el does.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(src: string): Promise<string> {
  const { html } = await renderToHtml(parse(src), {})
  return html
}

describe("TOC policy — author-driven, never volunteered", () => {
  it("emits NO toc when the document neither sets toc: nor carries a :toc: slot", async () => {
    const html = await render("#+TITLE: T\n\n* One\n\n* Two\n")
    expect(html).not.toContain('class="org-toc"')
  })

  it("explicit #+OPTIONS: toc:t emits the generated card", async () => {
    const html = await render("#+TITLE: T\n#+OPTIONS: toc:t\n\n* One\n\n* Two\n")
    expect(html).toContain('class="org-toc"')
  })

  it("a :toc: slot headline turns the card on and is itself replaced by it", async () => {
    const html = await render(
      "#+TITLE: T\n\n* TABLE OF CONTENTs :toc:\n- [[#one][One]]\n\n* One\n\n* Two\n"
    )
    expect(html).toContain('class="org-toc"')
    // The slot section is gone: no heading, no tag chip, no hand-written list.
    expect(html).not.toContain("TABLE OF CONTENTs")
    expect(html).not.toContain('class="org-tag"')
    // The generated card lists only real content headings.
    expect(html).toContain(">One<")
    expect(html).toContain(">Two<")
  })

  it("the :TOC: tag matches case-insensitively", async () => {
    const html = await render("#+TITLE: T\n\n* Contents :TOC:\n\n* One\n")
    expect(html).toContain('class="org-toc"')
    expect(html).not.toContain(">Contents<")
  })

  it("a :toc:noexport: slot silences the TOC entirely", async () => {
    const html = await render(
      "#+TITLE: T\n\n* TABLE OF CONTENTs :toc:noexport:\n- [[#one][One]]\n\n* One\n"
    )
    expect(html).not.toContain('class="org-toc"')
    expect(html).not.toContain("TABLE OF CONTENTs")
  })

  it("#+OPTIONS: toc:nil wins over a :toc: slot", async () => {
    const html = await render(
      "#+TITLE: T\n#+OPTIONS: toc:nil\n\n* TABLE OF CONTENTs :toc:\n\n* One\n"
    )
    expect(html).not.toContain('class="org-toc"')
    expect(html).not.toContain("TABLE OF CONTENTs")
  })

  it("explicit toc:t still prints when the slot is :noexport:-silenced", async () => {
    const html = await render(
      "#+TITLE: T\n#+OPTIONS: toc:t\n\n* Contents :toc:noexport:\n\n* One\n"
    )
    expect(html).toContain('class="org-toc"')
    expect(html).not.toContain(">Contents<")
  })
})

describe(":noexport: subtrees", () => {
  it("drops a :noexport: section from the body", async () => {
    const html = await render(
      "#+TITLE: T\n\n* Public\n\nShown.\n\n* Secret :noexport:\n\nHidden.\n"
    )
    expect(html).toContain("Shown.")
    expect(html).not.toContain("Secret")
    expect(html).not.toContain("Hidden.")
  })

  it("drops nested subtrees and keeps them out of a generated TOC", async () => {
    const html = await render(
      "#+TITLE: T\n#+OPTIONS: toc:t\n\n* Public\n\n** Draft :noexport:\n\nWip.\n\n** Final\n\nDone.\n"
    )
    expect(html).not.toContain("Draft")
    expect(html).not.toContain("Wip.")
    expect(html).toContain("Final")
    const toc = html.slice(html.indexOf('class="org-toc"'), html.indexOf("</nav>"))
    expect(toc).toContain("Public")
    expect(toc).toContain("Final")
    expect(toc).not.toContain("Draft")
  })
})
