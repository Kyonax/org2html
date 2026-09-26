/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/plugin-loader.ts — CLI plugin loader ([D-22]/R-07).
 *
 * org2html is CLI-only, so conversion-time plugins are loaded here from
 * files the user points at with --plugin (repeatable). Each module's
 * default export is an OrgPlugin or an array of them (a named `plugin` /
 * `plugins` export is also accepted). Loading a plugin runs its module —
 * that is inherent to the feature (like eslint/postcss plugins) and only
 * ever from a path the operator supplied.
 */

import { pathToFileURL } from "url"
import { isAbsolute, resolve } from "path"
import type { OrgPlugin } from "../types.js"

function coercePlugins(mod: any, ref: string): OrgPlugin[] {
  const candidate = mod?.default ?? mod?.plugin ?? mod?.plugins ?? mod
  const list = Array.isArray(candidate) ? candidate : [candidate]
  const out: OrgPlugin[] = []
  for (const p of list) {
    if (p && typeof p === "object" && typeof p.name === "string") out.push(p as OrgPlugin)
    else throw new Error(`plugin "${ref}" did not export a valid OrgPlugin (needs a { name, … } object)`)
  }
  return out
}

/** Dynamically import every --plugin file and flatten to an OrgPlugin[]. */
export async function loadPlugins(refs: string[] = []): Promise<OrgPlugin[]> {
  const plugins: OrgPlugin[] = []
  for (const ref of refs) {
    // Local files import via a file:// URL; a bare package spec imports as-is.
    const isPath = ref.startsWith(".") || ref.startsWith("/") || isAbsolute(ref)
    const spec = isPath ? pathToFileURL(resolve(process.cwd(), ref)).href : ref
    let mod: unknown
    try {
      mod = await import(spec)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === "ERR_MODULE_NOT_FOUND") throw new Error(`plugin not found: ${ref}`)
      throw new Error(`failed to load plugin "${ref}": ${e.message}`)
    }
    plugins.push(...coercePlugins(mod, ref))
  }
  return plugins
}
