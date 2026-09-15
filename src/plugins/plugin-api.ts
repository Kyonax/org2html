/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/plugin-api.ts — conversion-time plugin registry ([D-22]/R-07).
 *
 * A CLICALLED extension surface, NOT a public import API: the CLI (or a
 * caller) hands org2html a list of OrgPlugins via RenderOptions.plugins,
 * and the renderer runs them through this registry. Four extension points:
 * metadata processors (transform front-matter), block handlers (render a
 * block node type / special-block name), inline handlers (render an inline
 * node type), and post-processors (transform the final HTML). Built-in
 * behaviors (code highlighting) register through the SAME surface so there
 * is one code path. Handlers are hybrid sync/async ([OQ-03] resolved); a
 * handler returning undefined defers to the next plugin / the built-in.
 */

import type { AstNode, OrgMetadata, OrgPlugin } from '../types.js'
import { highlightCode, parseSrcMeta, srcChrome, annotateDiffLines } from './code-highlight.js'

export class PluginRegistry {
  private plugins: OrgPlugin[] = []

  constructor(plugins: OrgPlugin[] = []) {
    for (const p of plugins) this.register(p)
  }

  /** Register a plugin. Registration order = execution order. */
  register(plugin: OrgPlugin): void {
    this.plugins.push(plugin)
  }

  /** Fold every plugin's metadataProcessor over the metadata, in order. */
  async runMetadataProcessors(metadata: OrgMetadata): Promise<OrgMetadata> {
    let out = metadata
    for (const p of this.plugins) {
      if (p.metadataProcessor) out = await p.metadataProcessor(out)
    }
    return out
  }

  /** First plugin with a block handler for `name` wins; undefined = no handler. */
  async runBlockHandler(name: string, node: AstNode, context: any): Promise<string | undefined> {
    for (const p of this.plugins) {
      const handler = p.blockHandlers?.[name]
      if (handler) {
        const result = await handler(node, context)
        if (result !== undefined) return result
      }
    }
    return undefined
  }

  /** First plugin with an inline handler for `name` wins; undefined = no handler. */
  async runInlineHandler(name: string, node: AstNode, context: any): Promise<string | undefined> {
    for (const p of this.plugins) {
      const handler = p.inlineHandlers?.[name]
      if (handler) {
        const result = await handler(node, context)
        if (result !== undefined) return result
      }
    }
    return undefined
  }

  /** Chain every plugin's postProcessor over the final HTML, in order. */
  async runPostProcessors(html: string, metadata: OrgMetadata): Promise<string> {
    let out = html
    for (const p of this.plugins) {
      if (p.postProcessor) out = await p.postProcessor(out, metadata)
    }
    return out
  }
}

/**
 * The built-in code-highlight plugin: renders a `codeBlock` node through Shiki.
 * Registered by default (unless codeHighlight is disabled), so the renderer's
 * code path goes through the SAME plugin surface a user extends.
 */
export function codeHighlightPlugin(codeTheme?: string): OrgPlugin {
  return {
    name: 'code-highlight',
    blockHandlers: {
      codeBlock: async (node: AstNode) => {
        const language = String(node.properties?.language ?? '')
        const switches = String(node.properties?.switches ?? '')
        const code = String(node.children?.[0]?.value ?? '')
        const meta = parseSrcMeta(language, switches)
        // Shiki returns a complete <pre><code> block; diff blocks get their +/-
        // lines tagged, then the Style Book header-bar chrome wraps it (MAP-036).
        let pre = await highlightCode(code, language, codeTheme)
        if (meta.diff) pre = annotateDiffLines(pre, code)
        return srcChrome(pre, meta) + '\n'
      },
    },
  }
}
