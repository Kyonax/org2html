/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/renderer/sanitizer.ts — DOMPurify + jsdom wrapper.
 *
 * Server-side sanitization that EXTENDS DOMPurify's safe
 * defaults (ADD_TAGS / ADD_ATTR) instead of replacing them, so
 * the SEO / accessibility surface survives: semantic landmarks,
 * ARIA, table-association (scope/headers/colspan/rowspan), lang,
 * link rel/target, image loading hints, the component data-*
 * hooks, and highlighter inline styles. Script, object, event
 * handlers, and unknown protocols stay stripped by DOMPurify's
 * underlying defaults — never re-enable them on untrusted input.
 */

import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

/*
 * The window is created on the FIRST sanitize, not at module load.
 *
 * Booting jsdom costs about 260 ms and 37 MB before a single character has been
 * parsed, and every consumer paid it on `import` — including one that only ever
 * calls parse(), and including `org2html --version`. jsdom is only ever needed
 * to sanitize, so it is built when something sanitizes.
 *
 * The hooks belong to the instance, so they are registered here rather than at
 * module scope: a hook set registered against a window that does not exist yet
 * is the kind of ordering bug that shows up as "the sanitizer stopped working"
 * long after the change that caused it.
 */
let purifyInstance: ReturnType<typeof DOMPurify> | null = null

function getPurify(): ReturnType<typeof DOMPurify> {
  if (purifyInstance) return purifyInstance
  const window = new JSDOM('').window
  const purify = DOMPurify(window as any)
  registerHooks(purify)
  purifyInstance = purify
  return purify
}

const EXTRA_TAGS = [
  'main', 'nav', 'section', 'article', 'header', 'footer', 'aside',
  'figure', 'figcaption', 'caption',
  'thead', 'tbody', 'tfoot', 'col', 'colgroup',
  'dl', 'dt', 'dd',
  // <iframe> is allowed ONLY for YouTube embeds — every iframe is re-checked
  // below and dropped unless its src is a youtube(-nocookie) embed URL.
  'iframe',
]

const EXTRA_ATTRS = [
  'role', 'scope', 'headers', 'colspan', 'rowspan',
  'lang', 'dir', 'tabindex',
  'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
  'rel', 'target', 'loading', 'decoding', 'fetchpriority',
  'width', 'height', 'start', 'reversed', 'value', 'type', 'checked', 'disabled',
  'datetime',
  'data-component', 'data-props', 'data-src',
  // The embed facade's channel (D-05): the runtime reads data-embed-src to mount the
  // player on click. The URL is BUILT by the engine — never author input — and the runtime
  // re-checks it against the same youtube-embed pattern before using it, so the attribute
  // cannot become an open-frame surface.
  'data-embed', 'data-embed-src', 'data-embed-title',
  'allow', 'allowfullscreen', 'frameborder', 'referrerpolicy',
]

// The ONLY iframe src we trust: a YouTube (privacy-mode) embed with an 11-char
// video id. Any other iframe — from a component, an author's export block, or a
// hostile input — is removed entirely, so allowing <iframe> can never become an
// open embedding / clickjacking surface.
//
// AN X VIDEO NEEDS NO IFRAME AND THEREFORE GETS NO EXEMPTION. It was briefly given one,
// then taken back: X's /embed/Tweet.html renders the whole post rather than the video, and
// /i/videos/<id> is an internal endpoint that renders nothing when framed cross-origin. An
// X embed mounts a real <video> instead (see plugins/shortcode.ts), so this list stays at
// one entry — the narrowest it has ever been is the narrowest it should stay.
const YOUTUBE_EMBED = /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[\w-]{11}(?:[?#].*)?$/

/*
 * What a video embed is permitted to ask the browser for — and the ONLY thing it
 * can ask for, because this REPLACES whatever the author wrote rather than
 * merging with it.
 *
 * The src gate above is tight, but `allow` was passing through untouched, so an
 * export block could ship `allow="camera; microphone"` inside a frame a reader
 * takes for a video. Nothing on this list can reach a sensor, a location or a
 * payment sheet; everything a YouTube player actually needs is on it.
 */
const EMBED_ALLOW = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture' 
function registerHooks(purify: ReturnType<typeof DOMPurify>): void {
  purify.addHook('uponSanitizeElement', (node: any, data: any) => {
    if (data.tagName === 'iframe') {
      const src = node.getAttribute?.('src') ?? ''
      if (!YOUTUBE_EMBED.test(src)) {
        node.parentNode?.removeChild(node)
      } else {
        // Pinned, not filtered: the author does not get a say in what the frame
        // may ask for, so there is no token list to get wrong.
        node.setAttribute('allow', EMBED_ALLOW)
      }
    }
  })

  // `style` is allowed by DOMPurify's defaults on every element, which is a
  // CSS-injection surface ([D-07]). Scope it to the only elements that legitimately
  // carry an inline style in our output: the code highlighter's <pre>/<span> and
  // inline <code>. Everything else has its style attribute stripped.
  const STYLE_ALLOWED_TAGS = new Set(['PRE', 'CODE', 'SPAN'])

  /*
   * …and on those three, scope the DECLARATIONS as well.
   *
   * Restricting the attribute by tag name alone still allowed any CSS at all on a
   * <span>, which is enough to blank a page (`position:fixed;inset:0`) or to phone
   * home with what the reader is looking at (`background:url(https://…)`). CSS is
   * not script, so none of it is caught by the script defences.
   *
   * The list is what the ENGINE ITSELF emits, and nothing more: the highlighter's
   * colours (css-variables themes emit `var(--shiki-…)`, other themes emit hex),
   * the three text-style keywords a theme can set, and the plain geometry the
   * Style Book's spacing scale draws with. No `url(`, no `expression(`, no
   * `position`, and no property that can move an element or fetch a resource.
   *
   * The VALUE gate is what stops exfiltration, not the property list: `background`
   * is allowed because `background: #000` is a colour, while `background:
   * url(https://…)` matches none of the permitted value shapes and takes the whole
   * attribute with it.
   *
   * Anything unrecognised removes the whole attribute rather than the offending
   * declaration — a half-applied style is a guess, and this fails closed.
   */
  const STYLE_DECLARATION =
    /^\s*(?:color|background|background-color|font-style|font-weight|text-decoration|width|height)\s*:\s*(?:var\(--[\w-]+\)|#[0-9a-f]{3,8}|[a-z-]+|\d+(?:\.\d+)?(?:px|rem|em|ch|ex|vh|vw|%)?)\s*$/i

  function styleIsAllowed(value: string): boolean {
    const declarations = value.split(';').filter((d) => d.trim() !== '')
    return declarations.length > 0 && declarations.every((d) => STYLE_DECLARATION.test(d))
  }

  /*
   * The engine's only <input> is the disabled checkbox of an Org task item. Any
   * other one came from an author's export block, and a bare text or password
   * field on a page that reads as an article is a phishing surface even with no
   * form to submit it — so it does not survive.
   */
  purify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'input') return
    const el = node as Element
    const type = (el.getAttribute?.('type') ?? '').toLowerCase()
    if (type !== 'checkbox' && type !== 'radio') el.parentNode?.removeChild(el)
  })

  purify.addHook('afterSanitizeAttributes', (node: any) => {
    if (!node.hasAttribute?.('style')) return
    if (!STYLE_ALLOWED_TAGS.has(node.tagName) || !styleIsAllowed(node.getAttribute('style') ?? '')) {
      node.removeAttribute('style')
    }
  })
}

export function sanitizeHtml(html: string): string {
  return getPurify().sanitize(html, {
    ADD_TAGS: EXTRA_TAGS,
    ADD_ATTR: EXTRA_ATTRS,
    ALLOW_DATA_ATTR: true,
    // The engine never emits <style> into a document body — only the head's own
    // <style> blocks, which are assembled by applyTemplate and never pass through
    // here. So an inline <style> can only have come from an author's export block,
    // where it can restyle or blank the entire page.
    FORBID_TAGS: [
      'style',
      // DOMPurify permits form elements by default, so an export block could post
      // a password field to a third party from a page that reads as an article.
      // The engine emits none of THESE, so refusing them costs its own output
      // nothing; an author who genuinely wants a form has --no-sanitize, or a
      // component, which is the supported way to put interactive markup on a page.
      //
      // <button> and <input> are deliberately NOT here, because the ENGINE emits
      // both: the copy control and tab headers are buttons, and an Org checkbox
      // item (`- [X] done`) renders a disabled checkbox carrying the accessible
      // label. Refusing them stripped the checkbox out of every task list — a
      // regression no test caught, because the golden renders with sanitize
      // off. Neither is a way out: without a <form> nothing can be submitted,
      // formaction only means something inside one, and handlers are stripped
      // already. The hook below narrows <input> to the one shape we emit.
      'form',
      'select',
      'textarea',
    ],
  })
}
