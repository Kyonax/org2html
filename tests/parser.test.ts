import { describe, expect, it } from "vitest"
import { parse } from "../src/index.js"

const typesOf = (nodes: { type: string }[]) => nodes.map((n) => n.type)

describe("parser", () => {
  it("keeps a top-of-document code block as a codeBlock node", () => {
    const ast = parse("#+BEGIN_SRC js\nconst x = 1\n#+END_SRC\n")
    expect(typesOf(ast.children)).toContain("codeBlock")
  })

  it("emits a horizontalRule node for '-----'", () => {
    const ast = parse("above\n\n-----\n\nbelow\n")
    expect(typesOf(ast.children)).toContain("horizontalRule")
  })

  it("routes an unknown block to a specialBlock node with a lowercased name", () => {
    const ast = parse("#+BEGIN_ASIDE\nnote\n#+END_ASIDE\n")
    const special = ast.children.find((n) => n.type === "specialBlock")
    expect(special).toBeDefined()
    expect(special?.properties?.name).toBe("aside")
  })

  it("drops '# ' comment lines and #+BEGIN_COMMENT blocks", () => {
    const ast = parse("keep\n# a comment\n\n#+BEGIN_COMMENT\nhidden\n#+END_COMMENT\n")
    const flat = JSON.stringify(ast)
    expect(flat).not.toContain("a comment")
    expect(flat).not.toContain("hidden")
  })
})
