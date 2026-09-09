import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/Layout'

// Every page is lazy-loaded, so each is code-split into its own chunk.
const ScopeMap = lazy(() => import('@/pages/ScopeMap'))
const Contact = lazy(() => import('@/pages/Contact'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      // The grid needs the full viewport width, so this route opts out of the
      // fixed content column.
      { index: true, element: <ScopeMap />, handle: { fluid: true } },
      { path: 'contact', element: <Contact /> },
      // Catch-all: always last.
      { path: '*', element: <NotFound /> },
    ],
  },
])
