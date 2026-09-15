/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/commands/test.ts — Test command.
 *
 * Single-file preview: parses one .org file, dumps the
 * extracted metadata, renders the body, prints the first 500
 * chars of HTML. Intended for manual smoke testing — not a
 * replacement for the vitest suite (Phase 5 work).
 */

import { readFile } from 'fs/promises'
import { dirname } from 'path'
import chalk from 'chalk'
import { parse } from '../../parser/parser.js'
import { renderToHtml } from '../../renderer/html-renderer.js'
import { resolveOrgFileKeywords } from '../org-resolve.js'

export async function testCommand(file: string) {
  console.log(chalk.blue('🧪 Testing parser...\n'))
  
  try {
    const raw = await readFile(file, 'utf-8')

    // Same file layer the real build uses, so `test` previews what `build`
    // would actually emit rather than an unresolved approximation of it.
    const resolved = await resolveOrgFileKeywords(raw, { baseDir: dirname(file) })
    for (const w of resolved.warnings) {
      console.log(chalk.yellow('!'), w)
    }
    if (resolved.files.length > 0) {
      console.log(chalk.gray(`Resolved ${resolved.files.length} file keyword target(s)`))
    }
    const content = resolved.content

    console.log(chalk.gray('Parsing...'))
    const ast = parse(content)
    
    console.log(chalk.green('✓ Parse successful\n'))
    console.log(chalk.bold('Metadata:'))
    console.log(JSON.stringify(ast.metadata, null, 2))
    
    console.log(chalk.gray('\nRendering...'))
    const result = await renderToHtml(ast)
    
    console.log(chalk.green('✓ Render successful\n'))
    console.log(chalk.bold('HTML Preview:'))
    console.log(result.html.substring(0, 500) + '...')
    
  } catch (error) {
    console.log(chalk.red('✗ Error:'), (error as Error).message)
    console.error(error)
  }
}
