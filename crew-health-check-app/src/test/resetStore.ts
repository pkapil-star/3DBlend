import { emptyState, useAppStore } from '../store/index.ts'

/**
 * A clean store and empty storage, as on a first visit. Kept apart from
 * helpers.tsx so the setup file does not load the screens before a test
 * file's vi.mock calls are registered.
 */
export function resetStore(): void {
  localStorage.clear()
  useAppStore.setState(emptyState())
}
