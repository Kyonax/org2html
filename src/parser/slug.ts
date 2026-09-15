/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/parser/slug.ts — heading-anchor slugifier.
 *
 * The single source of truth for turning a heading's plain text into an
 * id/anchor. Shared by the renderer (which stamps the id) and the parser
 * (which resolves internal links like [[*Heading]] to #slug) so the two can
 * never drift out of alignment.
 */

/*
 * Ids DOMPurify refuses (SANITIZE_DOM). Its check is
 * `value in document || value in formElement`, which stops an author from
 * overwriting document.body with an element — a real defence, and one we keep.
 * The cost was silent: an Org heading called "Images", "Links", "Location" or
 * "Name" slugs to exactly such a name, so the id was DROPPED from the output
 * while the table of contents and every [[*Heading]] link went on pointing at
 * it. Dead anchors, exit 0, no warning.
 *
 * The list is frozen rather than probed so this module stays pure — the parser
 * must not boot jsdom to slug a heading. tests/sanitizer.test.ts runs
 * DOMPurify's own check against a live window and fails on any difference, so
 * the list cannot drift out of agreement with the DOM in silence.
 *
 * Only slug-shaped names are listed: a slug is lowercase [a-z0-9] joined by
 * single hyphens, so nothing else can ever come out of slugify() and collide.
 */
export const CLOBBERING_IDS: ReadonlySet<string> = new Set([
  "action", "after", "anchors", "append", "applets", "attributes", "before", "blur", "body",
  "charset", "children", "clear", "click", "close", "closest", "constructor", "contains",
  "cookie", "dataset", "dir", "doctype", "draggable", "elements", "embeds", "enctype",
  "evaluate", "focus", "forms", "head", "hidden", "id", "images", "implementation", "lang",
  "length", "links", "location", "matches", "method", "name", "nonce", "normalize", "onabort",
  "onauxclick", "onbeforeinput", "onbeforematch", "onbeforetoggle", "onblur", "oncancel",
  "oncanplay", "oncanplaythrough", "onchange", "onclick", "onclose", "oncontextlost",
  "oncontextmenu", "oncontextrestored", "oncopy", "oncuechange", "oncut", "ondblclick",
  "ondrag", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondragstart", "ondrop",
  "ondurationchange", "onemptied", "onended", "onerror", "onfocus", "onformdata", "oninput",
  "oninvalid", "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata",
  "onloadedmetadata", "onloadstart", "onmousedown", "onmouseenter", "onmouseleave",
  "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onpaste", "onpause", "onplay",
  "onplaying", "onprogress", "onratechange", "onreadystatechange", "onreset", "onresize",
  "onscroll", "onscrollend", "onsecuritypolicyviolation", "onseeked", "onseeking", "onselect",
  "onslotchange", "onstalled", "onsubmit", "onsuspend", "ontimeupdate", "ontoggle",
  "ontouchcancel", "ontouchend", "ontouchmove", "ontouchstart", "onvisibilitychange",
  "onvolumechange", "onwaiting", "onwebkitanimationend", "onwebkitanimationiteration",
  "onwebkitanimationstart", "onwebkittransitionend", "onwheel", "open", "plugins", "prefix",
  "prepend", "referrer", "remove", "reset", "role", "scripts", "slot", "style", "submit",
  "target", "title", "translate", "write", "writeln",
])

/**
 * Suffix an id that would be refused for DOM clobbering. Idempotent —
 * "body-section" is not itself a clobbering name — so it is safe to apply on a
 * path that may already have been through slugify().
 */
export function suffixIfClobbering(id: string): string {
  return CLOBBERING_IDS.has(id) ? `${id}-section` : id
}

export function slugify(text: string): string {
  // Unicode-aware: keep letters/numbers from ANY script (\p{L}\p{N}) so a
  // non-ASCII heading ("日本語", "Café") yields a real anchor instead of
  // collapsing to "". Punctuation is dropped, whitespace becomes a hyphen.
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  // Never emit an empty id (e.g. an emoji-only heading) — WCAG 4.1.1.
  // The suffix is applied HERE, in the one function the renderer's id, the TOC
  // href and the parser's [[*Heading]] resolution all share, so the three can
  // never disagree about where an anchor points.
  return suffixIfClobbering(slug || 'section')
}
