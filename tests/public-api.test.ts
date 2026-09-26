import { describe, expect, it } from "vitest"
import * as api from "../src/index.js"

/*
 * tests/public-api.test.ts — the export list is a promise, so it is written down.
 *
 * README.org used to say the package had "no supported library-import API" while
 * README.md — the file npm actually shows — documented a typed ESM entry and the
 * install smoke test exercised one. Both cannot be true, and a consumer reading
 * either had no way to know which.
 *
 * The contract is now one sentence in both READMEs: `parse`, `renderToHtml`,
 * `applyTemplate`, `org2html` and the exported types are semver-stable;
 * everything else is incidental and may move. This test pins the whole list, so
 * adding to it or removing from it is a decision somebody makes on purpose.
 *
 * It reads src/, not dist/, on purpose: `npm test` runs in CI without a build.
 */

/** The four names the README promises to keep. */
const STABLE = ["parse", "renderToHtml", "applyTemplate", "org2html"] as const

/** Everything the entry point exports today, stable names included. */
const EXPORTED = [
  "KNOWN_CONSTRUCTS",
  "PluginRegistry",
  "addImageDimensions",
  "applyTemplate",
  "codeHighlightPlugin",
  "org2html",
  "parse",
  "parseComponentArgs",
  "parseComponentBody",
  "parseIncludeSpec",
  "probeLocalImage",
  "renderComponentPlaceholder",
  "renderToHtml",
  "resolveImageDimensions",
  "resolveOrgFileKeywords",
  "resolveStyleBook",
  "startupToOptions",
  "titleFromFilename",
]

describe("the public API surface", () => {
  it("exports exactly the documented list", () => {
    expect(Object.keys(api).sort()).toEqual([...EXPORTED].sort())
  })

  it("keeps the four semver-stable entry points callable", () => {
    for (const name of STABLE) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe("function")
    }
  })
})
