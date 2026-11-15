import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bodyAreasFileSchema,
  bodyModelsFileSchema,
  sensorSitesFileSchema,
  suitReplayFileSchema,
} from '../../bodyview/schemas.ts'
import bodyAreasJson from '../body-areas.json'
import bodyModelsJson from '../body-models.json'
import {
  bodyAreas,
  bodyModelFor,
  bodyModels,
  findBodyViewDataProblems,
  sensorSites,
} from '../bodyView.ts'
import sensorSitesJson from '../sensor-sites.json'

function readSuitReplay(): unknown {
  const path = join(process.cwd(), 'public', 'seed', 'suit-replay.json')
  return JSON.parse(readFileSync(path, 'utf8'))
}

describe('body view data files', () => {
  it.each([
    ['body-models.json', bodyModelsFileSchema, bodyModelsJson],
    ['body-areas.json', bodyAreasFileSchema, bodyAreasJson],
    ['sensor-sites.json', sensorSitesFileSchema, sensorSitesJson],
    ['suit-replay.json', suitReplayFileSchema, readSuitReplay()],
  ] as const)('%s parses with its schema', (_name, schema, json) => {
    const result = schema.safeParse(json)
    expect(result.success ? [] : result.error.issues).toEqual([])
  })

  it('cross-references resolve', () => {
    expect(findBodyViewDataProblems()).toEqual([])
  })

  it('gives crew A and B a body and crew C none (section 22.3)', () => {
    expect(bodyModels.map((model) => [model.id, model.crewId])).toEqual([
      ['crew-a', 'c1'],
      ['crew-b', 'c2'],
    ])
    expect(bodyModelFor('c3')).toBeNull()
  })

  it('placeholders use the fictional profiles of section 23.8; a delivered model uses values measured on it', () => {
    const contract: Record<string, unknown> = {
      c1: {
        heightCm: 175,
        inseamCm: 79,
        shoulderBreadthCm: 42,
        upperArmCm: 34,
        forearmCm: 27,
        chestCm: 102,
        waistCm: 86,
        hipCm: 98,
        footCm: 27,
      },
      c2: {
        heightCm: 175,
        inseamCm: 84,
        shoulderBreadthCm: 37,
        upperArmCm: 31,
        forearmCm: 25,
        chestCm: 88,
        waistCm: 72,
        hipCm: 100,
        footCm: 25,
      },
    }
    for (const model of bodyModels) {
      if (model.status === 'placeholder') {
        expect(model.profile).toEqual(contract[model.crewId])
      } else {
        expect(model.profileSource).toBe('measured')
      }
    }
  })

  it('has the named shoulder area with its source and all 24 general areas', () => {
    expect(bodyAreas.named).toEqual([
      {
        id: 'shoulder_r_outer',
        label: 'Right outer shoulder',
        detail: 'deltoid area',
        patchObject: 'patch_shoulder_r_outer',
        sourceIds: ['deltoid-uw-atlas'],
      },
    ])
    expect(bodyAreas.general).toHaveLength(24)
    expect(bodyAreas.general.find((area) => area.id === 'calf_l')?.label).toBe(
      'Left calf',
    )
  })

  it('has three sensor sites with their anchors and display settings', () => {
    expect(sensorSites.sites.map((site) => [site.id, site.anchorNode])).toEqual(
      [
        ['chest', 'sensor_chest'],
        ['upper_back', 'sensor_upper_back'],
        ['forearm_l', 'sensor_forearm_l'],
      ],
    )
    expect([sensorSites.staleAfterMin, sensorSites.trendWindowMin]).toEqual([
      15, 60,
    ])
  })
})

describe('body view copy (section 27)', () => {
  const banned =
    /\b(you have|diagnosis|diagnose|injury|injuries|strain|inflammation)\b/i

  it.each([
    ['body-models.json', bodyModelsJson],
    ['body-areas.json', bodyAreasJson],
    ['sensor-sites.json', sensorSitesJson],
  ] as const)('%s uses none of the banned words', (_name, json) => {
    expect(JSON.stringify(json)).not.toMatch(banned)
  })
})
