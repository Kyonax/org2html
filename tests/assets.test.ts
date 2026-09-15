import { describe, expect, it } from "vitest"
import { join } from "path"
import { probeLocalImage } from "../src/assets/asset-handler.js"
import { addImageDimensions, resolveImageDimensions } from "../src/plugins/asset-fetcher.js"

const fixturesDir = join(__dirname, "fixtures")

describe("Phase 6 — asset dimensions (R-12)", () => {
  it("probes a local image for intrinsic dimensions", async () => {
    const dims = await probeLocalImage(join(fixturesDir, "pixel.png"))
    expect(dims).toEqual({ width: 4, height: 7, type: "png" })
  })

  it("returns null for a missing file", async () => {
    expect(await probeLocalImage(join(fixturesDir, "nope.png"))).toBeNull()
  })

  it("skips root-absolute site paths and untouched remote by default", async () => {
    expect(await resolveImageDimensions("/img/site.png", { baseDir: fixturesDir })).toBeNull()
    expect(await resolveImageDimensions("https://x/y.png", { fetchRemoteAssets: "none" })).toBeNull()
  })

  it("stamps width/height onto a dimensionless local <img>", async () => {
    const html = '<img class="org-image" src="pixel.png" alt="">'
    const { html: out, assets } = await addImageDimensions(html, { baseDir: fixturesDir })
    expect(out).toContain('width="4"')
    expect(out).toContain('height="7"')
    expect(assets).toHaveLength(1)
  })

  it("leaves an <img> that already has dimensions alone", async () => {
    const html = '<img src="pixel.png" width="100" height="50">'
    const { html: out } = await addImageDimensions(html, { baseDir: fixturesDir })
    expect(out).toBe(html)
  })
})
