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
