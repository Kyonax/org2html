/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * Ported verbatim from examples/site/scripts/test-comments.mjs, which ran under plain node
 * because the logic lived in a Vue app. The logic is engine code now, so the assertions are
 * vitest — and the NAMES are kept word for word on purpose: each one records the defect it
 * exists to prevent, and a reviewer should be able to match old against new one for one.
 */

import { describe, expect, it } from "vitest"

import { flatten, threadOf } from "../../src/comments/thread.js"
import type { CommentNode } from "../../src/comments/types.js"

type Shape = Array<[string, Shape]>
const shape = (nodes: CommentNode[]): Shape => nodes.map((n) => [n.id, shape(n.children)])
const ids = (nodes: CommentNode[]): string[] => flatten(nodes).map((n) => n.id).sort()

describe("the comment tree", () => {
  it("no thread returns no roots", () => expect(threadOf(null)).toEqual([]))
  it("empty comments returns no roots", () => expect(threadOf({ comments: [] })).toEqual([]))

  const nested = {
    postId: "ROOT",
    comments: [
      { id: "a", replyTo: "ROOT", createdAt: "1", text: "", author: { name: "", handle: "" } },
      { id: "b", replyTo: "a", createdAt: "2", text: "", author: { name: "", handle: "" } },
      { id: "c", replyTo: "b", createdAt: "3", text: "", author: { name: "", handle: "" } },
      { id: "d", replyTo: "ROOT", createdAt: "4", text: "", author: { name: "", handle: "" } },
    ],
  }
  it("rebuilds a nested thread", () =>
    expect(shape(threadOf(nested))).toEqual([["a", [["b", [["c", []]]]]], ["d", []]]))

  /*
   * THE DECISIVE PAIR. Both inputs end with a reply whose parent is not in the set — and the
   * two must come out opposite ways, because absence has two causes that mean different things.
   *
   * A: the parent WAS present and was removed by the depth cap. Its children go with it. If the
   *    orphan rule fired here, `e` would appear at LEVEL 0 — the removed subtree resurrected at
   *    the most prominent position on the page, which is the whole hazard this rule exists for.
   * B: the parent was NEVER present. A genuine orphan, kept and lifted to the root.
   */
  const chain = {
    postId: "ROOT",
    comments: ["a", "b", "c", "d", "e"].map((id, i) => ({
      id,
      replyTo: i === 0 ? "ROOT" : "abcde"[i - 1],
      createdAt: String(i + 1),
      text: "",
      author: { name: "", handle: "" },
    })),
  }
  it("a five-deep chain keeps exactly three levels", () =>
    expect(shape(threadOf(chain))).toEqual([["a", [["b", [["c", []]]]]]]))
  it("nothing below the cap survives anywhere", () =>
    expect(ids(threadOf(chain))).toEqual(["a", "b", "c"]))
  it("a removed reply does not resurrect its children at the root", () =>
    expect(threadOf(chain).some((n) => n.id === "e" || n.id === "d")).toBe(false))

  const orphan = {
    postId: "ROOT",
    comments: [
      { id: "a", replyTo: "ROOT", createdAt: "1", text: "", author: { name: "", handle: "" } },
      { id: "lost", replyTo: "NEVER-FETCHED", createdAt: "2", text: "", author: { name: "", handle: "" } },
    ],
  }
  it("re-parents an orphan to the root instead of dropping it", () =>
    expect(shape(threadOf(orphan))).toEqual([["a", []], ["lost", []]]))
  it("marks the orphan, and only the orphan", () =>
    expect(threadOf(orphan).map((n) => [n.id, n.orphan === true])).toEqual([["a", false], ["lost", true]]))

  const bare = (id: string, replyTo: string) => ({ id, replyTo, text: "", author: { name: "", handle: "" } })

  it("a self-referencing reply becomes a root", () =>
    expect(shape(threadOf({ postId: "ROOT", comments: [bare("self", "self")] }))).toEqual([["self", []]]))
  it("a two-comment cycle survives as roots rather than vanishing", () =>
    expect(ids(threadOf({ postId: "ROOT", comments: [bare("x", "y"), bare("y", "x")] }))).toEqual(["x", "y"]))
  it("a reply hanging off a cycle is not lost with it", () =>
    expect(
      ids(threadOf({ postId: "ROOT", comments: [bare("x", "y"), bare("y", "x"), bare("z", "x")] })),
    ).toEqual(["x", "y", "z"]))

  const many = {
    postId: "ROOT",
    comments: [
      { id: "1", replyTo: "ROOT", createdAt: "1", text: "", author: { name: "", handle: "" } },
      { id: "2", replyTo: "1", createdAt: "2", text: "", author: { name: "", handle: "" } },
      { id: "3", replyTo: "GONE", createdAt: "3", text: "", author: { name: "", handle: "" } },
      { id: "4", replyTo: "2", createdAt: "4", text: "", author: { name: "", handle: "" } },
    ],
  }
  it("no comment inside the cap is lost", () => expect(flatten(threadOf(many)).length).toBe(4))

  it("the shape does not depend on input order", () =>
    expect(shape(threadOf({ postId: "ROOT", comments: [...many.comments].reverse() }))).toEqual(
      shape(threadOf(many)),
    ))

  it("an undated reply sorts deterministically", () =>
    expect(
      shape(
        threadOf({
          postId: "ROOT",
          comments: [
            bare("b", "ROOT"),
            { id: "a", replyTo: "ROOT", createdAt: "9", text: "", author: { name: "", handle: "" } },
          ],
        }),
      ),
    ).toEqual([["b", []], ["a", []]]))

  it("does not mutate the cached thread", () => {
    const source = { postId: "ROOT", comments: [bare("x", "ROOT")] }
    threadOf(source)
    expect("children" in source.comments[0]).toBe(false)
  })
})
