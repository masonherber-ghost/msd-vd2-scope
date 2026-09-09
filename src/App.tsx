import { useEffect, useState } from 'react'
import { PROJECT_NAME } from '@/lib/project'

type ServerStatus = 'checking' | 'ok' | 'unreachable'

export default function App() {
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
    <main>
      <h1>{PROJECT_NAME}</h1>
      <p>Step 1 — project foundation. Vite, React and Express are wired up.</p>
      <p>
        API server: <strong>{status}</strong>
      </p>
    </main>
  )
}
