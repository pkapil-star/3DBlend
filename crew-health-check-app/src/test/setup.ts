import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { resetStore } from './resetStore.ts'

// Every test starts like a first visit: empty store, empty storage.
beforeEach(() => {
  resetStore()
})

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
})
