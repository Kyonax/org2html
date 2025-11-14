export function generateToc(
  headings: Array<{ level: number; text: string; id: string }>,
  maxDepth: number = 3
): string {
  if (headings.length === 0) return ''
  
  let html = '<nav class="toc"><h2>Table of Contents</h2><ul>'
  let currentLevel = headings[0].level
  
  for (const heading of headings) {
    if (heading.level > maxDepth) continue
    
    while (heading.level > currentLevel) {
      html += '<ul>'
      currentLevel++
    }
    
    while (heading.level < currentLevel) {
      html += '</ul>'
      currentLevel--
    }
    
    html += `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`
  }
  
  while (currentLevel > headings[0].level) {
    html += '</ul>'
    currentLevel--
  }
  
  html += '</ul></nav>\n'
  return html
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
