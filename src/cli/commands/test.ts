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
import chalk from 'chalk'
import { parse } from '../../parser/parser.js'
import { renderToHtml } from '../../renderer/html-renderer.js'

export async function testCommand(file: string) {
  console.log(chalk.blue('🧪 Testing parser...\n'))
  
  try {
    const content = await readFile(file, 'utf-8')
    
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
