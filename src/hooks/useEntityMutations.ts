import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, type MoveDirection } from '@/lib/api-client'
import { scopeKeys } from '@/hooks/useScope'

/**
 * Entity writes reshape the graph in ways that are not worth mirroring
 * optimistically — a reorder renumbers siblings, a delete can cascade. These
 * invalidate the single graph query once and let the refetch be the truth.
 *
 * The feature mutations in useFeatureMutations.ts stay optimistic because
 * they change one visible card and the flicker would be obvious.
 */
function useGraphMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // One invalidate, not a fan-out.
      void queryClient.invalidateQueries({ queryKey: scopeKeys.all })
    },
  })
}

// ---- Releases -------------------------------------------------------------

export const useCreateRelease = () =>
  useGraphMutation(apiClient.releases.create)

export const useUpdateRelease = () =>
  useGraphMutation((vars: { id: string; patch: Parameters<typeof apiClient.releases.update>[1] }) =>
    apiClient.releases.update(vars.id, vars.patch),
  )

export const useDeleteRelease = () =>
  useGraphMutation((id: string) => apiClient.releases.remove(id))

// ---- Phases ---------------------------------------------------------------

export const useCreatePhase = () => useGraphMutation(apiClient.phases.create)

export const useUpdatePhase = () =>
  useGraphMutation((vars: { id: string; patch: Parameters<typeof apiClient.phases.update>[1] }) =>
    apiClient.phases.update(vars.id, vars.patch),
  )

export const useMovePhase = () =>
  useGraphMutation((vars: { id: string; direction: MoveDirection }) =>
    apiClient.phases.move(vars.id, vars.direction),
  )

export const useDeletePhase = () =>
  useGraphMutation((id: string) => apiClient.phases.remove(id))

// ---- Assumptions ----------------------------------------------------------

export const useCreateAssumption = () =>
  useGraphMutation((vars: { featureId: string; text: string }) =>
    apiClient.assumptions.create(vars.featureId, vars.text),
  )

export const useUpdateAssumption = () =>
  useGraphMutation((vars: { id: number; text: string }) =>
    apiClient.assumptions.update(vars.id, vars.text),
  )

export const useMoveAssumption = () =>
  useGraphMutation((vars: { id: number; direction: MoveDirection }) =>
    apiClient.assumptions.move(vars.id, vars.direction),
  )

export const useDeleteAssumption = () =>
  useGraphMutation((id: number) => apiClient.assumptions.remove(id))

// ---- MVP features ---------------------------------------------------------

export const useCreateMvpFeature = () => useGraphMutation(apiClient.mvpFeatures.create)

export const useUpdateMvpFeature = () =>
  useGraphMutation(
    (vars: { id: number; patch: Parameters<typeof apiClient.mvpFeatures.update>[1] }) =>
      apiClient.mvpFeatures.update(vars.id, vars.patch),
  )

export const useDeleteMvpFeature = () =>
  useGraphMutation((id: number) => apiClient.mvpFeatures.remove(id))

// ---- Capabilities ---------------------------------------------------------

export const useCreateCapability = () => useGraphMutation(apiClient.capabilities.create)

export const useUpdateCapability = () =>
  useGraphMutation(
    (vars: { id: number; patch: Parameters<typeof apiClient.capabilities.update>[1] }) =>
      apiClient.capabilities.update(vars.id, vars.patch),
  )

export const useDeleteCapability = () =>
  useGraphMutation((id: number) => apiClient.capabilities.remove(id))

// ---- Conflict resolution --------------------------------------------------

export const useResolveConflict = () =>
  useGraphMutation(
    (vars: { id: number; state: string; note: string | null }) =>
      apiClient.conflicts.resolve(vars.id, {
        resolution_state: vars.state,
        resolution_note: vars.note,
      }),
  )
