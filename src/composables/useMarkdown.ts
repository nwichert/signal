import { marked } from 'marked'

// Configure marked for safe rendering
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
})

export function useMarkdown() {
  function renderMarkdown(content: string): string {
    if (!content) return ''
    return marked.parse(content) as string
  }

  return {
    renderMarkdown,
  }
}
