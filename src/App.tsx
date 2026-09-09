import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
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
import { ThemeProvider } from '@/hooks/ThemeContext'

type Note = { id: number; text: string; created_at: string }

// Step 3 only: plain useState + fetch, replaced by a TanStack Query hook in
// Step 4. The backend behind it is permanent.
function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/notes')
      if (!res.ok) throw new Error('Could not load notes.')
      setNotes(await res.json())
      setError(null)
    } catch {
      setError('Could not reach the server.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Could not save that note.')
      }
      setText('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that note.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>
          End-to-end check: migration, repository, route and client.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="note-text">Note</Label>
            <Input
              id="note-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a note"
            />
          </div>
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Saving…' : 'Add note'}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-md border border-border px-3 py-2 text-sm">
                {note.text}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1 px-4 py-8">
          <div className="app-main-inner--fixed flex flex-col gap-6">
            <h1 className="text-3xl font-semibold tracking-tight">MSD VD2 Scope</h1>
            <Notes />
          </div>
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  )
}
