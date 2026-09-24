import { useEffect, useState, type RefObject } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
    error: string | null
  } | null>(null)

  const current = status?.markdown === doc.markdown ? status : null
  const copied = current !== null && current.error === null
  const error = current?.error ?? null

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setStatus(null), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const lineCount = doc.markdown.trimEnd().split('\n').length

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(doc.markdown)
      setStatus({ markdown: doc.markdown, error: null })
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // browsers' permission settings. The text is on screen and selectable,
      // so say that rather than failing silently.
      setStatus({
        markdown: doc.markdown,
        error: 'Copying was blocked. Select the text below and copy it by hand.',
      })
    }
  }

  const download = () => {
    const blob = new Blob([doc.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = doc.filename
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
            The map as Markdown, grouped by release and journey phase. {viewLabel}.
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

        {/* Read-only rather than disabled, so the text stays selectable and
            reachable by keyboard when the clipboard is unavailable. */}
        <textarea
          className="scope-export__preview"
          value={doc.markdown}
          readOnly
          spellCheck={false}
          aria-label="Markdown export"
        />

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
            {copied ? 'Copied' : 'Copy Markdown'}
          </Button>
          <Button onClick={download}>
            <Download aria-hidden="true" />
            Download .md
          </Button>
        </DialogFooter>

        {/* Announced rather than shown, so the confirmation reaches a screen
            reader without the button text moving under the pointer. */}
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? 'Markdown copied to the clipboard' : ''}
        </span>
      </DialogContent>
    </Dialog>
  )
}
