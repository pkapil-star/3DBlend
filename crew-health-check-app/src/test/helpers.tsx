import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { ScenarioFile } from '../engine/index.ts'
import { scenarioFileSchema } from '../engine/schemas.ts'
import { routes } from '../routes.tsx'
import { useAppStore } from '../store/index.ts'

export { resetStore } from './resetStore.ts'

/** Reads a generated scenario file from public/seed, validated like the app does. */
export function readScenario(scenarioId: string): ScenarioFile {
  const path = join(process.cwd(), 'public', 'seed', `${scenarioId}.json`)
  return scenarioFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}

export function loadScenario(scenarioId: string): ScenarioFile {
  const scenario = readScenario(scenarioId)
  useAppStore.getState().loadScenario(scenario)
  return scenario
}

/** Renders the whole app at a route, with the same routes as the real router. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return { router, ...render(<RouterProvider router={router} />) }
}
