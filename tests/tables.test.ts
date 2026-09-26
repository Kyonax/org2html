import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/tables.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("tables", () => {
  it("emits a namespaced table with a thead/tbody split at the rule", async () => {
    const html = await render(src)
    expect(html).toContain('<table class="org-table">')
    expect(html).toContain("<thead>")
    expect(html).toContain('<th scope="col"')
    expect(html).toContain("<tbody>")
  })

  it("applies per-column alignment from the rule row's ':' markers", async () => {
    const html = await render(src)
    // Second column is right-aligned (…--:).
    expect(html).toContain('<td class="org-right">90</td>')
  })

  it("consumes #+TBLFM so it never leaks as a paragraph", async () => {
    const html = await render(src)
    expect(html).not.toContain("TBLFM")
    expect(html).not.toContain("vsum")
  })

  it("parses a table.el +--+ table, treating borders as rules", () => {
    const ast = parse(src)
    const tables = ast.children.filter((n) => n.type === "table")
    expect(tables.length).toBe(2)
    const tableEl = tables[1]
    // The +---+ border rows are rules, not content rows.
    expect(tableEl.children!.length).toBe(1)
    expect(tableEl.children![0].children!.map((c: any) => c.type)).toEqual([
      "tableCell",
      "tableCell",
    ])
  })
})

/*
 * THE SCROLL FRAME. A table cannot be laid out below its min-content width, so on a narrow
 * screen it either overflows the PAGE or squeezes its columns until the words break a
 * character at a time. The frame moves that overflow off the page and onto the table.
 */
describe("a table scrolls instead of being crushed", () => {
  const render = async (org: string) => {
    const { html } = await renderToHtml(parse(org), { sanitize: false, codeHighlight: false })
    return html
  }

  it("wraps every table in a scroll frame", async () => {
    const html = await render("| a | b |\n|---+---|\n| 1 | 2 |\n")
    expect(html).toContain('<div class="org-table-scroll">')
    expect(html).toContain('<table class="org-table">')
  })

  it("moves a BREAKOUT onto the frame and leaves every other authored class on the table", async () => {
    // The breakout sizes the box against the viewport. Left on the table it would size a
    // child inside a parent still the width of the prose — a page-wide horizontal scroll.
    const wide = await render("#+ATTR_HTML: :class org-wide\n| a |\n| 1 |\n")
    expect(wide).toContain('<div class="org-table-scroll org-wide">')
    expect(wide).toContain('<table class="org-table">')

    const mixed = await render("#+ATTR_HTML: :class org-full-bleed ledger\n| a |\n| 1 |\n")
    expect(mixed).toContain('<div class="org-table-scroll org-full-bleed">')
    expect(mixed).toContain('<table class="org-table ledger">')
  })

  it("does NOT frame a chart's source table, which is clipped to one pixel", async () => {
    const chart = await render(
      "#+ATTR_O2H: :chart bar\n| Model | Score |\n|-------+-------|\n| A | 10 |\n| B | 20 |\n",
    )
    expect(chart).toContain('class="org-chart-data"')
    expect(chart).not.toContain("org-table-scroll")
  })

  it("puts the #+NAME anchor on the frame, so a [[name]] jump lands on the whole table", async () => {
    const html = await render("#+NAME: budget\n| a |\n| 1 |\n")
    expect(html).toContain('<div id="budget" class="org-table-scroll">')
  })
})
