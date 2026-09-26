/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parse, renderToHtml, applyTemplate } from "../src/index.js"

const STYLES = readFileSync(join(__dirname, "..", "templates", "styles.css"), "utf-8")

async function render(org: string, sanitize = true): Promise<string> {
  const { html } = await renderToHtml(parse(org), { sanitize })
  return html
}

describe("Media — YouTube embed, title bleed, carousel", () => {
  it("turns a {{< youtube >}} shortcode into a privacy-mode FACADE (D-05)", async () => {
    // The player is NOT in the page: a poster and a play target are, and the runtime
    // mounts the privacy-mode frame on click. Nothing is fetched from the video host
    // until the reader asks — which is the whole point of a facade.
    const html = await render('x\n\n{{< youtube id="dQw4w9WgXcQ" title="Demo" >}}')
    expect(html).toContain('class="org-embed org-embed--youtube"')
    expect(html).toContain('data-embed="youtube"')
    expect(html).toContain(
      'data-embed-src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1"',
    )
    expect(html).toContain('data-embed-title="Demo"')
    expect(html).toContain('class="org-embed-facade"')
    expect(html).toContain('class="org-embed-poster"')
    expect(html).not.toContain("<iframe")
  })

  it("names the platform below the frame, as a link back to the source", async () => {
    const bare = await render('x\n\n{{< youtube id="dQw4w9WgXcQ" >}}')
    // A LINK, not a watermark, and the platform is a mark the sheet masks in rather
    // than a colour swatch (never colour alone).
    expect(bare).toContain('<a class="org-embed-badge" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"')
    expect(bare).toContain('class="org-embed-brand" data-brand="youtube"')
    expect(bare).toContain('<span class="org-embed-source">YouTube</span>')
    expect(bare).not.toContain("org-embed-channel")

    const named = await render('x\n\n{{< youtube id="dQw4w9WgXcQ" channel="Kyonax" >}}')
    expect(named).toContain('<span class="org-embed-channel">Kyonax</span>')
  })

  it("extracts the video id from common YouTube URL forms", async () => {
    for (const form of [
      "https://youtu.be/abc123DEF45",
      "https://www.youtube.com/watch?v=abc123DEF45",
      "https://www.youtube.com/embed/abc123DEF45",
    ]) {
      const html = await render(`x\n\n{{< youtube id="${form}" >}}`)
      expect(html, form).toContain("embed/abc123DEF45")
    }
  })

  it("emits nothing for a missing / malformed video id", async () => {
    const html = await render('x\n\n{{< youtube id="nope" >}}')
    expect(html).not.toContain("org-embed--youtube")
    expect(html).not.toContain("<iframe")
  })

  it("STRIPS any non-YouTube iframe (the security boundary)", async () => {
    const html = await render(
      'x\n\n#+BEGIN_EXPORT html\n<iframe src="https://evil.example.com/x"></iframe>\n#+END_EXPORT',
    )
    expect(html).not.toContain("evil.example.com")
    expect(html).not.toContain("<iframe")
  })

  it("keeps a hand-written YouTube iframe (valid src) through the sanitizer", async () => {
    const html = await render(
      'x\n\n#+BEGIN_EXPORT html\n<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>\n#+END_EXPORT',
    )
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ")
  })

  it("turns an {{< x >}} shortcode into the SAME facade, with no iframe in the page", async () => {
    const html = await render(
      'x\n\n{{< x src="https://x.com/kyonax_on_tech/status/2094691954227400762/video/1"' +
      ' video="https://video.twimg.com/x.mp4" >}}',
    )
    expect(html).toContain('class="org-embed org-embed--x"')
    // With :video it rides the SAME data-embed="video" channel a local file uses, so the
    // runtime mounts a real <video> — no iframe is ever involved for an X embed.
    expect(html).toContain('data-embed="video"')
    expect(html).toContain('data-embed-src="https://video.twimg.com/x.mp4"')
    expect(html).not.toContain("<iframe")
  })

  it("reads the @handle out of the post URL so it is not typed twice", async () => {
    const html = await render(
      'x\n\n{{< x src="https://x.com/kyonax_on_tech/status/2094691954227400762/video/1" >}}',
    )
    expect(html).toContain('data-brand="x"')
    expect(html).toContain("@kyonax_on_tech")
    // The permalink is REBUILT from the validated id, never echoed from author input.
    expect(html).toContain('href="https://x.com/i/status/2094691954227400762"')
  })

  it("accepts a bare post id and a twitter.com URL, and drops a bad poster", async () => {
    const bare = await render('x\n\n{{< x id="2094691954227400762" poster="javascript:alert(1)" >}}')
    expect(bare).toContain("org-embed--x")
    expect(bare).not.toContain("javascript:")
    expect(bare).not.toContain("org-embed-poster")
    const legacy = await render('x\n\n{{< x src="https://twitter.com/someone/status/123456789" >}}')
    expect(legacy).toContain('href="https://x.com/i/status/123456789"')
  })

  it("emits nothing for a post id on ANOTHER host (the anchored-host boundary)", async () => {
    // Unanchored, "evil.example/x.com/u/status/123" matched on the substring and was
    // accepted as a post. Harmless in the output — every URL is rebuilt from the id —
    // but a URL on another host is not an X post and the check says so.
    const html = await render('x\n\n{{< x src="https://evil.example/x.com/u/status/123456789" >}}')
    expect(html).not.toContain("org-embed--x")
    expect(html).not.toContain("evil.example")
  })

  it("gives X NO iframe exemption — the video needs none", async () => {
    // The exemption was briefly granted, then taken back: /embed/Tweet.html renders the
    // post rather than the video, and /i/videos/<id> renders nothing framed cross-origin.
    // An X embed mounts a real <video>, so the iframe allowlist stays at one entry.
    for (const bad of [
      "https://twitter.com/i/videos/2094691954227400762",
      "https://platform.twitter.com/embed/Tweet.html?id=2094691954227400762",
    ]) {
      const html = await render(`x\n\n#+BEGIN_EXPORT html\n<iframe src="${bad}"></iframe>\n#+END_EXPORT`)
      expect(html, bad).not.toContain("<iframe")
    }
  })

  it("without :video the facade is a plain link the runtime never mounts", async () => {
    const html = await render(
      'x\n\n{{< x src="https://x.com/a/status/2094691954227400762" poster="/media/p.jpg" >}}')
    expect(html).toContain("org-embed--x")
    expect(html).toContain('class="org-embed-poster"')
    // No channel attribute at all, so initEmbeds() skips it and the <a href> just works.
    expect(html).not.toContain("data-embed=")
    expect(html).not.toContain("data-embed-src")
  })

  it("does NOT lazy-load a facade poster — it IS the facade", async () => {
    // Deferred, the poster never painted for a reader and both embeds rendered as an
    // empty plate with a play glyph. A poster beside prose may be lazy; the one standing
    // in for the player is the component's entire visible payload.
    const yt = await render('x\n\n{{< youtube id="dQw4w9WgXcQ" >}}')
    expect(yt).toContain('class="org-embed-poster"')
    expect(yt).not.toMatch(/<img class="org-embed-poster"[^>]*loading="lazy"/)
    // width/height stay, so the box is still reserved and nothing shifts.
    expect(yt).toMatch(/<img class="org-embed-poster"[^>]*width="480" height="360"/)

    const x = await render(
      'x\n\n{{< x src="https://x.com/a/status/2094691954227400762" poster="/media/p.jpg" >}}')
    expect(x).toContain('class="org-embed-poster"')
    expect(x).not.toMatch(/<img class="org-embed-poster"[^>]*loading="lazy"/)
  })

  it("keeps an authored SVG diagram whole — defs, marker and class hooks survive", async () => {
    // A diagram is authored SVG in an export block. If the sanitizer dropped <defs>,
    // <marker> or marker-end, every arrowhead in every diagram would vanish silently.
    const svg =
      '<figure class="org-diagram"><svg class="org-diagram-svg" viewBox="0 0 100 40">' +
      '<defs><marker id="a" refX="9" refY="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>' +
      '<g class="org-diagram-node is-highlight"><rect x="0" y="0" width="40" height="20"/><text x="20" y="14">A</text></g>' +
      '<line class="org-diagram-edge" x1="40" y1="10" x2="90" y2="10" marker-end="url(#a)"/>' +
      "</svg></figure>"
    const html = await render(`x\n\n#+BEGIN_EXPORT html\n${svg}\n#+END_EXPORT`)
    for (const frag of ["<defs>", "<marker", "<path", "<line", 'marker-end="url(#a)"',
      'class="org-diagram-node is-highlight"', 'class="org-diagram-edge"']) {
      expect(html, frag).toContain(frag)
    }
  })

  it("ships the video player surface in the default CSS", () => {
    const BOOK = readFileSync(
      join(__dirname, "..", "templates", "style-book", "kwo.css"), "utf-8")
    for (const hook of [".org-player", ".org-player-bar", ".org-player-btn", ".org-player-track",
      ".org-player-buffered", ".org-player-played", ".org-player-seek", ".org-player-time",
      ".org-player-vol", ".org-player-rate", ".org-player-big", ".org-player-icon"]) {
      expect(BOOK, `missing ${hook}`).toContain(hook)
    }
    // Tabular figures, or the bar twitches every second as the digits change width.
    expect(BOOK).toMatch(/\.org-player-time\s*\{[^}]*tabular-nums/)
    // Motion-averse readers keep the bar rather than having it fade under them.
    expect(BOOK).toMatch(/prefers-reduced-motion[\s\S]*org-player/)
  })

  it("takes over the native controls PROGRESSIVELY, and restores them on failure", () => {
    const RUNTIME = readFileSync(join(__dirname, "..", "templates", "o2h.js"), "utf-8")
    expect(RUNTIME).toContain("upgradeVideo")
    expect(RUNTIME).toContain("initVideoPlayer")
    // controls come off only AFTER the bar is built and wired…
    expect(RUNTIME).toContain('video.removeAttribute("controls")')
    // …and go back if anything threw, so the failure mode is the browser's player.
    expect(RUNTIME).toMatch(/catch[\s\S]{0,200}setAttribute\("controls"/)
    // The seek control is a real range input, so it is a slider to assistive tech.
    expect(RUNTIME).toContain('class="org-player-seek" type="range"')
    // Keyboard is bound to the SHELL: a page with three videos must not have one
    // spacebar reach all of them.
    expect(RUNTIME).toContain('on(shell, "keydown"')
  })

  it("an authored <video> keeps controls in the SERVED html (no-JS readers)", async () => {
    // The engine emits nothing; the author's export block does. What matters is that the
    // engine does not strip the attribute on the way out.
    const html = await render(
      'x\n\n#+BEGIN_EXPORT html\n<video controls preload="metadata"><source src="/a.mp4" type="video/mp4"></video>\n#+END_EXPORT',
    )
    expect(html).toContain("<video")
    expect(html).toContain("controls")
  })

  it("ships the diagram surface and its viewer chrome in the default CSS", () => {
    const BOOK = readFileSync(
      join(__dirname, "..", "templates", "style-book", "kwo.css"), "utf-8")
    for (const hook of [".org-diagram", ".org-diagram-scroll", ".org-diagram-band",
      ".org-diagram-lane", ".org-diagram-node", ".org-diagram-edge", ".org-diagram-arrow",
      ".org-diagram-plate", ".org-diagram-label", ".org-diagram-sub", ".org-diagram-caption",
      ".org-diagram-stage", ".org-diagram-tools", ".org-diagram-zoom", ".org-diagram-hint"]) {
      expect(BOOK, `missing ${hook}`).toContain(hook)
    }
    for (const state of ["is-highlight", "is-muted", "is-dashed", "is-strong"]) {
      expect(BOOK, `missing .${state}`).toContain(`.org-diagram-node.${state}`)
    }
  })

  it("takes diagram STATE from the report ramp, not from a new palette", () => {
    const BOOK = readFileSync(
      join(__dirname, "..", "templates", "style-book", "kwo.css"), "utf-8")
    // A map needs to say "how is each of these doing", which monochrome cannot answer.
    // TOK-003 exists for exactly that: a state colour REPLACES the accent to encode state.
    for (const [state, token] of [["is-go", "--o2h-go"], ["is-info", "--o2h-info"],
      ["is-hold", "--o2h-hold"], ["is-stop", "--o2h-stop"], ["is-working", "--o2h-working"]]) {
      // Match EVERY rule for this state, not the first: an earlier rule setting some
      // unrelated property would otherwise decide the result by source order.
      const rules = [...BOOK.matchAll(
        new RegExp(`\\.org-diagram-node\\.${state}\\s+rect\\.org-diagram-card\\s*\\{[^}]*\\}`, "g"))]
        .map((m) => m[0])
      expect(rules.length, `no card rule for .${state}`).toBeGreaterThan(0)
      expect(rules.some((r) => r.includes(token)),
        `.${state} must paint from ${token}, got: ${rules.join(" ")}`).toBe(true)
    }
    // NEVER COLOUR ALONE, and the card is not where that is settled: the COLUMN HEADING
    // names the state in words, so a greyscale print still reads it. A coloured bar welded
    // to every card was tried and removed — it repeated what the column already said. What
    // the card keeps is a wash, a hairline and the id row in the same hue.
    expect(BOOK).not.toContain("org-diagram-stripe")
    for (const state of ["is-go", "is-info", "is-hold", "is-stop", "is-working"]) {
      // Whitespace-tolerant: the rules are column-aligned in the sheet, so a literal
      // substring match would fail on the padding rather than on a missing rule.
      expect(BOOK, `.${state} does not tint its id row`).toMatch(
        new RegExp(`\\.org-diagram-node\\.${state}\\s+\\.org-diagram-id`))
    }
    // The accent is not a sixth state — it still outranks them.
    expect(BOOK).toContain(".org-diagram-node.is-highlight rect.org-diagram-card")
    // Card anatomy and column chrome.
    for (const hook of [".org-diagram-id", ".org-diagram-title", ".org-diagram-meta",
      ".org-diagram-col-title", ".org-diagram-col-rule", ".org-diagram-elabel"]) {
      expect(BOOK, `missing ${hook}`).toContain(hook)
    }
  })

  it("keeps the diagram monochrome apart from the ONE accent", () => {
    // .is-strong first outlined in --o2h-hold (#e0c052), which sits beside the accent
    // (#f9cd26): the drawing then had two yellows and "look here" stopped being legible.
    // It is a hairline WEIGHT now, so the accent stays the single spend in a diagram.
    const BOOK = readFileSync(
      join(__dirname, "..", "templates", "style-book", "kwo.css"), "utf-8")
    const strong = BOOK.match(/\.org-diagram-node\.is-strong rect \{[^}]*\}/)
    expect(strong, "no .is-strong rule").toBeTruthy()
    expect(strong![0]).not.toContain("--o2h-hold")
    expect(strong![0]).toContain("--o2h-ink")
  })

  it("ships the diagram viewer in the runtime, and mounts it progressively", () => {
    const RUNTIME = readFileSync(join(__dirname, "..", "templates", "o2h.js"), "utf-8")
    expect(RUNTIME).toContain("initDiagrams")
    // Zoom must move the viewBox — a CSS transform would rasterise on zoom and make the
    // PNG disagree with the screen.
    expect(RUNTIME).toContain('svg.setAttribute("viewBox"')
    // The PNG is the WHOLE diagram, and a serialised SVG carries no stylesheet, so every
    // painted property is resolved onto the clone first.
    expect(RUNTIME).toContain("getComputedStyle(live[i])")
    expect(RUNTIME).toContain("DG_PROPS")
    // Plain wheel must NOT zoom: on a long page it would hijack the reader's scroll.
    expect(RUNTIME).toContain("if (!e.ctrlKey && !e.metaKey) return")
  })

  it("adds the org-title-bleed hook only when #+TITLE_BLEED is set", async () => {
    const ast = parse("#+TITLE: T\n#+TITLE_BLEED: t\n\nBody.")
    expect(ast.metadata.titleBleed).toBe(true)
    const on = await render("#+TITLE: T\n#+TITLE_BLEED: t\n\nBody.")
    expect(on).toContain("org-title-bleed")
    const off = await render("#+TITLE: T\n\nBody.")
    expect(off).not.toContain("org-title-bleed")
  })

  it("ships the media CSS (title bleed, responsive embed, carousel)", () => {
    for (const sel of [
      ".org-title-bleed .org-article-header",
      "--o2h-measure-wide",
      // The frame's ratio moved onto .org-embed-stage when the source line
      // became a sibling under the frame rather than an overlay on it.
      ".org-embed-stage",
      ".org-carousel-strip",
    ]) {
      expect(STYLES, `missing ${sel}`).toContain(sel)
    }
  })

  it("ships nested-capable media breakout utilities (.org-wide / .org-full-bleed)", () => {
    expect(STYLES).toContain(".org-wide")
    expect(STYLES).toContain(".org-full-bleed")
    // the viewport-relative margin trick, so it works nested inside a section
    expect(STYLES).toContain("margin-inline: calc(50% - 50vw)")
  })

  it("lets a youtube embed opt into a breakout via wide= / bleed=", async () => {
    const wide = await render('x\n\n{{< youtube id="dQw4w9WgXcQ" wide="t" >}}')
    expect(wide).toContain('class="org-embed org-embed--youtube org-wide"')
    const bleed = await render('x\n\n{{< youtube id="dQw4w9WgXcQ" bleed="t" >}}')
    expect(bleed).toContain('class="org-embed org-embed--youtube org-full-bleed"')
  })
})

describe("--link-styles — host the default stylesheet instead of inlining", () => {
  it("links /styles.css and does NOT inline the ~40KB default when linkDefaultStyles is set", async () => {
    const linked = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      linkDefaultStyles: true,
    })
    expect(linked).toContain('<link rel="stylesheet" href="/styles.css">')
    // A rule that only exists in the bundled default sheet is NOT inlined.
    expect(linked).not.toContain(".org-callout--danger")

    // Default behaviour still inlines the engine CSS.
    const inlined = await applyTemplate("<p>x</p>", { title: "T" })
    expect(inlined).toContain(".org-callout--danger")
    expect(inlined).not.toContain('href="/styles.css"')
  })
})
