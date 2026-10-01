import Markdown from 'react-markdown'

/** The slice of the hast tree this file walks — enough to split text nodes. */
type HastText = { type: 'text'; value: string }
type HastElement = {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
  children: HastNode[]
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] }

/**
 * A rehype plugin that wraps every occurrence of `term` in a `<mark>`, so a
 * search hit stays visible once the notes are rendered as markdown (R-8.13).
 * It works on the rendered tree, so markdown syntax around a word never
 * stops it matching.
 */
function markTerm(term: string) {
  const needle = term.trim().toLowerCase()
  return () => (tree: HastNode) => {
    if (needle === '') return

    const split = (text: HastText): HastNode[] => {
      const out: HastNode[] = []
      const lower = text.value.toLowerCase()
      let from = 0
      let at = lower.indexOf(needle)
      while (at !== -1) {
        if (at > from) out.push({ type: 'text', value: text.value.slice(from, at) })
        out.push({
          type: 'element',
          tagName: 'mark',
          properties: { className: ['scope-search__mark'] },
          children: [{ type: 'text', value: text.value.slice(at, at + needle.length) }],
        })
        from = at + needle.length
        at = lower.indexOf(needle, from)
      }
      if (from === 0) return [text]
      if (from < text.value.length) out.push({ type: 'text', value: text.value.slice(from) })
      return out
    }

    const walk = (node: HastNode) => {
      if (!('children' in node) || !node.children) return
      node.children = node.children.flatMap((child) =>
        child.type === 'text' ? split(child as HastText) : (walk(child), [child]),
      )
    }
    walk(tree)
  }
}

export type MarkdownTextProps = {
  text: string
  /** A search term to mark in the rendered text (R-8.13). */
  highlight?: string
}

/**
 * Renders user-written markdown. Raw HTML in the source is shown as text,
 * never injected — react-markdown's default — so a note cannot run script.
 */
export function MarkdownText({ text, highlight = '' }: MarkdownTextProps) {
  return (
    <div className="markdown-text">
      <Markdown
        rehypePlugins={[markTerm(highlight)]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}
