import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export const scopeKeys = {
  all: ['scope'] as const,
}

/**
 * The single graph query. Every view derives from this one payload rather than
 * issuing its own request (R-10.7).
 */
export function useScope() {
  return useQuery({
    queryKey: scopeKeys.all,
    queryFn: apiClient.scope.get,
  })
}

export function useRunImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: apiClient.import.run,
    onSuccess: () => {
      // One invalidate, not a fan-out.
      void queryClient.invalidateQueries({ queryKey: scopeKeys.all })
    },
  })
}
