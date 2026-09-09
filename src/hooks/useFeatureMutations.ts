import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  apiClient,
  type CreateFeatureBody,
  type PwcFeatureRow,
  type ScopeGraph,
  type UpdateFeatureBody,
} from '@/lib/api-client'
import { scopeKeys } from '@/hooks/useScope'

/** The next free F- number, offered as an overridable default. */
export function useNextFeatureId(enabled = true) {
  return useQuery({
    queryKey: ['features', 'next-id'],
    queryFn: apiClient.features.nextId,
    enabled,
    // Another create would move it, so never serve a stale suggestion.
    staleTime: 0,
    gcTime: 0,
  })
}

/**
 * Mutations update the cached graph optimistically and roll back to the exact
 * previous snapshot on error, surfacing the server's own message (R-9.6). A
 * failed save never leaves the map showing a value the database rejected.
 */
function useOptimisticScopeMutation<TVariables, TData>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>
  optimistic: (graph: ScopeGraph, variables: TVariables) => ScopeGraph
  onSettledExtra?: () => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: options.mutationFn,

    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey: scopeKeys.all })
      const previous = queryClient.getQueryData<ScopeGraph>(scopeKeys.all)
      if (previous) {
        queryClient.setQueryData<ScopeGraph>(scopeKeys.all, options.optimistic(previous, variables))
      }
      return { previous }
    },

    onError: (_error, _variables, context) => {
      // Restore the exact snapshot, not a refetch — the error message is the
      // useful part and a refetch would race it.
      if (context?.previous) {
        queryClient.setQueryData<ScopeGraph>(scopeKeys.all, context.previous)
      }
    },

    onSettled: () => {
      // One invalidate, not a fan-out.
      void queryClient.invalidateQueries({ queryKey: scopeKeys.all })
      options.onSettledExtra?.()
    },
  })
}

function recount(graph: ScopeGraph): ScopeGraph {
  return {
    ...graph,
    counts: {
      ...graph.counts,
      pwcFeatures: graph.pwcFeatures.length,
      assumptions: graph.assumptions.length,
      featureMvpLinks: graph.featureMvpLinks.length,
      featureCapabilityEdges: graph.featureCapabilityLinks.length,
    },
  }
}

export function useCreateFeature() {
  const queryClient = useQueryClient()

  return useOptimisticScopeMutation<CreateFeatureBody, PwcFeatureRow>({
    mutationFn: (body) => apiClient.features.create(body),
    optimistic: (graph, body) =>
      recount({
        ...graph,
        pwcFeatures: [
          ...graph.pwcFeatures,
          {
            ...body,
            source_phase_label: null,
            capability_note: null,
            display_order: graph.pwcFeatures.length + 1,
            source: 'manual',
          },
        ],
      }),
    // A create consumes the suggested id, so the next suggestion must move.
    onSettledExtra: () => {
      void queryClient.invalidateQueries({ queryKey: ['features', 'next-id'] })
    },
  })
}

export function useUpdateFeature() {
  return useOptimisticScopeMutation<
    { id: string; patch: UpdateFeatureBody },
    PwcFeatureRow
  >({
    mutationFn: ({ id, patch }) => apiClient.features.update(id, patch),
    optimistic: (graph, { id, patch }) => ({
      ...graph,
      pwcFeatures: graph.pwcFeatures.map((feature) =>
        feature.id === id ? { ...feature, ...patch, source: 'manual' } : feature,
      ),
    }),
  })
}

export function useDeleteFeature() {
  return useOptimisticScopeMutation<
    { id: string; cascade: boolean },
    Awaited<ReturnType<typeof apiClient.features.remove>>
  >({
    mutationFn: ({ id, cascade }) => apiClient.features.remove(id, cascade),
    optimistic: (graph, { id }) =>
      recount({
        ...graph,
        pwcFeatures: graph.pwcFeatures.filter((feature) => feature.id !== id),
        // Assumptions and join rows cascade in the database; mirror that so
        // the optimistic view matches what the server will do.
        assumptions: graph.assumptions.filter((a) => a.pwc_feature_id !== id),
        featureMvpLinks: graph.featureMvpLinks.filter((l) => l.pwc_feature_id !== id),
        featureCapabilityLinks: graph.featureCapabilityLinks.filter(
          (l) => l.pwc_feature_id !== id,
        ),
      }),
  })
}
