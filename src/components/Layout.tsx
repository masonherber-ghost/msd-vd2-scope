import { Outlet, useMatches } from 'react-router-dom'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

type RouteHandle = { fluid?: boolean }

export function Layout() {
  const matches = useMatches()
  // A route opts into full width with handle: { fluid: true }.
  const isFluid = matches.some((m) => (m.handle as RouteHandle | undefined)?.fluid)

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 px-4 py-8">
        <div className={isFluid ? 'app-main-inner--fluid' : 'app-main-inner--fixed'}>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}
