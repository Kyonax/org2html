import { describe, expect, it } from "vitest"
import { join } from "path"
import { loadPlugins } from "../src/cli/plugin-loader.js"

const sample = join(__dirname, "fixtures", "sample-plugin.mjs")

describe("Phase 5 — CLI plugin loader", () => {
  it("loads a plugin file's default export", async () => {
    const plugins = await loadPlugins([sample])
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe("sample")
    expect(typeof plugins[0].postProcessor).toBe("function")
  })

  it("returns an empty array for no --plugin flags", async () => {
    expect(await loadPlugins([])).toEqual([])
  })

  it("rejects a module that does not export a valid plugin", async () => {
    await expect(loadPlugins(["vitest"])).rejects.toThrow(/valid OrgPlugin/)
  })

  it("S1-1: gives a clean 'plugin not found' for a missing file", async () => {
    await expect(loadPlugins(["./does-not-exist.mjs"])).rejects.toThrow(/plugin not found/)
  })
})
