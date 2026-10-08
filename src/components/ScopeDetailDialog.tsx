import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

export type ScopeDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the dialog for assistive tech; the panel repeats it visually. */
  label: string
  /**
   * The card that opened it. Radix restores focus to a `DialogTrigger`, and
   * these dialogs are opened from a card in the grid rather than a trigger,
   * so without this focus falls to `<body>` and a keyboard user restarts at
   * the top of a very large page (WCAG 2.4.3).
   */
  returnFocusTo?: () => HTMLElement | null
  children: ReactNode
}

/**
 * The shell the three detail panels share.
 *
 * They used to sit in a column beside the grid, which cost the map a fifth
 * of its width exactly when someone was reading a card against its
 * neighbours. As a modal the map keeps its full width, and the panel gets
 * more room than the column ever gave it.
 *
 * Each panel already draws its own header and Close button, so the dialog's
 * own close is suppressed — two controls with the same name in one dialog
 * help nobody.
 */
export function ScopeDetailDialog({
  open,
  onOpenChange,
  label,
  returnFocusTo,
  children,
}: ScopeDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="scope-detail-dialog sm:max-w-3xl"
        showCloseButton={false}
        // An open inline edit owns Escape. Radix listens for it in the
        // capture phase, so the field cannot stop it on the way down —
        // the dialog has to decline to close instead, and the field's own
        // handler then cancels the edit.
        onEscapeKeyDown={(event) => {
          if (document.activeElement?.closest('.inline-edit--editing')) {
            event.preventDefault()
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.()
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}
