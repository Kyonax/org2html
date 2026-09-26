import { describe, expect, it } from "vitest"
import { parse } from "../src/index.js"

describe("harness smoke", () => {
  it("parses a document with a heading", () => {
    const ast = parse("* Hello\n\nbody\n")
    expect(ast.type).toBe("document")
    expect(Array.isArray(ast.children)).toBe(true)
    expect(ast.children.length).toBeGreaterThan(0)
  })
})
