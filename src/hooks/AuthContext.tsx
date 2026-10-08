import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase'

export type User = { id: string; name: string; email: string | null }

type AuthContextValue = {
  user: User | null
  isAuthenticated: boolean
  /** True until Firebase has restored (or ruled out) a persisted session. */
  isLoading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Google sign-in via Firebase Auth. Signing in proves who someone is; whether
 * they may read anything is decided by firestore.rules, which pins the owner's
 * UID. Any Google account can sign in and will simply be denied every read.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, (firebaseUser) => {
        setUser(
          firebaseUser
            ? {
                id: firebaseUser.uid,
                name: firebaseUser.displayName ?? firebaseUser.email ?? 'Signed in',
                email: firebaseUser.email,
              }
            : null,
        )
        setIsLoading(false)
      }),
    [],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      signIn: async () => {
        await signInWithPopup(auth, googleProvider)
      },
      signOut: () => firebaseSignOut(auth),
    }),
    [user, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
