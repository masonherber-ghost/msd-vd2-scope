import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Header } from '@/components/Header'
import { ThemeProvider } from '@/hooks/ThemeContext'

function renderHeader(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>
        <Header />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('Header', () => {
  it('exposes a labelled main navigation', () => {
    renderHeader()
    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument()
  })

  it('links to every real destination', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Scope map' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Reconciliation' })).toHaveAttribute(
      'href',
      '/reconciliation',
    )
    expect(screen.getByRole('link', { name: 'Coverage' })).toHaveAttribute('href', '/coverage')
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/manage')
  })

  it('offers nothing else', () => {
    renderHeader()
    // Contact and the 404 probe were scaffolding and are gone.
    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(screen.queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '404' })).not.toBeInTheDocument()
  })

  it('marks the current route as the active link', () => {
    renderHeader('/reconciliation')

    expect(screen.getByRole('link', { name: 'Reconciliation' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Scope map' })).not.toHaveAttribute(
      'aria-current',
    )
  })
})
