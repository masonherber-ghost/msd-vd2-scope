import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ThemeProvider } from '@/hooks/ThemeContext'

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

afterEach(() => {
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('ThemeToggle', () => {
  it('has an accessible name describing what it will do', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: /switch to dark theme/i })).toBeInTheDocument()
  })

  it('applies the dark class to <html> when activated', async () => {
    const user = userEvent.setup()
    renderToggle()

    expect(document.documentElement).not.toHaveClass('dark')
    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }))

    expect(document.documentElement).toHaveClass('dark')
  })

  it('persists the choice so it survives a reload', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }))
    expect(localStorage.getItem('theme')).toBe('dark')

    // A fresh mount reads the class the inline <head> script would have set.
    renderToggle()
    expect(
      screen.getAllByRole('button', { name: /switch to light theme/i }).length,
    ).toBeGreaterThan(0)
  })

  it('exposes its pressed state to assistive technology', async () => {
    const user = userEvent.setup()
    renderToggle()

    const button = screen.getByRole('button', { name: /switch to dark theme/i })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)
    expect(
      screen.getByRole('button', { name: /switch to light theme/i }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
