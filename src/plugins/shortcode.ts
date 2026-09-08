/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/shortcode.ts — component / shortcode bridge ([R-13]/[D-11]).
 *
 * The single place that turns an authored component reference into an inert
 * data-component placeholder, so BOTH conversion targets share it: the
 * static-HTML path emits the placeholder directly, and the Vue path rewrites
 * it into an imported <Comp v-bind> (vue-generator). Three authoring forms
 * feed it — inline {{< name k="v" >}}, the block #+BEGIN_COMPONENT Name :k v,
 * and a JSON body for structured props (the data-props channel). The engine
 * only EMITS the placeholder; the host wires the runtime + look ([D-22]).
 * Component names are validated against a name→import-source map (--components);
 * an unknown name errors under --strict, else degrades to an inert placeholder
 * with a warning ([D-26]/[D-28]).
 */

export interface ComponentEmitOptions {
  /** name → import source map (from --components / a Style Book). */
  componentMap?: Record<string, string>
  /** Error on an unknown component instead of warning + inert placeholder. */
  strict?: boolean
  /** Sink for non-fatal warnings (defaults to console.error). */
  warn?: (msg: string) => void
  /** Emit a <span> instead of a <div> — for a call inside running text. */
  inline?: boolean
}

/** Parse a `#+BEGIN_COMPONENT Name :key val :key2 val2` header into name + attrs. */
export function parseComponentArgs(args: string): { name: string; attrs: Record<string, string> } {
  const trimmed = args.trim()
  const nameMatch = trimmed.match(/^(\S+)/)
  const name = nameMatch ? nameMatch[1] : ''
  const rest = trimmed.slice(name.length)
  const attrs: Record<string, string> = {}
  // :key value  (value runs until the next :key or end); also key="value".
  const kvColon = /:(\w+)\s+("([^"]*)"|[^\s:][^:]*?)(?=\s+:|\s*$)/g
  let m: RegExpExecArray | null
  while ((m = kvColon.exec(rest)) !== null) {
    attrs[m[1]] = (m[3] ?? m[2]).trim()
  }
  return { name, attrs }
}

/** Parse a component block body as JSON props; return undefined if it is not JSON. */
export function parseComponentBody(body: string): unknown {
  const trimmed = body.trim()
  if (!trimmed || !/^[[{]/.test(trimmed)) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/**
 * Emit the inert data-component placeholder. Flat attrs ride as attributes;
 * structured props ride as a URL-encoded JSON data-props channel; a resolved
 * import source rides as data-component-src.
 */
function isTruthy(v: unknown): boolean {
  return /^(t|true|yes|1)$/i.test(String(v ?? '').trim())
}

// Extract an 11-char YouTube video id from a bare id or a common URL form.
function youtubeId(input: string): string | null {
  const m =
    input.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/) ||
    input.match(/^([\w-]{11})$/)
  return m ? m[1] : null
}

// A {{< youtube id="…" >}} shortcode becomes a real, responsive, privacy-mode
// iframe embed. The sanitizer keeps iframes ONLY when the src is a youtube embed
// URL, so this is the single sanctioned iframe path.
function youtubeEmbed(attrs: Record<string, unknown>): string {
  const raw = String(attrs.id ?? attrs.v ?? attrs.src ?? '')
  const id = youtubeId(raw.trim())
  if (!id) return '' // no valid id → emit nothing rather than a broken frame
  const title = escapeAttr(String(attrs.title ?? 'YouTube video player'))
  // wide="t" / bleed="t" breaks the embed out past the reading column.
  const breakout = isTruthy(attrs.bleed) ? ' org-full-bleed' : isTruthy(attrs.wide) ? ' org-wide' : ''
  // THE SOURCE LINE. It sits BELOW the frame, not over it, and it is a real link back
  // to the source — an attribution the reader can follow, not a watermark. The platform
  // is named by its own MARK (a glyph the sheet masks in, inheriting currentColor), never
  // by a colour swatch: colour alone identifies nothing to a reader who cannot see it,
  // and the brand's shape is what people actually recognise.
  const channel = String(attrs.channel ?? '').trim()
  const watch = `https://www.youtube.com/watch?v=${id}`
  const source =
    `<a class="org-embed-badge" href="${watch}" target="_blank" rel="noopener noreferrer">` +
    `<span class="org-embed-brand" data-brand="youtube" aria-hidden="true"></span>` +
    `<span class="org-embed-source">YouTube</span>` +
    (channel
      ? `<span class="org-embed-divider" aria-hidden="true">·</span>` +
        `<span class="org-embed-channel">${escapeAttr(channel)}</span>`
      : '') +
    `<span class="org-embed-go" aria-hidden="true"></span>` +
    `</a>`
  // D-05 — THE FACADE ([A2] ui/youtube-facade.vue). The stage ships a poster and a play
  // target; the player mounts only when the reader asks for it. Until then nothing from
  // the video host is in the page — no frame, no cookies, no third-party script — and a
  // document with five embeds does not ship five players. The runtime swaps
  // `data-embed-src` in on click, re-checking the URL against the same privacy-mode
  // pattern the sanitizer enforces. With JS off the poster stays a plain link to the
  // video, so the embed still works.
  //
  // The poster itself IS a request to the video host; that is the reference's trade too,
  // and the README says so rather than implying full isolation.
  const player = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
  const poster = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  return (
    `<div class="org-embed org-embed--youtube${breakout}">` +
    `<div class="org-embed-stage" data-embed="youtube" ` +
    `data-embed-src="${player}" data-embed-title="${title}">` +
    `<a class="org-embed-facade" href="${watch}" rel="noopener noreferrer" aria-label="${title}">` +
    // NOT loading="lazy". The poster is not an illustration beside the content — it IS the
    // facade's entire visible payload, the thing standing in for the player. Deferred, the
    // component renders as an empty box with a play glyph on it, which is what a reader
    // actually saw. width/height still reserve the box, so nothing shifts.
    `<img class="org-embed-poster" src="${poster}" alt="" decoding="async" ` +
    `width="480" height="360">` +
    `<span class="org-embed-play" aria-hidden="true"></span>` +
    `</a></div>${source}</div>\n`
  )
}

/*
 * An author-supplied poster path: a site-root path, a relative one, or an explicit https
 * URL — the same shape `templates/o2h.js` accepts as LOCAL_SRC, kept in step deliberately.
 * Anything else (javascript:, data:, protocol-relative //host) fails the test and the
 * poster is simply dropped, leaving the plate. A poster is decoration; a bad one is never
 * worth emitting an attribute we did not verify.
 */
const POSTER_SRC = /^(?:\/(?!\/)|\.{1,2}\/|https:\/\/)[^\s"'<>]+$/

// A post id from an x.com / twitter.com status URL, or a bare id. X ids are snowflakes:
// digits only, and already 19 wide, so the range is deliberately loose at both ends rather
// than pinned to today's length.
// The host match is ANCHORED. Unanchored, "https://evil.example/x.com/u/status/123" matched
// on the substring and was accepted as a post — harmless in the output, because every URL
// the embed emits is rebuilt from the id rather than echoed, but it is still a URL on
// another host being called an X post, and the check is the place to say no.
function xPostId(input: string): string | null {
  const m =
    input.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x)\.com\/[^/\s]+\/status(?:es)?\/(\d{5,25})/) ||
    input.match(/^(\d{5,25})$/)
  return m ? m[1] : null
}

// The @handle out of the same URL, so the badge can name the account without the author
// repeating it. "i" is X's own placeholder segment (x.com/i/status/…) and names nobody.
function xHandle(input: string): string {
  const m = input.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x)\.com\/([^/\s]+)\/status(?:es)?\/\d/)
  const h = m ? m[1] : ''
  return !h || h === 'i' ? '' : h
}

/*
 * A {{< x src="https://x.com/<handle>/status/<id>/video/1" >}} shortcode becomes the SAME
 * facade the YouTube embed uses, for the same reason: nothing from X is in the page until
 * the reader clicks — no frame, no cookies, no widget script ([D-05], and the measured
 * contract's "ZERO iframes until a click").
 *
 * TWO THINGS DIFFER FROM YOUTUBE, both forced by the platform rather than chosen:
 *
 * 1. THERE IS NO PUBLIC POSTER. YouTube publishes a thumbnail at a predictable URL;
 *    X does not expose one without an authenticated API call, which is a build-time network
 *    dependency this engine will not take ([D-28] reference-don't-build). So `poster` is an
 *    AUTHOR-SUPPLIED path. Without one the stage still renders — it falls back to the plate
 *    every empty media surface uses — and it is still a working link to the post.
 * 2. IT MOUNTS THE VIDEO ITSELF, AND NOT THROUGH AN IFRAME AT ALL.
 *
 *    X OFFERS NO USABLE VIDEO EMBED, and both of its candidates were tried before this was
 *    settled. `platform.twitter.com/embed/Tweet.html` renders the whole POST — avatar,
 *    prose, a "Show more" fold, the reply chrome — with the video as one element inside it;
 *    that is a picture of a post that happens to contain a video. `twitter.com/i/videos/<id>`
 *    IS a bare video player and initialises correctly as a top-level page, but it is an
 *    INTERNAL endpoint rather than a public embed API: framed from another origin it loads
 *    and then renders nothing. Measured, not assumed.
 *
 *    So an X video is embedded the way a local one already is: `:video` takes the media URL
 *    and the runtime mounts a REAL <video> on click. That is strictly better than any frame
 *    X offers — the actual video, native controls and fullscreen, and NO iframe, no cookies
 *    and no third-party script at any point. Without `:video` the facade stays exactly what
 *    it is with JavaScript off: a poster that links to the post.
 *
 *    The engine does not go and find that URL: resolving a post id to its media file needs a
 *    network call at build time, which this engine does not make ([D-28] reference, don't
 *    build). The author passes it, the same way they pass `:poster`.
 */
function xEmbed(attrs: Record<string, unknown>): string {
  const raw = String(attrs.src ?? attrs.id ?? attrs.url ?? '').trim()
  const id = xPostId(raw)
  if (!id) return '' // no valid post id → emit nothing rather than a broken frame
  const title = escapeAttr(String(attrs.title ?? 'Post on X'))
  const breakout = isTruthy(attrs.bleed) ? ' org-full-bleed' : isTruthy(attrs.wide) ? ' org-wide' : ''
  const handle = String(attrs.handle ?? xHandle(raw)).replace(/^@/, '').trim()
  // The canonical permalink. Built from the id we validated, never echoed from author input,
  // so the href cannot carry anything the pattern did not already accept.
  const post = `https://x.com/i/status/${id}`
  const source =
    `<a class="org-embed-badge" href="${post}" target="_blank" rel="noopener noreferrer">` +
    `<span class="org-embed-brand" data-brand="x" aria-hidden="true"></span>` +
    `<span class="org-embed-source">X</span>` +
    (handle
      ? `<span class="org-embed-divider" aria-hidden="true">·</span>` +
        `<span class="org-embed-channel">@${escapeAttr(handle)}</span>`
      : '') +
    `<span class="org-embed-go" aria-hidden="true"></span>` +
    `</a>`
  const rawPoster = String(attrs.poster ?? '').trim()
  // Not lazy, for the same reason as the YouTube poster: it IS the facade.
  const poster = POSTER_SRC.test(rawPoster)
    ? `<img class="org-embed-poster" src="${escapeAttr(rawPoster)}" alt="" decoding="async">`
    : ''
  // `:video` is the media file. It rides the SAME data-embed="video" channel a local
  // <video> uses, so the runtime mounts a real player and re-validates the URL itself.
  // Without it the stage carries no data-embed at all, which is what makes the facade an
  // ordinary link the runtime never touches.
  const rawVideo = String(attrs.video ?? '').trim()
  const video = POSTER_SRC.test(rawVideo) ? rawVideo : ''
  const channelAttrs = video
    ? ` data-embed="video" data-embed-src="${escapeAttr(video)}"`
    : ''
  return (
    `<div class="org-embed org-embed--x${breakout}">` +
    `<div class="org-embed-stage"${channelAttrs} data-embed-title="${title}">` +
    `<a class="org-embed-facade" href="${post}" rel="noopener noreferrer" aria-label="${title}">` +
    poster +
    `<span class="org-embed-play" aria-hidden="true"></span>` +
    `</a></div>${source}</div>\n`
  )
}

export function renderComponentPlaceholder(
  name: string,
  attrs: Record<string, unknown> = {},
  props?: unknown,
  opts: ComponentEmitOptions = {},
): string {
  // YouTube is a real embed, not an inert hydration placeholder.
  if (name.toLowerCase() === 'youtube') return youtubeEmbed(attrs)
  // …and so is an X post. "twitter" is accepted as the same thing, because that is still
  // what half the URLs in circulation say.
  if (name.toLowerCase() === 'x' || name.toLowerCase() === 'twitter') return xEmbed(attrs)

  const map = opts.componentMap
  const src = map?.[name]
  if (map && src === undefined) {
    const msg = `unknown component "${name}" (not in the --components map)`
    if (opts.strict) throw new Error(msg)
    ;(opts.warn ?? ((m: string) => console.error(`org2html: ${m}`)))(msg)
  }

  // A call inside a paragraph must not emit a <div>: the browser would close
  // the <p> around it and split the sentence in two.
  const tag = opts.inline ? 'span' : 'div'
  const parts = [`data-component="${escapeAttr(name)}"`]
  if (src) parts.push(`data-component-src="${escapeAttr(src)}"`)
  // Props ride TWICE, on purpose. The bare attribute is what a human reads in the
  // static HTML; the data-props channel is what survives the DEFAULT sanitizer.
  // DOMPurify strips any bare attribute it does not recognise, so a placeholder
  // that carried its props only as bare attrs handed the SFC whichever handful
  // happened to have a data-* twin — five authored props arriving as two, with
  // no warning, in every build that did not pass --no-sanitize.
  const flat: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs)) {
    // Attribute-NAME allowlist: drop event handlers + inline style so a component
    // placeholder stays safe even under --no-sanitize ([D-26]). The channel obeys
    // the same list — a name refused as an attribute must not re-enter as a prop.
    if (/^on/i.test(k) || k.toLowerCase() === "style") continue
    const val = escapeAttr(String(v ?? ''))
    parts.push(`${escapeAttr(k)}="${val}"`)
    // Mirror the STATIC-look styling attrs to data-* so they survive sanitization
    // (bare custom attrs are stripped; data-* is kept) and drive the default
    // [data-component][data-variant] CSS (SB-4). The Vue generator ignores data-*
    // (it reads the plain attr as a prop), so hydration is unaffected.
    if (STYLE_ATTRS.has(k.toLowerCase())) parts.push(`data-${escapeAttr(k)}="${val}"`)
    // Coerce from the ESCAPED text, which is the exact string the Vue generator
    // reads back off the bare attribute (vue-generator.ts: JSON.parse, else the
    // raw value). Coercing anything else here would make the two paths disagree
    // on a value's TYPE while agreeing on its name.
    try {
      flat[k] = JSON.parse(val)
    } catch {
      flat[k] = val
    }
  }
  // Flat attrs layer ON TOP of the structured JSON body — the precedence the Vue
  // generator already applies to the bare attributes, kept so the channel changes
  // what SURVIVES and never who wins.
  const channel: Record<string, unknown> = {
    ...((props ?? {}) as Record<string, unknown>),
    ...flat,
  }
  if (Object.keys(channel).length > 0 || (props !== undefined && props !== null)) {
    // encodeURIComponent leaves ' unescaped, and DOMPurify re-serializes an
    // escaped &#039; back to a raw quote — which then truncates the channel when
    // the Vue generator reads it back. Escape it here so the round trip holds.
    parts.push(`data-props="${encodeURIComponent(JSON.stringify(channel)).replace(/'/g, "%27")}"`)
  }
  return opts.inline ? `<${tag} ${parts.join(" ")}></${tag}>` : `<${tag} ${parts.join(" ")}></${tag}>\n`
}

// Component styling attributes mirrored to a data-* twin for the default static
// look (SB-4). Kept small + curated so component output does not bloat.
const STYLE_ATTRS = new Set([
  'variant', 'size', 'state', 'label', 'count', 'tone', 'title', 'text', 'type', 'code',
])

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
