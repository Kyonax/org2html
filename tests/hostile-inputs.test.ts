import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

// The empirical hostile-input batteries from the 2026-07-01 stability audit,
// committed as a permanent regression wall. NOTHING here may throw, hang, leak
// raw Org syntax, emit an empty id, or lose content. [Stabilization S4]

const render = (org: string) =>
  renderToHtml(parse(org), { sanitize: true, codeHighlight: false }).then((r) => r.html)

// Battery 1 — 27 hostile inputs: must not crash, hang, leak, or emit id="".
const HOSTILE: Array<[string, string]> = [
  ["empty file", ""],
  ["whitespace only", "   \n\n  \t \n"],
  ["metadata only", "#+TITLE: Only Meta\n#+AUTHOR: X\n"],
  ["no final newline", "* Head\nBody"],
  ["CRLF endings", "#+TITLE: T\r\n* Head\r\nBody line\r\n"],
  ["tabs indent list", "- a\n\t- nested via tab\n"],
  ["unclosed SRC", "#+BEGIN_SRC js\nconst x = 1\n// never closed\n* Not a headline?\n"],
  ["unclosed drawer", "* H\n:PROPERTIES:\n:ID: x\nno end drawer\n\nBody after?\n"],
  ["stray :word: line", "Text\n:REMEMBER:\nMore text after\n"],
  ["mismatched END", "#+BEGIN_QUOTE\nquote body\n#+END_SRC\nafter\n"],
  ["table rule false pos", "| -- | ++ |\n| a | b |\n"],
  ["lone pipe row", "|\n"],
  ["H7 deep headline", "******* Level seven\nBody\n"],
  ["emoji-only heading", "* 🎉🎉\nBody\n"],
  ["dup heading anchors x3", "* Same\n* Same\n* Same\n"],
  ["nested emphasis deep", "*a /b _c +d ~e~ d+ c_ b/ a*\n"],
  ["pathological emphasis", "*".repeat(5000) + "\n"],
  ["very long line", "word ".repeat(20000) + "\n"],
  ["macro self-ref", "#+MACRO: loop {{{loop}}}\n\n{{{loop}}}\n"],
  ["literal {{ in prose", "Use {{ count }} in Vue.\n"],
  ["footnote no def", "Ref[fn:missing] here.\n"],
  ["link to missing heading", "[[*No Such Heading][go]]\n"],
  ["zero-cell table", "||\n||\n"],
  ["bare # not comment", "#hashtag is prose\n"],
  ["html entity in title", "#+TITLE: A & B <C>\n\nBody\n"],
  ["checkbox no space", "- [x] lowercase x\n"],
  ["list after heading", "* H\n- item\n"],
]

describe("S4 — hostile inputs never crash, hang, or leak", () => {
  it.each(HOSTILE)("survives: %s", async (_name, input) => {
    const t0 = Date.now()
    const html = await render(input)
    expect(Date.now() - t0).toBeLessThan(2000) // no O(n²) hang
    expect(html).not.toMatch(/#\+(BEGIN|END)/) // no raw Org block syntax leaked
    expect(html).not.toContain('id=""') // no empty anchor
    expect(html).not.toContain("\r") // no CR leak
  })
})

// Battery 2 — content survival: the MARKER must (or must not) reach the output.
const SURVIVAL: Array<[string, string, boolean]> = [
  ["after unclosed SRC", "#+BEGIN_SRC js\ncode\n\nMARKER paragraph after unclosed block\n", true],
  ["after unclosed drawer", "* H\n:PROPERTIES:\n:ID: x\n\nMARKER body after unclosed drawer\n", true],
  ["after stray :word:", ":REMEMBER:\n\nMARKER after stray drawer line\n", true],
  ["after mismatched END", "#+BEGIN_QUOTE\nq\n#+END_SRC\n\nMARKER after mismatch\n", true],
  ["inside COMMENT subtree", "* COMMENT hidden\nMARKER must NOT appear\n", false],
  ["verse content", "#+BEGIN_VERSE\nMARKER verse line\n#+END_VERSE\n", true],
  ["content after H7", "******* deep\nMARKER after deep headline\n", true],
  ["desc list :: in prose", "The ratio is 2 :: 1 in prose MARKER\n", true],
  ["after zero-cell table", "||\n\nMARKER after weird table\n", true],
  ["unclosed EXPORT", "#+BEGIN_EXPORT html\n<b>raw</b>\n\nMARKER after unclosed export\n", true],
  ["after #+CALL:", "#+CALL: gen()\n\nMARKER after call\n", true],
  ["setupfile ignored", "#+SETUPFILE: theme.org\n\nMARKER after setupfile\n", true],
  ["include ignored", '#+INCLUDE: "other.org"\n\nMARKER after include\n', true],
]

describe("S4 — content survives (no silent loss)", () => {
  it.each(SURVIVAL)("%s", async (_name, input, shouldContain) => {
    const html = await render(input)
    expect(html.includes("MARKER")).toBe(shouldContain)
  })
})
