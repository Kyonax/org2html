import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/links.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1B links", () => {
  it("renders a described bracket link with the org-link hook", async () => {
    const html = await render(src)
    expect(html).toContain(
      '<a class="org-link" href="https://example.com" rel="noopener noreferrer" target="_blank">Example',
    )
  })

  it("marks external web links with rel/target and an external glyph", async () => {
    const html = await render(src)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('<span class="org-link-external" aria-hidden="true">↗</span>')
  })

  it("resolves an internal *Heading link to the heading's slug", async () => {
    const html = await render(src)
    expect(html).toContain('href="#target-heading"')
  })

  it("keeps a #custom-id link as-is", async () => {
    const html = await render(src)
    expect(html).toContain('href="#my-anchor"')
  })

  it("turns a file: image target into a lazy .org-image", async () => {
    const html = await render(src)
    expect(html).toContain('<img class="org-image" src="/img/photo.png"')
    expect(html).toContain('loading="lazy"')
  })

  it("autolinks a bare http URL and an angle link", async () => {
    const html = await render(src)
    expect(html).toContain('href="http://plain.example.org/path"')
    expect(html).toContain('href="https://angle.example.net"')
  })
})
