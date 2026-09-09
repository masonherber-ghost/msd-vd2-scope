import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export const notesKeys = {
  all: ['notes'] as const,
}

export function useNotes() {
  return useQuery({
    queryKey: notesKeys.all,
    queryFn: apiClient.notes.list,
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (text: string) => apiClient.notes.create(text),
    onSuccess: () => {
      // One invalidate, not a fan-out.
      void queryClient.invalidateQueries({ queryKey: notesKeys.all })
    },
  })
}
