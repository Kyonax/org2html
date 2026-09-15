/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/authored-emphasis.test.ts — the two authoring surfaces added for
 * comparison content (2026-09-04): `#+ATTR_O2H: :highlight-col / :highlight-row`
 * for pointing at the column or row a table exists to argue for, and
 * `#+BEGIN_TABS` / `#+TAB:` for putting several tables or charts in one slot.
 *
 * Both are AUTHOR-FACING syntax, so what is locked here is the contract an author
 * writes against: 1-based indices over the table as written, body rows only, a
 * value channel that cannot carry markup, and — the property that matters most —
 * every tab panel present in the served HTML rather than hidden behind script.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

const render = async (org: string) =>
  (await renderToHtml(parse(org), { fullDocument: false })).html

const TABLE = `#+TITLE: T

#+ATTR_O2H: :highlight-col 2 :highlight-row 2
| Benchmark | Grok  | Fable |
|-----------+-------+-------|
| AA Index  |    61 |    62 |
| GDPVal    |  1753 |  1741 |
`

describe("#+ATTR_O2H — table highlights", () => {
  it("marks every cell of a highlighted COLUMN, header included", async () => {
    const html = await render(TABLE)
    expect(html).toContain('<th scope="col" class="org-cell--highlight">Grok</th>')
    // Both body rows carry the mark in column 2, and nowhere else.
    expect(html.match(/org-cell--highlight/g)?.length).toBe(3)
    expect(html).not.toContain('<th scope="col" class="org-cell--highlight">Benchmark</th>')
  })

  it("counts rows over the BODY only — a header is not row 1, a rule is not a row", async () => {
    const html = await render(TABLE)
    // :highlight-row 2 must select GDPVal (the 2nd body row), never AA Index.
    const rows = html.split("<tr")
    expect(rows.find((r) => r.includes("GDPVal"))).toContain('class="org-row--highlight"')
    expect(rows.find((r) => r.includes("AA Index"))).not.toContain("org-row--highlight")
  })

  it("ignores an index that is not a positive integer instead of coercing it", async () => {
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :highlight-col two :highlight-row 0
| A | B |
|---+---|
| 1 | 2 |
`)
    expect(html).not.toContain("org-cell--highlight")
    expect(html).not.toContain("org-row--highlight")
  })

  it("refuses a value carrying markup, so the channel cannot reach an attribute", async () => {
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :highlight-col "><script>alert(1)</script>
| A | B |
|---+---|
| 1 | 2 |
`)
    expect(html).not.toContain("<script")
    expect(html).not.toContain("org-cell--highlight")
  })

  it(":highlight-cell picks ONE cell by <col>.<row>", async () => {
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :highlight-cell 2.2
| Model | A  | B  |
|-------+----+----|
| one   | 10 | 11 |
| two   | 20 | 21 |
`)
    // Column 2, body row 2 → the cell holding 20, and nothing else on the page.
    expect(html.match(/org-cell--highlight/g)?.length).toBe(1)
    expect(html).toContain('<td class="org-cell--highlight">20</td>')
    // A single cell is not a column, so the header keeps its plain frame.
    expect(html).not.toContain('<th scope="col" class="org-cell--highlight">')
  })

  it(":highlight-cell takes a list, and ignores a coordinate it cannot read", async () => {
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :highlight-cell 2.1,3.2,nine,4.4
| Model | A  | B  |
|-------+----+----|
| one   | 10 | 11 |
| two   | 20 | 21 |
`)
    expect(html).toContain('<td class="org-cell--highlight">10</td>')
    expect(html).toContain('<td class="org-cell--highlight">21</td>')
    // "nine" is not a coordinate and 4.4 is off the table — neither invents a cell.
    expect(html.match(/org-cell--highlight/g)?.length).toBe(2)
  })

  it("leaves a table with no #+ATTR_O2H exactly as it was", async () => {
    const html = await render(`#+TITLE: T

| A | B |
|---+---|
| 1 | 2 |
`)
    expect(html).toContain("<td>1</td>")
    expect(html).not.toContain("highlight")
  })
})

const TABS = `#+TITLE: T

#+BEGIN_TABS
#+TAB: AA Intelligence
| Model | Score |
|-------+-------|
| Grok  |    61 |
#+TAB: GDPVal-AA
Prose in the second panel.
#+END_TABS
`

describe("#+BEGIN_TABS — several alternatives in one slot", () => {
  it("ships EVERY panel in the served HTML — the runtime hides, it does not fill", async () => {
    const html = await render(TABS)
    // The no-JS / crawler / print contract: both panels are real content on the page.
    expect(html).toContain("Prose in the second panel.")
    expect(html).toContain("<td>61</td>")
    expect(html).not.toContain("hidden")
    expect(html.match(/class="org-tabpanel"/g)?.length).toBe(2)
  })

  it("wires each tab to its panel by id, with the first one selected", async () => {
    const html = await render(TABS)
    expect(html).toContain('aria-controls="org-tabs-panel-1"')
    expect(html).toContain('aria-labelledby="org-tabs-tab-1"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('aria-selected="false"')
    expect(html).toContain('data-o2h="tabs"')
  })

  it("parses a panel as a FULL body, so a tab can hold any construct", async () => {
    const html = await render(TABS)
    // A table inside a tab is a real table, not inline text.
    expect(html).toContain('<table class="org-table">')
  })

  it("gives two tab groups on one page distinct ids", async () => {
    const html = await render(`#+TITLE: T

#+BEGIN_TABS
#+TAB: One
a
#+END_TABS

#+BEGIN_TABS
#+TAB: Two
b
#+END_TABS
`)
    expect(html).toContain('id="org-tabs-panel-1"')
    expect(html).toContain('id="org-tabs-2-panel-1"')
  })

  it("holds a NESTED block without closing on the inner block's #+END_", async () => {
    // Greater blocks nest. The mismatch recovery (S1-3) used to fire on the INNER
    // closer, truncating the parent and leaving its real #+END_TABS as a stray
    // paragraph on the page.
    const html = await render(`#+TITLE: T

#+BEGIN_TABS
#+TAB: Notes
Body text.

#+BEGIN_NOTE
A nested callout.
#+END_NOTE
#+END_TABS
`)
    expect(html).toContain("org-callout--note")
    expect(html).toContain("A nested callout.")
    expect(html).not.toContain("#+END_TABS")
    expect(html).not.toContain("#+END_NOTE")
  })

  it("still recovers from a genuinely mismatched closer at its own level", async () => {
    // The S1-3 guarantee must survive the nesting fix: an unclosed block may not
    // swallow the rest of the document.
    const html = await render(`#+TITLE: T

#+BEGIN_TABS
#+TAB: One
inside
#+END_QUOTE

After the block.
`)
    expect(html).toContain("After the block.")
  })

  it("drops a TABS block that declares no #+TAB: rather than emitting an empty shell", async () => {
    const html = await render(`#+TITLE: T

#+BEGIN_TABS
orphan text with no panel to belong to
#+END_TABS
`)
    expect(html).not.toContain("org-tabs")
  })
})

const CHART = `#+TITLE: T

#+CAPTION: GDPVal-AA Elo
#+ATTR_O2H: :chart bar :highlight-row 1
| Model       |  Elo |
|-------------+------|
| Grok 4.6    | 1753 |
| Fable 5 Max | 1741 |
| Grok 4.5    | 1526 |
`

describe("#+ATTR_O2H :chart bar — a table, drawn", () => {
  it("draws at BUILD time: SVG in the markup, no script and no library", async () => {
    const html = await render(CHART)
    expect(html).toContain('<svg class="org-chart-svg"')
    expect(html).not.toContain("<script")
    expect(html).toContain('<rect')
  })

  it("keeps the source table in the document for AT, crawlers and print", async () => {
    const html = await render(CHART)
    // The picture is aria-hidden precisely BECAUSE the real table is the answer.
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('class="org-chart-data"')
    expect(html).toContain("<td>1753</td>")
    expect(html).toContain('<table class="org-table">')
  })

  it("puts the accent on the highlighted row's bar and nowhere else", async () => {
    const html = await render(CHART)
    expect(html.match(/org-chart-bar is-highlight/g)?.length).toBe(1)
    expect(html.match(/class="org-chart-bar"/g)?.length).toBe(2)
  })

  it("drops a row with no number instead of plotting it as zero", async () => {
    // A missing measurement and a measurement of zero are different claims.
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :chart bar
| Model | Score |
|-------+-------|
| A     |    10 |
| B     |   --- |
`)
    expect(html.match(/<rect/g)?.length).toBe(1)
    // …but it is still a row of the table that travels with the chart.
    expect(html).toContain("<td>B</td>")
  })

  it("keeps the accent on the right bar when an earlier row was dropped", async () => {
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :chart bar :highlight-row 3
| Model | Score |
|-------+-------|
| A     |   n/a |
| B     |    10 |
| C     |    20 |
`)
    // Row 3 is C. With A dropped, C is the SECOND bar — the accent must follow the
    // row the author named, not the slot it used to occupy.
    const bars = html.split("org-chart-bar")
    expect(bars[2]).toContain("is-highlight")
    expect(bars[2]).toContain("C")
  })

  it("reads percentages and prints the author's own text on the bar", async () => {
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :chart bar
| Model | Score |
|-------+-------|
| A     | 69.9% |
`)
    expect(html).toContain(">69.9%<")
    // The axis takes the unit too, so the scale reads as percent.
    expect(html).toContain("%<")
  })

  it("leaves a table alone when :chart names something it cannot draw", async () => {
    const html = await render(`#+TITLE: T

#+ATTR_O2H: :chart pie
| A | 1 |
`)
    expect(html).not.toContain("org-chart")
    expect(html).toContain('<table class="org-table">')
  })
})
