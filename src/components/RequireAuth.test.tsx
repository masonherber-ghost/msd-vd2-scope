import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FirebaseError } from 'firebase/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from '@/components/RequireAuth'

const auth = vi.hoisted(() => ({
  state: { isAuthenticated: false, isLoading: false },
  signIn: vi.fn<() => Promise<void>>(),
}))

// The real provider initialises Firebase on import.
vi.mock('@/hooks/AuthContext', () => ({
  useAuth: () => ({
    user: auth.state.isAuthenticated ? { id: 'owner', name: 'Owner', email: null } : null,
    ...auth.state,
    signIn: auth.signIn,
    signOut: vi.fn(),
  }),
}))

function renderGate() {
  return render(
    <RequireAuth>
      <p>The app</p>
    </RequireAuth>,
  )
}

beforeEach(() => {
  auth.state = { isAuthenticated: false, isLoading: false }
  auth.signIn.mockReset().mockResolvedValue(undefined)
})

describe('RequireAuth', () => {
  it('renders nothing while a persisted session is being restored', () => {
    auth.state = { isAuthenticated: false, isLoading: true }
    const { container } = renderGate()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the sign-in screen, not the app, when signed out', () => {
    renderGate()
    expect(screen.getByRole('heading', { name: 'MSD VD2 Scope' })).toBeInTheDocument()
    expect(screen.queryByText('The app')).not.toBeInTheDocument()
  })

  it('renders the app once signed in', () => {
    auth.state = { isAuthenticated: true, isLoading: false }
    renderGate()
    expect(screen.getByText('The app')).toBeInTheDocument()
  })

  it('starts Google sign-in from the button', async () => {
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(auth.signIn).toHaveBeenCalledOnce()
  })

  it('reports a failed sign-in', async () => {
    auth.signIn.mockRejectedValue(new FirebaseError('auth/network-request-failed', 'x'))
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign-in failed/i)
  })

  it('stays quiet when the popup is closed', async () => {
    auth.signIn.mockRejectedValue(new FirebaseError('auth/popup-closed-by-user', 'x'))
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  })
})
