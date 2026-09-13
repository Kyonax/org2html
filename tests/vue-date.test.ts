import { afterAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs"
import { execFileSync } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { buildCommand } from "../src/cli/commands/build.js"

/*
 * tests/vue-date.test.ts — the date the SFC renders in a reader's browser.
 *
 * src/cli/utils.ts goes to real trouble at BUILD time to avoid parsing a date
 * string with `new Date`, because `new Date("2026-03-01")` is UTC midnight and
 * prints the day before anywhere west of UTC. The generated SFC then did
 * exactly that in the browser, and wrapped it in a try/catch that cannot fire:
 * `new Date("<2026-03-01 Sun>")` is an Invalid Date, and calling
 * toLocaleDateString() on one RETURNS the string "Invalid Date" instead of
 * throwing. So the catch was dead code and the page shipped the words "Invalid
 * Date" to a reader.
 *
 * The assertion has to run where the bug lives: in a browser-like JS runtime, in
 * a negative-offset zone. So the emitted expression is pulled out of the SFC and
 * evaluated in a CHILD process under TZ=America/Bogota, and compared against the
 * correct answer computed in that same child.
 */

const work = mkdtempSync(join(tmpdir(), "o2h-vuedate-"))
afterAll(() => rmSync(work, { recursive: true, force: true }))
vi.spyOn(console, "log").mockImplementation(() => {})

/** Build one document and return its generated .vue source. */
async function sfcFor(name: string, org: string): Promise<string> {
  const inDir = join(work, `${name}-in`)
  const out = join(work, `${name}-out`)
  mkdirSync(inDir, { recursive: true })
  writeFileSync(join(inDir, `${name}.org`), org)
  await buildCommand(inDir, { output: out, highlight: false, quiet: true })
  const sitemap = JSON.parse(readFileSync(join(out, "sitemap.json"), "utf-8")) as { url: string }[]
  return readFileSync(join(out, sitemap[0].url.replace(/^\//, ""), "index.vue"), "utf-8")
}

/**
 * Evaluate the SFC's own formattedDate computed, with the SFC's own metadata,
 * in a child process pinned to a negative-offset zone.
 */
function evaluateInBogota(sfc: string): { actual: string; expected: string } {
  const metaLine = sfc.match(/export const metadata = (JSON\.parse\(decodeURIComponent\('[^']*'\)\))/)
  expect(metaLine, "the SFC embeds its metadata").toBeTruthy()

  const body = sfc.match(/const formattedDate = computed\(\(\) => \{([\s\S]*?)\n {4}\}\)/)
  expect(body, "the SFC declares a formattedDate computed").toBeTruthy()

  const script = `
    const metadata = ${metaLine![1]}
    const fn = () => {${body![1]}
    }
    const actual = fn()
    const expected = new Date(2026, 2, 1).toLocaleDateString()
    process.stdout.write(JSON.stringify({ actual, expected }))
  `
  const out = execFileSync(process.execPath, ["-e", script], {
    env: { ...process.env, TZ: "America/Bogota" },
    encoding: "utf-8",
  })
  return JSON.parse(out)
}

describe("T1-7 — the SFC's formattedDate", () => {
  it("renders an ISO date as the day the author wrote, west of UTC", async () => {
    const sfc = await sfcFor("iso", "#+TITLE: Iso\n#+DATE: 2026-03-01\n\nbody\n")
    const { actual, expected } = evaluateInBogota(sfc)
    expect(actual).toBe(expected)
  })

  it("renders an Org timestamp rather than the words 'Invalid Date'", async () => {
    const sfc = await sfcFor("stamp", "#+TITLE: Stamp\n#+DATE: <2026-03-01 Sun>\n\nbody\n")
    const { actual, expected } = evaluateInBogota(sfc)
    expect(actual).not.toBe("Invalid Date")
    expect(actual).toBe(expected)
  })

  it("renders nothing for a document with no date", async () => {
    const sfc = await sfcFor("nodate", "#+TITLE: NoDate\n\nbody\n")
    const { actual } = evaluateInBogota(sfc)
    expect(actual).toBe("")
  })
})
