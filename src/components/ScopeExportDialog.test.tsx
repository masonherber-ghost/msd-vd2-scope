import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScopeExportDialog } from '@/components/ScopeExportDialog'
import type { ScopeExport } from '@/lib/scope-export'

const doc: ScopeExport = {
  filename: 'vd2-scope-by-msd-feature.md',
  markdown: '# Scope for VD2\n\nView by MSD feature\n\n* **SVD-941**: Landing page\n',
}

function renderDialog(props: Partial<Parameters<typeof ScopeExportDialog>[0]> = {}) {
  return render(
    <ScopeExportDialog
      open
      onOpenChange={vi.fn()}
      document={doc}
      viewLabel="View by MSD feature"
      {...props}
    />,
  )
}

/** jsdom has no clipboard and no object URLs; both are stubbed per test. */
function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
  return writeText
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:export')
  URL.revokeObjectURL = vi.fn()
})

describe('ScopeExportDialog — what it shows', () => {
  it('shows the markdown it is about to hand over', () => {
    renderDialog()
    expect(screen.getByLabelText('Markdown export')).toHaveValue(doc.markdown)
  })

  it('names the file and the view the export came from', () => {
    renderDialog()
    expect(screen.getByText('vd2-scope-by-msd-feature.md')).toBeInTheDocument()
    // The label also appears inside the markdown, so match the sentence
    // the dialog itself writes around it.
    expect(
      screen.getByText(/grouped by release and journey phase\. View by MSD feature\./),
    ).toBeInTheDocument()
  })

  it('says the export follows the filters, so a short list is not a fault', () => {
    renderDialog()
    expect(screen.getByText(/what is listed is what the map is showing/)).toBeInTheDocument()
  })

  it('leaves the preview readable and selectable rather than disabled', () => {
    renderDialog()
    const preview = screen.getByLabelText('Markdown export')
    expect(preview).toHaveAttribute('readonly')
    expect(preview).not.toBeDisabled()
  })
})

describe('ScopeExportDialog — copying', () => {
  it('copies the markdown and confirms it', async () => {
    const writeText = stubClipboard()
    renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    expect(writeText).toHaveBeenCalledWith(doc.markdown)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('tells the reader what to do when the clipboard is blocked', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Copying was blocked. Select the text below and copy it by hand.',
    )
  })

  it('does not carry a confirmation over to a different export', async () => {
    stubClipboard()
    const { rerender } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()

    rerender(
      <ScopeExportDialog
        open
        onOpenChange={vi.fn()}
        document={{ filename: 'vd2-scope-by-actor.md', markdown: '# Other\n' }}
        viewLabel="View by actor"
      />,
    )

    expect(screen.getByRole('button', { name: 'Copy Markdown' })).toBeInTheDocument()
  })
})

describe('ScopeExportDialog — downloading', () => {
  it('saves the markdown under the document filename', async () => {
    renderDialog()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await userEvent.click(screen.getByRole('button', { name: 'Download .md' }))

    expect(click).toHaveBeenCalled()
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('vd2-scope-by-msd-feature.md')
    // The blob URL is released, so repeated exports do not leak one each.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })

  it('offers the file as markdown, not as plain text', async () => {
    renderDialog()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await userEvent.click(screen.getByRole('button', { name: 'Download .md' }))

    const blob = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Blob
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    await expect(blob.text()).resolves.toBe(doc.markdown)
  })
})

describe('ScopeExportDialog — announcing what happened', () => {
  it('names itself, so the dialog is identifiable without sight of the heading', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Export this view' })).toBeInTheDocument()
  })

  it('announces the copy rather than signalling it with an icon alone', async () => {
    stubClipboard()
    renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Markdown copied to the clipboard',
    )
  })

  it('clears the blocked-copy message once a copy succeeds', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined)
    stubClipboard(writeText)
    renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reaches both ways out of the dialog from the keyboard', async () => {
    const user = userEvent.setup()
    stubClipboard()
    renderDialog()

    // Focus opens on the preview; the actions follow it in reading order.
    expect(screen.getByLabelText('Markdown export')).toHaveFocus()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Copy Markdown' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Download .md' })).toHaveFocus()
  })
})
