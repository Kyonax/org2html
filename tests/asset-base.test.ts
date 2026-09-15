/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/asset-base.test.ts — --asset-base and the font pipeline.
 *
 * Two defects meet here, and both were invisible from inside this repository.
 *
 * SUB-PATH DEPLOYS WERE BROKEN. Every asset the engine references is root-absolute, so any
 * deploy that is not at a domain root — a GitHub Pages project site, a preview URL, a docs
 * subdirectory — 404s on all of them. --asset-base prefixes them, and DEFAULTS TO A NO-OP:
 * if output moves at the default base, the normalisation is wrong ([#45]).
 *
 * THE FONTS 404'D ON EVERY REAL INSTALL. templates/fonts/ exists in this repo but is excluded
 * from the tarball, because org2html does not redistribute Geomanist or the Nerd-patched Space
 * Mono ([#41]). The template preloaded two of them unconditionally and the book declared four
 * @font-face — so a consumer got two preload 404s plus four dead faces per page, silently,
 * while every test in this repository passed because the files were here.
 */

import { describe, expect, it } from "vitest"
import {
  assetUrl,
  normaliseAssetBase,
  pruneMissingFontFaces,
  rewriteCssAssetUrls,
} from "../src/renderer/template.js"

describe("--asset-base — normalisation", () => {
  it("treats empty, undefined and a bare slash as NO BASE", () => {
    /* The default must be a true no-op: anything else silently rewrites every existing
     * consumer's output the moment they upgrade. */
    for (const input of ["", "   ", "/", undefined, null]) {
      expect(normaliseAssetBase(input as string | undefined)).toBe("")
    }
  })

  it("strips a trailing slash but keeps the leading one", () => {
    expect(normaliseAssetBase("/my-project/")).toBe("/my-project")
    expect(normaliseAssetBase("/my-project")).toBe("/my-project")
    expect(normaliseAssetBase("/a/b///")).toBe("/a/b")
  })

  it("adds the leading slash a bare prefix needs", () => {
    /* Without it "my-project/styles.css" resolves against whatever directory the page
     * happens to sit in, which is a different file on every route. */
    expect(normaliseAssetBase("my-project")).toBe("/my-project")
  })

  it("accepts an absolute origin, because a CDN is a legitimate asset base", () => {
    expect(normaliseAssetBase("https://cdn.example.com/assets/")).toBe(
      "https://cdn.example.com/assets",
    )
  })
})

describe("--asset-base — application", () => {
  it("is an identity function at the default base", () => {
    expect(assetUrl("/styles.css", "")).toBe("/styles.css")
    expect(rewriteCssAssetUrls("a{background:url('/x.png')}", "")).toBe(
      "a{background:url('/x.png')}",
    )
  })

  it("prefixes root-absolute css url()s in every quoting style", () => {
    const css = `@font-face{src:url('/fonts/a.woff2')}
.b{background:url("/img/b.png")}
.c{background:url(/img/c.png)}`
    const out = rewriteCssAssetUrls(css, "/base")
    expect(out).toContain("url('/base/fonts/a.woff2')")
    expect(out).toContain('url("/base/img/b.png")')
    expect(out).toContain("url(/base/img/c.png)")
  })

  it("leaves protocol-relative, absolute and data URLs alone", () => {
    /* //cdn/x already names a host, https://x names one explicitly, and a data: URI has no
     * path at all — prefixing any of them produces a URL that resolves nowhere. */
    const css = `.a{background:url(//cdn.example.com/x.png)}
.b{background:url(https://example.com/y.png)}
.c{background:url(data:image/svg+xml;base64,AAAA)}
.d{background:url(./relative.png)}`
    expect(rewriteCssAssetUrls(css, "/base")).toBe(css)
  })
})

describe("fonts — the engine ships none, so it preloads none it cannot see", () => {
  const face = (name: string) =>
    `@font-face {\n  font-family: X;\n  src: url('/fonts/${name}') format('woff2');\n}`

  it("keeps a face that was copied", () => {
    const css = face("Body.woff2")
    expect(pruneMissingFontFaces(css, ["Body.woff2"])).toBe(css)
  })

  it("drops a face that was NOT copied", () => {
    /* A browser fetches an @font-face the moment a glyph needs it, so a rule naming a file
     * the build never wrote is a 404 — just later, and harder to attribute, than a preload. */
    expect(pruneMissingFontFaces(face("Missing.woff2"), []).trim()).toBe("")
  })

  it("drops only the missing faces from a mixed sheet, and keeps other rules", () => {
    const css = `${face("Body.woff2")}\n${face("Gone.woff2")}\n.p{color:red}`
    const out = pruneMissingFontFaces(css, ["Body.woff2"])
    expect(out).toContain("Body.woff2")
    expect(out).not.toContain("Gone.woff2")
    expect(out).toContain(".p{color:red}")
  })

  it("never touches a face the engine cannot verify", () => {
    /* A book pointing at a CDN or a data: URI is making a claim this function has no way to
     * check, and silently deleting it would break a setup that works. */
    const remote = "@font-face {\n  src: url('https://cdn.example.com/x.woff2');\n}"
    expect(pruneMissingFontFaces(remote, [])).toBe(remote)
    const data = "@font-face {\n  src: url(data:font/woff2;base64,AAAA);\n}"
    expect(pruneMissingFontFaces(data, [])).toBe(data)
  })
})
