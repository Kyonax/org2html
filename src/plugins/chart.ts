/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/chart.ts — an Org table drawn as a bar chart, at BUILD time, in SVG.
 *
 * WHY SVG, AND WHY HERE. This is the same bargain shiki makes for code and temml makes
 * for math: the cost is paid once by whoever runs the build, never by whoever reads the
 * page. A charting library would put 40-90KB of JavaScript, a canvas and a layout pass
 * in front of a reader who wants to see four bars — and it would draw nothing at all in
 * a feed reader, in an email, in a print, or with scripting off. An SVG drawn at build
 * time is just markup: it scales, it prints, it themes off the same tokens as everything
 * else on the page, and it needs nothing at runtime.
 *
 * THE DATA STAYS THE DATA. A chart is a PICTURE OF a table, never a replacement for it.
 * The source table is emitted alongside the drawing and hidden visually, so a screen
 * reader, a crawler and a text-only reader get the real numbers in a real <table> rather
 * than an aria-label that paraphrases them. That is also why the <svg> is aria-hidden:
 * the accessible answer is the table, so the drawing must not narrate a second, worse
 * version of it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No pies, no stacked series, no dual axes, no
 * interpolation. One category column, one value column, bars from a zero baseline —
 * the chart shape that cannot lie about a comparison. Anything richer belongs to a host
 * that owns a real charting stack, and reaches it through the sidecar (P-00).
 */

/** A parsed cell: the number to plot plus the text the author actually wrote. */
export type ChartDatum = { label: string; value: number; display: string }

export type ChartSpec = {
  /** 1-based column holding the category label. */
  labelCol: number
  /** 1-based column holding the value. */
  valueCol: number
  /** 1-based BODY row indices drawn in the accent. */
  highlight: Set<number>
  /** Optional axis title along the value axis. */
  axisLabel: string
}

const VIEW_W = 720
const VIEW_H = 340
const PAD_R = 12
const PAD_T = 30
const PAD_B = 52
/* The left gutter holds the tick labels; an axis TITLE needs its own column beside them
 * or the rotated text runs straight through "1.5k". */
const PAD_L_PLAIN = 56
const PAD_L_TITLED = 84

/**
 * Read a table cell as a number. Org tables are text, so a value arrives as "1753",
 * "69.9%", "34.6 %" or "1,753" — all of which mean a number. The SUFFIX is remembered
 * separately because it belongs on the axis and on the printed value, never in the
 * arithmetic. A cell that holds no number at all (an em dash, "n/a", an empty cell) is
 * not plotted as zero, which would be a lie about a missing measurement — it is dropped.
 */
export function parseChartValue(raw: string): { value: number; display: string; unit: string } | null {
  const display = String(raw ?? '').trim()
  const m = display.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const value = Number(m[0])
  if (!Number.isFinite(value)) return null
  return { value, display, unit: /%/.test(display) ? '%' : '' }
}

/** Round a maximum up to a readable axis top (1, 2, 2.5 or 5 × a power of ten). */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const exp = Math.floor(Math.log10(max))
  const pow = Math.pow(10, exp)
  const frac = max / pow
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10
  return step * pow
}

function esc(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Trim an axis tick to something short: 1500, 1.5k, 60%, 0. */
function tickText(v: number, unit: string): string {
  const n = Math.abs(v) >= 1000 && !unit ? `${v / 1000}k` : `${Math.round(v * 100) / 100}`
  return `${n}${unit}`
}

/**
 * Draw the bars. Geometry is fixed in a viewBox and the element is sized by CSS, so the
 * chart is responsive without a resize observer and identical in print. Every colour is
 * a token, so the drawing follows the active Style Book rather than carrying its own
 * palette — including the light inverse.
 */
export function renderBarChart(data: ChartDatum[], spec: ChartSpec, unit: string): string {
  if (data.length === 0) return ''
  const PAD_L = spec.axisLabel ? PAD_L_TITLED : PAD_L_PLAIN
  const plotW = VIEW_W - PAD_L - PAD_R
  const plotH = VIEW_H - PAD_T - PAD_B
  const top = niceMax(Math.max(...data.map((d) => d.value)))
  const slot = plotW / data.length
  // A bar is at most 72px wide so a two-bar chart does not become two slabs, and it keeps
  // a third of its slot as breathing room so the category labels below never touch.
  const barW = Math.min(72, slot * 0.62)

  const ticks: string[] = []
  const TICKS = 4
  for (let t = 0; t <= TICKS; t++) {
    const v = (top / TICKS) * t
    const y = PAD_T + plotH - (v / top) * plotH
    ticks.push(
      `<line class="org-chart-grid" x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${VIEW_W - PAD_R}" y2="${y.toFixed(1)}" />` +
        `<text class="org-chart-tick" x="${PAD_L - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(tickText(v, unit))}</text>`,
    )
  }

  const bars = data.map((d, i) => {
    const h = top > 0 ? (d.value / top) * plotH : 0
    const x = PAD_L + slot * i + (slot - barW) / 2
    const y = PAD_T + plotH - h
    const on = spec.highlight.has(i + 1)
    const cx = (x + barW / 2).toFixed(1)
    return (
      `<g class="org-chart-bar${on ? ' is-highlight' : ''}">` +
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" />` +
      `<text class="org-chart-value" x="${cx}" y="${(y - 9).toFixed(1)}" text-anchor="middle">${esc(d.display)}</text>` +
      `<text class="org-chart-label" x="${cx}" y="${(VIEW_H - PAD_B + 22).toFixed(1)}" text-anchor="middle">${esc(d.label)}</text>` +
      `</g>`
    )
  })

  const axisTitle = spec.axisLabel
    ? `<text class="org-chart-axis-title" transform="translate(18 ${PAD_T + plotH / 2}) rotate(-90)" text-anchor="middle">${esc(spec.axisLabel)}</text>`
    : ''

  return (
    `<svg class="org-chart-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="presentation" aria-hidden="true" ` +
    `preserveAspectRatio="xMidYMid meet">` +
    `${ticks.join('')}${axisTitle}` +
    `<line class="org-chart-axis" x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + plotH}" />` +
    `${bars.join('')}` +
    `</svg>`
  )
}
