import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, type MoveDirection } from '@/lib/api-client'
import { syncScopeAfterWrite } from '@/hooks/useScope'

/**
 * Entity writes reshape the graph in ways that are not worth mirroring
 * optimistically — a reorder renumbers siblings, a delete can cascade. These
 * replace the cached graph with the one the write produced — the data layer
 * applied the exact same writes it committed, so no refetch is needed.
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
    onSuccess: () => syncScopeAfterWrite(queryClient),
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

// ---- MVP features ---------------------------------------------------------

export const useCreateMvpFeature = () => useGraphMutation(apiClient.mvpFeatures.create)

export const useUpdateMvpFeature = () =>
  useGraphMutation(
    (vars: { id: number; patch: Parameters<typeof apiClient.mvpFeatures.update>[1] }) =>
      apiClient.mvpFeatures.update(vars.id, vars.patch),
  )

/**
 * Re-assigns an MSD feature, by moving the capabilities it owns. Their
 * placement is shared with every PwC feature citing them, so the refetch
 * brings back re-judged conflicts as well as the moved card.
 */
export const useSetMvpPlacement = () =>
  useGraphMutation(
    (vars: { id: number; patch: Parameters<typeof apiClient.mvpFeatures.setPlacement>[1] }) =>
      apiClient.mvpFeatures.setPlacement(vars.id, vars.patch),
  )

/**
 * Re-owns capabilities. The card's cells derive from what it owns, so a
 * change here can move the card — more than is worth mirroring by hand.
 */
export const useSetMvpCapabilities = () =>
  useGraphMutation((vars: { id: number; capabilityIds: number[] }) =>
    apiClient.mvpFeatures.setCapabilities(vars.id, vars.capabilityIds),
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
  useGraphMutation((vars: { id: number; cascade?: boolean }) =>
    apiClient.capabilities.remove(vars.id, vars.cascade ?? false),
  )

// ---- Conflict resolution --------------------------------------------------

export const useResolveConflict = () =>
  useGraphMutation(
    (vars: { id: number; state: string; note: string | null }) =>
      apiClient.conflicts.resolve(vars.id, {
        resolution_state: vars.state,
        resolution_note: vars.note,
      }),
  )
