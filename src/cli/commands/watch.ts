/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/commands/watch.ts — Watch command.
 *
 * Chokidar-driven dev loop: runs an initial build, then
 * rebuilds the whole tree on every change / add event. Coarse
 * by design — incremental rebuild lands when the plugin API
 * lets us cache parse + render outputs by file hash.
 */

import chokidar from 'chokidar'
import chalk from 'chalk'
import { buildCommand } from './build.js'

export async function watchCommand(input: string, options: any) {
  console.log(chalk.blue('👀 Watching for changes...\n'))
  
  // Initial build
  await buildCommand(input, options)
  
  const pattern = input.endsWith('.org') ? input : `${input}/**/*.org`
  
  const watcher = chokidar.watch(pattern, {
    persistent: true,
    ignoreInitial: true,
  })
  
  watcher.on('change', async (path) => {
    console.log(chalk.yellow(`\n📝 ${path} changed, rebuilding...`))
    await buildCommand(input, options)
  })
  
  watcher.on('add', async (path) => {
    console.log(chalk.green(`\n➕ ${path} added, rebuilding...`))
    await buildCommand(input, options)
  })
  
  console.log(chalk.gray('\nPress Ctrl+C to stop watching'))
}
