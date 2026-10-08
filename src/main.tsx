import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import '@/globals.css'
import { router } from '@/routes'
import { AuthProvider } from '@/hooks/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'

// A tab left open across a deploy asks for a lazy route chunk the deploy
// deleted. Reload onto the new build instead of failing to render.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found in index.html')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A down server is not worth three retries before showing the error.
      retry: 1,
    },
  },
})

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RequireAuth>
          <Suspense fallback={null}>
            <RouterProvider router={router} />
          </Suspense>
        </RequireAuth>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
