/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * scripts/scan-perf.mjs — inline-scan growth probe.
 *
 * parseInlineMarkup meets an opener, scans forward for its closer, fails, and
 * then does it again at the next opener. On text made of unclosed openers that
 * is quadratic: a 40 KB paragraph of `*foo *bar …` measured 1.3 s, and ~21 s at
 * 160 KB, while nothing ever hung and nothing ever warned.
 *
 * This measures GROWTH, not absolute speed, so it says something on any machine:
 * double the input and the time should roughly double. A ratio near 4 is the
 * quadratic signature.
 *
 * Run: npm run scan:perf
 */

import { parse } from "../dist/index.mjs"

const PATTERNS = [
  { id: "emphasis-open", unit: "*a " },
  { id: "link-open", unit: "[[x " },
  { id: "macro-open", unit: "{{{x " },
  { id: "shortcode-open", unit: "{{< x " },
  { id: "footnote-open", unit: "[fn:x " },
  { id: "subscript-open", unit: "a_{" },
  { id: "latex-open", unit: "\\[x " },
  { id: "dollar-open", unit: " $x" },
  { id: "angle-open", unit: "<" },
]

/*
 * Sizes are chosen so the SMALLEST measurement clears the noise floor. Once the
 * rescans are gone these patterns are fast, and a ratio computed from 2 ms
 * against 6 ms says nothing at all except that the JIT warmed up — measured
 * that exact false alarm while building this. A pattern whose baseline lands
 * under NOISE_FLOOR_MS is reported and NOT judged, rather than judged badly.
 */
const BASE = Number(process.env.SCAN_BASE ?? 20000)
const THRESHOLD = Number(process.env.SCAN_THRESHOLD ?? 2.5)
const NOISE_FLOOR_MS = Number(process.env.SCAN_NOISE_FLOOR ?? 15)

function timeParse(text) {
  let best = Infinity
  for (let i = 0; i < 3; i++) {
    const t0 = process.hrtime.bigint()
    parse(text)
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    if (ms < best) best = ms
  }
  return best
}

let failed = 0
console.log(
  `scan-perf — base ${BASE} units, ratio threshold ${THRESHOLD}, noise floor ${NOISE_FLOOR_MS}ms\n`,
)
console.log("pattern            n(ms)    2n(ms)    4n(ms)   2n/n   4n/2n")
console.log("-".repeat(64))

for (const { id, unit } of PATTERNS) {
  const t = [1, 2, 4].map((mult) => timeParse(unit.repeat(BASE * mult)))
  const r1 = t[1] / t[0]
  const r2 = t[2] / t[1]
  const tooFast = t[0] < NOISE_FLOOR_MS
  const bad = !tooFast && (r1 > THRESHOLD || r2 > THRESHOLD)
  if (bad) failed++
  console.log(
    `${id.padEnd(17)} ${t[0].toFixed(1).padStart(7)} ${t[1].toFixed(1).padStart(9)} ` +
      `${t[2].toFixed(1).padStart(9)} ${r1.toFixed(2).padStart(6)} ${r2.toFixed(2).padStart(7)}` +
      (bad ? "   SUPER-LINEAR" : tooFast ? "   (below noise floor — not judged)" : ""),
  )
}

console.log("-".repeat(64))
if (failed > 0) {
  console.error(`\nscan-perf — ${failed} pattern(s) grew faster than ${THRESHOLD}x per doubling`)
  process.exit(1)
}
console.log("\nscan-perf — every pattern grew linearly")
