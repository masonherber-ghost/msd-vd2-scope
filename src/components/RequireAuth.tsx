import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/AuthContext'
import SignIn from '@/pages/SignIn'

/**
 * Renders the app only once someone is signed in. This is a convenience, not
 * security — firestore.rules decides what a signed-in user can read.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  // Firebase restores a persisted session asynchronously; rendering the
  // sign-in screen in the meantime would flash it on every reload.
  if (isLoading) return null
  if (!isAuthenticated) return <SignIn />
  return children
}
