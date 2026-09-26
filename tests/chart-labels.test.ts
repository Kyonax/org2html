/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * chart-labels.test.ts — a bar chart's category labels never run into each other.
 *
 * Reported 2026-09-12 on the kitchen-sink article: six labels of 24–27 characters
 * under six bars, one <text> each, five of the six overlapping — "not readable at
 * all". The measurements below are the BROWSER's, not the renderer's own
 * constants, so the test cannot agree with a wrong estimate: Chromium lays the
 * book's 14px tracked mono label at 10.46 viewBox units a character, and the
 * dense 12px untracked label at SpaceMono's 0.612em advance.
 */

import { describe, expect, it } from "vitest"
import { renderBarChart, wrapChartLabel, type ChartDatum } from "../src/plugins/chart.js"

const PLAIN_GLYPH = 10.46
const DENSE_GLYPH = 12 * 0.612

const data = (labels: string[]): ChartDatum[] =>
  labels.map((label, i) => ({ label, value: (i + 1) * 10, display: String((i + 1) * 10) }))

const spec = (axisLabel = "") => ({ labelCol: 1, valueCol: 2, highlight: new Set<number>(), axisLabel })

/* The kitchen-sink's own six, in both languages. */
const SINK_EN = [
  "Unbreakable heading word", "Single-token table cell", "Inline code and verbatim",
  "Bare URL in running text", "Longest line of the verse", "Longest line of source code",
]
const SINK_ES = [
  "Encabezado de una palabra", "Celda de tabla de un token", "Código y verbatim en línea",
  "URL suelta en texto corrido", "Línea más larga del verso", "Línea más larga del código",
]

type Label = { x: number; lines: string[] }

/* Every category label in a drawn chart: its centre and its lines. */
function labelsOf(svg: string): Label[] {
  const out: Label[] = []
  for (const m of svg.matchAll(/<text class="org-chart-label" x="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    const body = m[2].replace(/<title>[\s\S]*?<\/title>/, "")
    const spans = [...body.matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].map((s) => s[1])
    out.push({ x: Number(m[1]), lines: spans.length > 0 ? spans : [body] })
  }
  return out
}

const viewBoxHeight = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1])

/* How far two neighbouring labels overlap, in viewBox units; 0 or less is clear. */
function worstOverlap(svg: string): number {
  const glyph = svg.includes("org-chart-svg--dense") ? DENSE_GLYPH : PLAIN_GLYPH
  const labels = labelsOf(svg)
  const half = (l: Label) => (Math.max(...l.lines.map((s) => s.length)) * glyph) / 2
  let worst = -Infinity
  for (let i = 1; i < labels.length; i++) {
    worst = Math.max(worst, half(labels[i - 1]) + half(labels[i]) - (labels[i].x - labels[i - 1].x))
  }
  return worst
}

describe("chart category labels", () => {
  for (const [name, labels] of [["EN", SINK_EN], ["ES", SINK_ES]] as const) {
    it(`the ${name} kitchen-sink's six long labels do not overlap`, () => {
      const svg = renderBarChart(data([...labels]), spec("characters"), "")
      expect(worstOverlap(svg), "two neighbouring labels overlap (viewBox units)").toBeLessThanOrEqual(0)
    })

    it(`the ${name} kitchen-sink's labels break only between words`, () => {
      const svg = renderBarChart(data([...labels]), spec("characters"), "")
      for (const [i, l] of labelsOf(svg).entries()) {
        expect(l.lines.length, `"${labels[i]}" takes more than three lines`).toBeLessThanOrEqual(3)
        expect(l.lines.join(" ").replace(/- /g, "-"), `"${labels[i]}" was cut inside a word`).toBe(labels[i])
      }
    })
  }

  it("a chart with wrapped labels grows downward by the lines they gained", () => {
    const svg = renderBarChart(data(SINK_EN), spec("characters"), "")
    const lines = Math.max(...labelsOf(svg).map((l) => l.lines.length))
    expect(lines, "the kitchen-sink's labels were expected to wrap").toBeGreaterThan(1)
    expect(viewBoxHeight(svg)).toBe(340 + (lines - 1) * 15)
  })

  it("a chart whose labels fit draws exactly as it always did", () => {
    const svg = renderBarChart(data(["Client typesetter", "Lightweight lib", "MathML at build"]), spec("KB"), "")
    expect(svg).not.toContain("<tspan")
    expect(svg).not.toContain("org-chart-svg--dense")
    expect(viewBoxHeight(svg)).toBe(340)
    expect(svg).toContain('<text class="org-chart-label" x="176.0" y="310.0" text-anchor="middle">Client typesetter</text>')
  })

  it("a short-label chart that overlapped by a few units goes dense instead", () => {
    /* The style-book article's own chart: 19 characters in a 184-unit slot. */
    const svg = renderBarChart(data(["Charting library", "Lightweight library", "Inline SVG at build"]), spec("KB"), "")
    expect(svg).toContain("org-chart-svg--dense")
    expect(worstOverlap(svg)).toBeLessThanOrEqual(0)
  })

  it("a label too long for three lines ends in an ellipsis and keeps its full text in a <title>", () => {
    const long = "Supercalifragilisticexpialidocious and then a great many more words"
    const svg = renderBarChart(data([long, "B", "C", "D", "E", "F"]), spec("characters"), "")
    expect(svg).toContain(`<title>${long}</title>`)
    const first = labelsOf(svg)[0]
    expect(first.lines).toHaveLength(3)
    expect(first.lines[2].endsWith("…")).toBe(true)
    expect(worstOverlap(svg)).toBeLessThanOrEqual(0)
  })
})

describe("wrapChartLabel", () => {
  it("fills a line with whole words, then starts the next", () => {
    expect(wrapChartLabel("Inline code and verbatim", 11)).toEqual({ lines: ["Inline code", "and", "verbatim"], clipped: false })
  })

  it("breaks after a hyphen before it cuts a word", () => {
    expect(wrapChartLabel("Single-token table cell", 11).lines).toEqual(["Single-", "token table", "cell"])
  })

  it("cuts a word only when the word alone is longer than a line", () => {
    expect(wrapChartLabel("Abcdefghijklmno", 6).lines).toEqual(["Abcdef", "ghijkl", "mno"])
  })

  it("keeps a label that fits on one line whole", () => {
    expect(wrapChartLabel("Short", 11)).toEqual({ lines: ["Short"], clipped: false })
  })
})
