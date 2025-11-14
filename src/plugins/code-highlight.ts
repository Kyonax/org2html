import { getHighlighter, type Highlighter } from 'shiki'

let highlighter: Highlighter | null = null

export async function highlightCode(code: string, language: string): Promise<string> {
  if (!highlighter) {
    highlighter = await getHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'html', 'css', 'json', 'markdown'],
    })
  }
  
  try {
    return highlighter.codeToHtml(code, {
      lang: language || 'text',
      theme: 'github-dark',
    })
  } catch (error) {
    // Fallback if language not supported
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
