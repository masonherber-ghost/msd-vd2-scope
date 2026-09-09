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

  it('links to home, contact and an unmatched path', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
    expect(screen.getByRole('link', { name: '404' })).toHaveAttribute('href', '/404-test')
  })

  it('marks the current route as the active link', () => {
    renderHeader('/contact')

    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })
})
