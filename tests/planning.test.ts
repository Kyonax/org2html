import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/planning.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1C planning lines + clock entries", () => {
  it("attaches ordered planning entries + clock lines to the owning headline", () => {
    const ast = parse(src)
    const ship = ast.children.find((n) => n.type === "heading")!
    const planning = ship.properties?.planning as Array<{ keyword: string; datetime: string }>
    // A combined line keeps source order: DEADLINE then SCHEDULED.
    expect(planning.map((p) => p.keyword)).toEqual(["DEADLINE", "SCHEDULED"])
    expect(planning[0].datetime).toBe("2026-07-20")
    // The bare CLOCK: line rode onto the same headline, not a paragraph.
    expect(ship.properties?.clock).toHaveLength(1)
    expect(ship.children?.some((c) => c.type === "paragraph")).toBe(true)
  })

  it("renders planning under #+OPTIONS: p:t with the .org-planning hook", async () => {
    const html = await render(src)
    expect(html).toContain('<p class="org-planning">')
    // Keyword spans in source order.
    const deadlineAt = html.indexOf('org-planning-keyword">DEADLINE:')
    const scheduledAt = html.indexOf('org-planning-keyword">SCHEDULED:')
    expect(deadlineAt).toBeGreaterThan(-1)
    expect(scheduledAt).toBeGreaterThan(deadlineAt)
    // Each timestamp is a coordinate-tag <time> with an ISO datetime.
    expect(html).toContain('<time class="org-timestamp" datetime="2026-07-20">')
    // CLOSED uses an inactive [..] timestamp.
    expect(html).toContain("org-timestamp--inactive")
  })

  it("preserves a repeater/warning cookie inside the timestamp text", async () => {
    const html = await render(src)
    expect(html).toContain("+1w")
  })

  it("renders clock entries into an .org-logbook under #+OPTIONS: c:t", async () => {
    const html = await render(src)
    expect(html).toContain('<div class="org-logbook">')
    expect(html).toContain('<p class="org-clock">')
    expect(html).toContain("1:30")
  })

  it("suppresses planning + clock by default and never leaks them as paragraphs", async () => {
    // Same constructs, but without the p:/c: opt-ins (Org's default is off).
    const org = [
      "* Task",
      "DEADLINE: <2026-07-20 Mon>",
      "CLOCK: [2026-07-01 Wed 09:00]--[2026-07-01 Wed 10:30] =>  1:30",
      "",
      "Body.",
    ].join("\n")
    const html = await render(org)
    expect(html).not.toContain("org-planning")
    expect(html).not.toContain("org-logbook")
    // The raw keyword text must not survive as a paragraph.
    expect(html).not.toContain("DEADLINE:")
    expect(html).not.toContain("CLOCK:")
    expect(html).toContain('<p class="org-paragraph">Body.</p>')
  })
})
