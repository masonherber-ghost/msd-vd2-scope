import { NavLink } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  ].join(' ')

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="app-main-inner--fixed flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">MSD VD2 Scope</span>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Scope map
            </NavLink>
            <NavLink to="/reconciliation" className={linkClass}>
              Reconciliation
            </NavLink>
            <NavLink to="/coverage" className={linkClass}>
              Coverage
            </NavLink>
            <NavLink to="/manage" className={linkClass}>
              Manage
            </NavLink>
          </nav>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
