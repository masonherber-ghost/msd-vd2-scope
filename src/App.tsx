import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ThemeProvider } from '@/hooks/ThemeContext'

type ServerStatus = 'checking' | 'ok' | 'unreachable'

function StatusCard() {
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(() => !cancelled && setStatus('ok'))
      .catch(() => !cancelled && setStatus('unreachable'))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2 — Tailwind v4 and Shadcn/UI</CardTitle>
        <CardDescription>
          Tokens, dark mode and the core primitives are wired up.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">API server:</span>
        <Badge variant={status === 'ok' ? 'default' : 'secondary'}>{status}</Badge>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
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
          <div className="app-main-inner--fixed">
            <h1 className="mb-6 text-3xl font-semibold tracking-tight">MSD VD2 Scope</h1>
            <StatusCard />
          </div>
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  )
}
