import { useQuery, type QueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export const scopeKeys = {
  all: ['scope'] as const,
}

/**
 * The single graph query. Every view derives from this one payload rather than
 * issuing its own request (R-10.7).
 *
 * The read is the whole store — ~400 billed document reads — so it is not
 * repeated on a timer or on window focus. Writes keep it current without a
 * read (see syncScopeAfterWrite); a reload picks up edits from another device.
 */
export function useScope() {
  return useQuery({
    queryKey: scopeKeys.all,
    queryFn: apiClient.scope.get,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/**
 * After a write: put the graph the write produced straight into the cache —
 * zero reads. Only when nothing is held yet does it fall back to a refetch.
 * One update, not a fan-out.
 */
export function syncScopeAfterWrite(queryClient: QueryClient): void {
  const graph = apiClient.scope.cached()
  if (graph) queryClient.setQueryData(scopeKeys.all, graph)
  else void queryClient.invalidateQueries({ queryKey: scopeKeys.all })
}
