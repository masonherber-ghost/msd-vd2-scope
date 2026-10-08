import { useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/AuthContext'

/** Closing the popup is a choice, not an error worth reporting. */
const DISMISSED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

export default function SignIn() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSignIn() {
    setError(null)
    setIsPending(true)
    try {
      await signIn()
    } catch (e) {
      if (!(e instanceof FirebaseError && DISMISSED.has(e.code))) {
        setError('Sign-in failed. Check your connection and try again.')
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="flex max-w-sm flex-col items-start gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">MSD VD2 Scope</h1>
          <p className="text-muted-foreground">Sign in with Google to open the scope map.</p>
        </div>
        <Button onClick={handleSignIn} disabled={isPending}>
          {isPending ? 'Signing in…' : 'Sign in with Google'}
        </Button>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
