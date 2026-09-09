import { ThemeToggle } from '@/components/ThemeToggle'

export function Header() {
  return (
    <header className="border-b border-border">
      <div className="app-main-inner--fixed flex items-center justify-between gap-4 px-4 py-3">
        <span className="font-semibold">MSD VD2 Scope</span>
        <ThemeToggle />
      </div>
    </header>
  )
}
