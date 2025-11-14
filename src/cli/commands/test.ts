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
