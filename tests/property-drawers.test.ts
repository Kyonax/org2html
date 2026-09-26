import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/property-drawers.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1C property drawers + CUSTOM_ID", () => {
  it("attaches drawer props to the owning heading", () => {
    const ast = parse(src)
    const intro = ast.children.find((n) => n.type === "heading")!
    expect(intro.properties?.customId).toBe("intro")
    expect(intro.properties?.props?.AUTHOR).toBe("Kyo")
  })

  it("uses CUSTOM_ID as the heading anchor and resolves the internal link", async () => {
    const html = await render(src)
    expect(html).toContain('id="intro"')
    // The [[#intro]] link points at the custom id.
    expect(html).toContain('href="#intro"')
    // The property drawer itself is not rendered as content.
    expect(html).not.toContain("CUSTOM_ID")
  })

  it("collapses a :LOGBOOK: drawer into a <details> accordion (MAP-046)", async () => {
    const html = await render(src)
    expect(html).toContain('<details class="org-drawer org-drawer--logbook" data-drawer="LOGBOOK">')
    expect(html).toContain("some log content")
  })

  it("S0-2: an UNCLOSED :PROPERTIES: drawer does not swallow following content", async () => {
    const html = await render("* H\n:PROPERTIES:\n:ID: x\n\nMARKER survives the unclosed drawer\n")
    expect(html).toContain("MARKER survives the unclosed drawer")
    // the parsed prop is still attached, and the drawer key never leaks as prose
    expect(html).not.toContain(":ID:")
  })

  it("S0-2: an unclosed drawer stops at the next headline, not EOF", async () => {
    const html = await render("* One\n:PROPERTIES:\n:ID: a\n* Two\nSecond section body\n")
    expect(html).toContain("Second section body")
    expect(html).toContain(">Two<") // the second headline still renders
  })
})
