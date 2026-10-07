import { useEffect, useRef, useState, type RefObject } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { Tabs } from 'radix-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MarkdownText } from '@/components/MarkdownText'
import type { ScopeExport } from '@/lib/scope-export'

export type ScopeExportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The already-built document — the dialog only shows and saves it. */
  document: ScopeExport
  /** What the export was taken from, named in the dialog's own words. */
  viewLabel: string
  /**
   * Where focus goes when the dialog closes. Radix restores focus to a
   * `DialogTrigger`, and this dialog has none — it is opened from a toolbar
   * button that lives elsewhere in the layout — so without this, closing
   * drops focus to `<body>` and a keyboard user restarts at the top of the
   * page (WCAG 2.1 AA, 2.4.3).
   */
  returnFocusRef?: RefObject<HTMLElement | null>
}

type ExportFormat = 'markdown' | 'formatted'

/** The rendered preview as a standalone page, so the saved file opens anywhere. */
function toHtmlDocument(title: string, body: string) {
  const safeTitle = title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${safeTitle}</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

/**
 * The map, as text, before it leaves.
 *
 * The export goes into a document or a ticket, so the thing that matters is
 * whether it says the right thing — which is only answerable by reading it.
 * The dialog shows the markdown it is about to hand over, and offers the two
 * ways it actually travels: pasted, or saved as a file.
 */
export function ScopeExportDialog({
  open,
  onOpenChange,
  document: doc,
  viewLabel,
  returnFocusRef,
}: ScopeExportDialogProps) {
  /**
   * The outcome is keyed to the text it belongs to, so a confirmation or a
   * failure never carries over to a different export — switching view while
   * the dialog is open replaces the document under it.
   */
  const [status, setStatus] = useState<{
    markdown: string
    format: ExportFormat
    error: string | null
  } | null>(null)
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const renderedRef = useRef<HTMLDivElement>(null)

  const current =
    status?.markdown === doc.markdown && status.format === format ? status : null
  const copied = current !== null && current.error === null
  const error = current?.error ?? null

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setStatus(null), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const lineCount = doc.markdown.trimEnd().split('\n').length

  const htmlFilename = doc.filename.replace(/\.md$/, '') + '.html'
  const title = doc.markdown.match(/^#\s+(.+)$/m)?.[1] ?? htmlFilename

  const copy = async () => {
    try {
      if (format === 'formatted') {
        // Rich text goes up as HTML with a plain-text twin, so a paste into
        // a document keeps the headings and bold, and a paste into a plain
        // field still gets readable words rather than tags.
        const node = renderedRef.current
        if (!node || typeof ClipboardItem === 'undefined') throw new Error('unsupported')
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([node.innerHTML], { type: 'text/html' }),
            'text/plain': new Blob([node.innerText ?? node.textContent ?? ''], {
              type: 'text/plain',
            }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(doc.markdown)
      }
      setStatus({ markdown: doc.markdown, format, error: null })
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // browsers' permission settings. The text is on screen and selectable,
      // so say that rather than failing silently.
      setStatus({
        markdown: doc.markdown,
        format,
        error: 'Copying was blocked. Select the text below and copy it by hand.',
      })
    }
  }

  const download = () => {
    const formatted = format === 'formatted' ? renderedRef.current : null
    const blob = formatted
      ? new Blob([toHtmlDocument(title, formatted.innerHTML)], {
          type: 'text/html;charset=utf-8',
        })
      : new Blob([doc.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = formatted ? htmlFilename : doc.filename
    window.document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="scope-export sm:max-w-3xl"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return
          event.preventDefault()
          returnFocusRef.current.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Export this view</DialogTitle>
          <DialogDescription>
            The map as Markdown, grouped by package and journey phase. {viewLabel}.
            Filters apply — what is listed is what the map is showing.
          </DialogDescription>
        </DialogHeader>

        <p className="scope-export__meta">
          <span>{doc.filename}</span>
          <span aria-hidden="true">·</span>
          <span>
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </p>

        <Tabs.Root
          className="scope-export__tabs"
          value={format}
          onValueChange={(value) => setFormat(value as ExportFormat)}
        >
          <Tabs.List className="scope-export__tab-list" aria-label="Export format">
            <Tabs.Trigger className="scope-export__tab" value="markdown">
              Markdown
            </Tabs.Trigger>
            <Tabs.Trigger className="scope-export__tab" value="formatted">
              Formatted
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="markdown" tabIndex={-1}>
            {/* Read-only rather than disabled, so the text stays selectable and
                reachable by keyboard when the clipboard is unavailable. */}
            <textarea
              className="scope-export__preview"
              value={doc.markdown}
              readOnly
              spellCheck={false}
              aria-label="Markdown export"
            />
          </Tabs.Content>

          <Tabs.Content value="formatted" tabIndex={-1}>
            {/* Focusable so a keyboard user can scroll it; the region name
                tells a screen reader what the scrolled content is. */}
            <div
              ref={renderedRef}
              className="scope-export__rendered"
              role="region"
              aria-label="Formatted export"
              tabIndex={0}
            >
              <MarkdownText text={doc.markdown} />
            </div>
          </Tabs.Content>
        </Tabs.Root>

        {error ? (
          <p className="scope-export__error" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : format === 'formatted' ? 'Copy formatted text' : 'Copy Markdown'}
          </Button>
          <Button onClick={download}>
            <Download aria-hidden="true" />
            {format === 'formatted' ? 'Download .html' : 'Download .md'}
          </Button>
        </DialogFooter>

        {/* Announced rather than shown, so the confirmation reaches a screen
            reader without the button text moving under the pointer. */}
        <span className="sr-only" role="status" aria-live="polite">
          {copied
            ? format === 'formatted'
              ? 'Formatted text copied to the clipboard'
              : 'Markdown copied to the clipboard'
            : ''}
        </span>
      </DialogContent>
    </Dialog>
  )
}
