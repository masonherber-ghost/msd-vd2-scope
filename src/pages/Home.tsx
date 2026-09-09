import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useCreateNote, useNotes } from '@/hooks/useNotes'

export default function Home() {
  const [text, setText] = useState('')
  const notesQuery = useNotes()
  const createNote = useCreateNote()

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || createNote.isPending) return
    createNote.mutate(trimmed, { onSuccess: () => setText('') })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Home</h1>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>
            Server state via TanStack Query — no raw fetch in this component.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="note-text">Note</Label>
              <Input
                id="note-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type a note"
              />
            </div>
            <Button type="submit" disabled={createNote.isPending || !text.trim()}>
              {createNote.isPending ? 'Saving…' : 'Add note'}
            </Button>
          </form>

          {createNote.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {createNote.error.message}
            </p>
          ) : null}

          {notesQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading notes…</p>
          ) : notesQuery.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">{notesQuery.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void notesQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : notesQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notesQuery.data.map((note) => (
                <li
                  key={note.id}
                  className="rounded-md border border-border px-3 py-2 text-sm"
                >
                  {note.text}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
