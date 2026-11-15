import {
  bodyAreasFileSchema,
  bodyModelsFileSchema,
  sensorSitesFileSchema,
} from '../bodyview/schemas.ts'
import type { BodyModelEntry } from '../bodyview/types.ts'
import bodyAreasJson from './body-areas.json'
import bodyModelsJson from './body-models.json'
import { healthData } from './index.ts'
import sensorSitesJson from './sensor-sites.json'

// The body view's data files (ARCHITECTURE.md sections 22.3, 22.4, 22.6),
// validated at load like every other data file. None of it is a health input.

export const bodyModels = bodyModelsFileSchema.parse(bodyModelsJson).models
export const bodyAreas = bodyAreasFileSchema.parse(bodyAreasJson)
export const sensorSites = sensorSitesFileSchema.parse(sensorSitesJson)

/** The body model of one crew member, or null if they have none (c3). */
export function bodyModelFor(crewId: string): BodyModelEntry | null {
  return bodyModels.find((model) => model.crewId === crewId) ?? null
}

export function findBodyViewDataProblems(): string[] {
  const problems: string[] = []
  const knownSource = (id: string) =>
    healthData.sources.some((source) => source.id === id)
  const sourceIds = [
    ...bodyAreas.named.flatMap((area) => area.sourceIds),
    ...sensorSites.sites.flatMap((site) => site.sourceIds),
  ]
  for (const id of sourceIds) {
    if (!knownSource(id))
      problems.push(`unknown source in body view data: ${id}`)
  }
  const unique = (values: string[]) => new Set(values).size === values.length
  if (!unique(bodyModels.map((model) => model.id))) {
    problems.push('body-models.json repeats a model id')
  }
  if (!unique(bodyModels.map((model) => model.crewId))) {
    problems.push('body-models.json gives a crew member two bodies')
  }
  const areaIds = [
    ...bodyAreas.named.map((area) => area.id),
    ...bodyAreas.general.map((area) => area.id),
  ]
  if (!unique(areaIds)) problems.push('body-areas.json repeats an area id')
  if (!unique(sensorSites.sites.map((site) => site.id))) {
    problems.push('sensor-sites.json repeats a site')
  }
  return problems
}

const problems = findBodyViewDataProblems()
if (problems.length > 0) {
  throw new Error(
    `Body view data files are inconsistent:\n${problems.join('\n')}`,
  )
}
