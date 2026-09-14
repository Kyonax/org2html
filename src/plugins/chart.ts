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
const PAD_T = 30
const PAD_B = 52
/* The left gutter holds the tick labels; an axis TITLE needs its own column beside them
 * or the rotated text runs straight through "1.5k". */
const PAD_L_PLAIN = 56
const PAD_L_TITLED = 84
/*
 * THE PLOT IS CENTRED IN THE FIGURE, so the right gutter MATCHES the left one.
 *
 * It used to be a flat 12, which is all a bar needs to avoid touching the edge —
 * but the left gutter is 56 or 84 because the tick labels and the axis title
 * live there. The drawing was therefore inset ~71px on one side and ~10px on the
 * other, and the bars sat visibly right of centre under a caption and a text
 * column that were both centred. Nothing was misaligned in the markup; the
 * asymmetry was inside the viewBox, which is the hardest place to see it.
 *
 * Mirroring the gutter costs plot width — 624 to 552 units with an axis title —
 * and buys a drawing whose mass is where the reader expects it. A bar chart is
 * a picture, and a picture that sits off-centre reads as a mistake.
 */
const padRightFor = (padLeft: number): number => padLeft

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

/*
 * THE CATEGORY LABELS FIT THEIR SLOT — and a chart whose labels already fit draws
 * exactly as it always did.
 *
 * A label used to be one <text> centred under its bar, whatever its length. Six bars
 * leave about eight characters a slot at the book's 14px tracked label, so the
 * kitchen-sink's 24–27 character labels ran into each other: five overlaps in six,
 * "not readable at all" (reported 2026-09-12). The layout now has two modes:
 *
 *   PLAIN — every label fits on one line at the book's size. The markup is the same,
 *           byte for byte, so no existing chart moves.
 *   DENSE — one label would not. Every label then drops to the dense size (the class
 *           on the <svg>; the book sets the size and drops the tracking), wraps at
 *           spaces and after hyphens onto at most LABEL_MAX_LINES lines, and the
 *           drawing grows downward by the lines it gained. The plot keeps its size.
 *
 * A word is cut only when it alone is longer than a line, and a label that would need
 * more lines ends in an ellipsis with its full text in a <title>. The widths are
 * ESTIMATES of the book's mono face — the engine draws at build time and never loads
 * the font — and they err wide: PLAIN is SpaceMono's 0.612em advance plus the label
 * tracking (measured at 10.46 units a character at 14px), DENSE the bare advance.
 */
const LABEL_PX = 14
const LABEL_PX_DENSE = 12
const LABEL_EM = 0.76
const LABEL_EM_DENSE = 0.62
const LABEL_MAX_LINES = 3
/* Baseline to baseline for a wrapped label, in viewBox units. */
const LABEL_PITCH = 15
/* The air a wrapped label keeps from its neighbour's slot, in viewBox units. */
const LABEL_GAP = 6

/**
 * How many characters of a label fit a slot. Plain keeps only 2 units of air, so a
 * chart that has always fitted keeps drawing the way it always has.
 */
export function labelCapacity(slot: number, dense: boolean): number {
  const glyph = dense ? LABEL_PX_DENSE * LABEL_EM_DENSE : LABEL_PX * LABEL_EM
  return Math.max(4, Math.floor((slot - (dense ? LABEL_GAP : 2)) / glyph))
}

/**
 * Wrap a label into at most `maxLines` lines of at most `width` characters, breaking at
 * spaces and after hyphens, and cutting a word only when it alone is longer than a line.
 * `clipped` says the last line ends in an ellipsis.
 */
export function wrapChartLabel(
  label: string,
  width: number,
  maxLines = LABEL_MAX_LINES,
): { lines: string[]; clipped: boolean } {
  /* The pieces a line may end after: each word keeps its trailing space, and a
   * hyphenated word splits after each hyphen. */
  const units = String(label ?? '').trim().split(/\s+/).filter(Boolean)
    .flatMap((word) => word.split(/(?<=-)/).map((part, i, all) => (i === all.length - 1 ? `${part} ` : part)))
  const lines: string[] = []
  let line = ''
  for (let unit of units) {
    while (unit.trimEnd().length > width) {
      if (line.trim()) {
        lines.push(line.trimEnd())
        line = ''
      }
      lines.push(unit.slice(0, width))
      unit = unit.slice(width)
    }
    if ((line + unit).trimEnd().length <= width) {
      line += unit
    } else {
      lines.push(line.trimEnd())
      line = unit
    }
  }
  if (line.trim()) lines.push(line.trimEnd())
  if (lines.length <= maxLines) return { lines, clipped: false }
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]
  kept[maxLines - 1] = `${last.length >= width ? last.slice(0, width - 1) : last}…`
  return { lines: kept, clipped: true }
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
  const PAD_R = padRightFor(PAD_L)
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

  /* PLAIN or DENSE — see the note above labelCapacity. The first label that would not
   * fit makes the whole chart dense, so the labels under one chart share one size. */
  const dense = data.some((d) => d.label.trim().length > labelCapacity(slot, false))
  const capacity = labelCapacity(slot, dense)
  const labels = data.map((d) => (dense ? wrapChartLabel(d.label, capacity) : { lines: [d.label], clipped: false }))
  const extra = (Math.max(...labels.map((l) => l.lines.length)) - 1) * LABEL_PITCH
  const labelY = (VIEW_H - PAD_B + 22).toFixed(1)

  const bars = data.map((d, i) => {
    const h = top > 0 ? (d.value / top) * plotH : 0
    const x = PAD_L + slot * i + (slot - barW) / 2
    const y = PAD_T + plotH - h
    const on = spec.highlight.has(i + 1)
    const cx = (x + barW / 2).toFixed(1)
    const { lines, clipped } = labels[i]
    /* One line stays a bare <text>, the markup a plain chart always had; more lines
     * are <tspan>s stepped down from the same baseline, each re-anchored on the bar. */
    const text = lines.length === 1
      ? esc(lines[0])
      : lines.map((line, n) => `<tspan x="${cx}" dy="${n === 0 ? 0 : LABEL_PITCH}">${esc(line)}</tspan>`).join('')
    const title = clipped ? `<title>${esc(d.label)}</title>` : ''
    return (
      `<g class="org-chart-bar${on ? ' is-highlight' : ''}">` +
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" />` +
      `<text class="org-chart-value" x="${cx}" y="${(y - 9).toFixed(1)}" text-anchor="middle">${esc(d.display)}</text>` +
      `<text class="org-chart-label" x="${cx}" y="${labelY}" text-anchor="middle">${title}${text}</text>` +
      `</g>`
    )
  })

  const axisTitle = spec.axisLabel
    ? `<text class="org-chart-axis-title" transform="translate(18 ${PAD_T + plotH / 2}) rotate(-90)" text-anchor="middle">${esc(spec.axisLabel)}</text>`
    : ''

  return (
    `<svg class="org-chart-svg${dense ? ' org-chart-svg--dense' : ''}" viewBox="0 0 ${VIEW_W} ${VIEW_H + extra}" role="presentation" aria-hidden="true" ` +
    `preserveAspectRatio="xMidYMid meet">` +
    `${ticks.join('')}${axisTitle}` +
    `<line class="org-chart-axis" x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + plotH}" />` +
    `${bars.join('')}` +
    `</svg>`
  )
}
