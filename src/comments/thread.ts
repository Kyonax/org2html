/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/comments/thread.ts — rebuild the shape of a conversation, and bound it.
 *
 * X's search returns a FLAT list. The shape of the conversation lives in each reply's parent
 * pointer and has to be rebuilt, and it is rebuilt HERE rather than in a template so that the
 * fetcher and any consumer agree on one definition of the thread's shape. The fetcher imports
 * the same function to decide what reaches disk, so the cache and a rendered page cannot
 * disagree about which replies exist.
 */

import type { Comment, CommentNode, Thread } from "./types.js"

/*
 * THREE LEVELS, AND NO MORE. Past the third, the indent has eaten enough of the measure that a
 * reply on a phone is a column of two words, and the conversation is better read at the source.
 * The cap is a COUNT of levels: a reply to the post is 1, a reply to that is 2, a reply to that
 * is 3, and a reply to a level-3 comment does not appear.
 */
export const MAX_DEPTH = 3

/*
 * A parent pointer can lie. Break every cycle before anything walks the graph, by cutting the
 * link at the point the walk re-enters it — the node there becomes a root.
 *
 * This replaces a narrower guard that only caught a comment replying to ITSELF. A two-comment
 * cycle slipped past it and did something worse than hanging: both comments were unreachable
 * from any root, so they silently VANISHED. Losing a real comment without saying so is the
 * failure mode this whole file is written to avoid.
 */
function breakCycles(byId: Map<string, CommentNode>): void {
  const state = new Map<string, "visiting" | "done">()
  for (const start of byId.values()) {
    const walked: CommentNode[] = []
    let cur: CommentNode | undefined = start
    while (cur && state.get(cur.id) !== "done") {
      if (state.get(cur.id) === "visiting") {
        cur.replyTo = null
        break
      }
      state.set(cur.id, "visiting")
      walked.push(cur)
      cur = cur.replyTo != null ? byId.get(cur.replyTo) : undefined
    }
    for (const node of walked) state.set(node.id, "done")
  }
}

/*
 * Turn a flat list into a tree.
 *
 * THE ORPHAN RULE. A reply whose parent is not in the list — the parent fell outside the fetch
 * window, or was deleted, or the thread was fetched mid-conversation — is RE-PARENTED to the
 * root rather than dropped. Losing a real reply because its parent is missing would be worse
 * than showing it one level too high: the reader would never know it existed.
 *
 * THE ORPHAN RULE IS ALSO A TRAP, AND THIS IS WHERE IT IS DISARMED. If a comment is removed on
 * PURPOSE — too deep, or refused by the content policy — then re-parenting its children would
 * promote them to level 0, resurrecting exactly what was removed and putting it at the most
 * prominent position on the page. So the tree is emitted by WALKING DOWN FROM THE ROOTS rather
 * than by filtering a flat list: a node that is not reached is not emitted, and neither is
 * anything beneath it. Dropping a comment drops its whole subtree, by construction.
 *
 * ABSENCE HAS TWO CAUSES, and they are not the same: a parent never seen is a genuine orphan
 * and is kept; a parent deliberately removed takes its subtree with it.
 */
export function threadOf(thread: Thread | null | undefined, maxDepth: number = MAX_DEPTH): CommentNode[] {
  const rootId = thread?.postId ?? null
  if (!thread?.comments?.length) return []

  const byId = new Map<string, CommentNode>(
    thread.comments.map((c: Comment) => [c.id, { ...c, children: [] as CommentNode[] }]),
  )
  breakCycles(byId)

  const roots: CommentNode[] = []
  for (const comment of byId.values()) {
    const parent = comment.replyTo != null ? byId.get(comment.replyTo) : undefined
    if (parent) {
      parent.children.push(comment)
    } else {
      /* An orphan KEPT a parent pointer nobody can resolve — as opposed to a direct reply to
       * the post, whose pointer names the post itself. Which is which matters downstream: the
       * structured data must not assert that an orphan answered the post, because it did not. */
      comment.orphan = comment.replyTo != null && comment.replyTo !== rootId
      roots.push(comment)
    }
  }

  /* A TOTAL order, so a page, a sprite's indices and the structured data all agree on sibling
   * sequence. Sorting on createdAt alone is not one: a record with no date compares false
   * against everything and lands wherever the sort happens to put it. */
  const order = (a: CommentNode, b: CommentNode): number =>
    (a.createdAt ?? "") < (b.createdAt ?? "")
      ? -1
      : (a.createdAt ?? "") > (b.createdAt ?? "")
        ? 1
        : String(a.id) < String(b.id)
          ? -1
          : 1
  roots.sort(order)
  for (const node of byId.values()) node.children.sort(order)

  /* Walk down, stopping at the cap. Anything below it is never visited, so it cannot leak. */
  const emit = (nodes: CommentNode[], depth: number): CommentNode[] =>
    depth >= maxDepth ? [] : nodes.map((node) => ({ ...node, children: emit(node.children, depth + 1) }))

  return emit(roots, 0)
}

/** Every comment in a built tree, in walk order — the count a page and the JSON-LD both need. */
export function flatten(nodes: CommentNode[]): CommentNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

/*
 * The ids that survive the tree rules, for a caller holding a flat list that needs to know what
 * to keep. The fetcher uses this to decide what reaches disk, so the cache and a rendered page
 * agree on the shape rather than each deciding for itself.
 */
export function retainedIds(comments: Comment[], maxDepth: number = MAX_DEPTH): Set<string> {
  return new Set(flatten(threadOf({ comments }, maxDepth)).map((c) => c.id))
}
