import { describe, expect, it } from "vitest"
import { tokenize } from "../src/parser/lexer.js"

describe("lexer", () => {
  it("treats a column-0 '*' as a heading but an indented '*' as a list item", () => {
    const tokens = tokenize("* Heading\n  * bullet\n")
    expect(tokens[0].type).toBe("HEADING")
    const bullet = tokens.find((t) => t.value === "bullet")
    expect(bullet?.type).toBe("LIST_ITEM")
  })

  it("emits a COMMENT token for '# ...' but not for a '#+KEYWORD:' line", () => {
    const tokens = tokenize("# a comment\n#+TITLE: x\n")
    expect(tokens[0].type).toBe("COMMENT")
    expect(tokens[1].type).not.toBe("COMMENT")
  })

  it("emits an HR token only for five or more dashes", () => {
    expect(tokenize("-----\n")[0].type).toBe("HR")
    expect(tokenize("------\n")[0].type).toBe("HR")
    expect(tokenize("---\n")[0].type).not.toBe("HR")
  })

  it("captures a hyphenated src-block language whole", () => {
    const t = tokenize("#+BEGIN_SRC emacs-lisp\ncode\n#+END_SRC\n")[0]
    expect(t.type).toBe("CODE_BLOCK")
    expect(t.properties?.language).toBe("emacs-lisp")
  })

  it("captures a code-block body verbatim (org-like lines are not re-tokenized)", () => {
    const tokens = tokenize("#+BEGIN_SRC org\n- not a list\n* not a heading\n#+END_SRC\n")
    const block = tokens.filter((t) => t.type !== "BLANK")
    expect(block).toHaveLength(1)
    expect(block[0].type).toBe("CODE_BLOCK")
    expect(block[0].value).toBe("- not a list\n* not a heading")
  })

  it("emits PLANNING / CLOCK tokens instead of treating them as text", () => {
    const tokens = tokenize("SCHEDULED: <2026-07-15 Wed>\nCLOCK: [2026-07-01 Wed 09:00]\n")
    expect(tokens[0].type).toBe("PLANNING")
    expect(tokens[1].type).toBe("CLOCK")
  })

  it("strips a leading BOM and normalizes CRLF before lexing", () => {
    const tokens = tokenize("﻿* H\r\nbody\r\n")
    expect(tokens[0].type).toBe("HEADING")
    expect(tokens.every((t) => !t.value.includes("\r"))).toBe(true)
  })
})
