/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/commands/filter.ts — stdin -> stdout filter mode ([D-27]).
 *
 * Reads one Org document from stdin and writes the converted result
 * to stdout: a full HTML document by default, the article fragment
 * under --fragment, or a Vue SFC under --format vue. No output
 * folder and no metadata sidecars are written. Every diagnostic is
 * routed to stderr so stdout carries only the converted document,
 * keeping the command safe to compose in a shell pipeline.
 */

import { readFile } from "fs/promises"
import { applyTemplate, parse, renderToHtml } from "../../index.js"
import { buildVueSfc, processComponentPlaceholders, stripDocumentWrapper } from "../vue-generator.js"
import { resolveStyling } from "../style-flags.js"
import { loadPlugins } from "../plugin-loader.js"
import { resolveOrgFileKeywords } from "../org-resolve.js"

interface FilterOptions {
  format: string
  fragment: boolean
  sanitize: boolean
  highlight: boolean
  template?: string
  templateDir?: string
  theme?: string
  codeTheme?: string
  classPrefix?: string
  font?: string
  css?: string
  cssAppend?: string
  cssVar?: string[]
  linkCss?: string[]
  styleBook?: string
  plugin?: string[]
  components?: string
  strict?: boolean
  quiet?: boolean
  defaultStyles?: boolean
  includeRoot?: string[]
  resolveIncludes?: boolean
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString("utf-8")
}

export async function filterCommand(options: FilterOptions): Promise<void> {
  // Logs go to stderr so stdout stays pipe-clean; --quiet silences them entirely.
  console.log = options.quiet ? () => {} : (...args: unknown[]) => console.error(...args)

  if (process.stdin.isTTY) {
    console.error("org2html: filter mode (--stdin / -) expects Org content piped on stdin")
    process.exitCode = 1
    return
  }

  const raw = await readStdin()

  // Filter mode has no document path, so relative #+SETUPFILE / #+INCLUDE
  // targets resolve against the working directory — and the working directory
  // is the only permitted root unless --include-root widens it.
  const resolved = await resolveOrgFileKeywords(raw, {
    baseDir: process.cwd(),
    roots: options.includeRoot ?? [],
    enabled: options.resolveIncludes,
  })
  for (const w of resolved.warnings) console.error(`org2html: ${w}`)
  const content = resolved.content

  const { styleOptions, classPrefix, componentMap: bookComponentMap } = await resolveStyling(options)
  const plugins = await loadPlugins(options.plugin ?? [])

  let componentMap: Record<string, string> = { ...(bookComponentMap ?? {}) }
  if (options.components) {
    componentMap = { ...componentMap, ...JSON.parse(await readFile(options.components, "utf-8")) }
  }

  const ast = parse(content)
  const renderResult = await renderToHtml(ast, {
    sanitize: options.sanitize,
    codeHighlight: options.highlight,
    templateDir: options.templateDir,
    theme: options.theme,
    codeTheme: options.codeTheme,
    classPrefix,
    plugins,
    componentMap,
    strict: options.strict,
  })

  if (options.format === "vue") {
    const article = stripDocumentWrapper(renderResult.html)
    const processed = processComponentPlaceholders(article, componentMap)
    const sfc = buildVueSfc(
      renderResult.metadata,
      processed.html,
      processed.imports,
      processed.propsDeclarations,
    )
    process.stdout.write(sfc.endsWith("\n") ? sfc : `${sfc}\n`)
    return
  }

  if (options.format !== "html") {
    console.error(`org2html: unknown --format "${options.format}" (expected html or vue)`)
    process.exitCode = 1
    return
  }

  if (options.fragment) {
    process.stdout.write(`${stripDocumentWrapper(renderResult.html)}\n`)
    return
  }

  const html = await applyTemplate(
    renderResult.html,
    renderResult.metadata,
    options.template,
    options.templateDir,
    styleOptions,
  )
  process.stdout.write(html.endsWith("\n") ? html : `${html}\n`)
}
