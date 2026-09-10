import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/Layout'

// Every page is lazy-loaded, so each is code-split into its own chunk.
const ScopeMap = lazy(() => import('@/pages/ScopeMap'))
const Reconciliation = lazy(() => import('@/pages/Reconciliation'))
const Coverage = lazy(() => import('@/pages/Coverage'))
const Manage = lazy(() => import('@/pages/Manage'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      // The grid needs the full viewport width, so this route opts out of the
      // fixed content column.
      { index: true, element: <ScopeMap />, handle: { fluid: true } },
      { path: 'reconciliation', element: <Reconciliation /> },
      { path: 'coverage', element: <Coverage />, handle: { fluid: true } },
      // Bulk editing for entities with no single home on the map (R-9.2).
      { path: 'manage', element: <Manage />, handle: { fluid: true } },
      { path: 'manage/:entity', element: <Manage />, handle: { fluid: true } },
      // Catch-all: always last.
      { path: '*', element: <NotFound /> },
    ],
  },
])
