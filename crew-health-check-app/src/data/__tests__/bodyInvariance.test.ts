import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadScenario } from '../../test/helpers.tsx'
import { useAppStore } from '../../store/index.ts'
import {
  selectEvaluation,
  selectEvaluationInput,
} from '../../store/selectors.ts'

// Decision D11 (section 22.1): with fixed health inputs, mission time and
// link settings, nothing in the body view changes the evaluation or the
// outbox. B2 adds switching between 2D and 3D and between models.

const scenarios = ['sleep-debt', 'fever', 'low-glucose', 'solar-storm']

function snapshot() {
  const state = useAppStore.getState()
  return {
    evaluation: structuredClone(selectEvaluation(state)),
    outbox: structuredClone(state.outbox),
    alertState: structuredClone(state.alertState),
  }
}

function bodyActions(crewId: string) {
  const store = useAppStore.getState()
  store.addSorenessReport({
    score: 9,
    areaId: 'chest',
    locationText: 'Chest',
    activityNote: 'after exercise',
    anchor: {
      modelId: 'crew-a',
      modelVersion: 'placeholder-1',
      target: 'body',
      point: [0, 1.3, 0.12],
      normal: [0, 0, 1],
    },
  })
  store.addSorenessReport({
    score: 10,
    areaId: null,
    locationText: 'Left calf',
    activityNote: '',
    anchor: null,
  })
  store.restartSuitReplay()
  store.setShow3d(true)
  store.setForce2d(true)
  store.setForce2d(false)
  const [first] = useAppStore
    .getState()
    .soreness.filter((report) => report.crewId === crewId)
  if (first) store.removeSorenessReport(first.id)
}

describe('body observations never change health results (invariance)', () => {
  it.each(scenarios)(
    '%s: every crew member, evaluation and outbox unchanged',
    (scenarioId) => {
      loadScenario(scenarioId)
      for (const crewId of ['c1', 'c2', 'c3']) {
        useAppStore.getState().switchCrew(crewId)
        const before = snapshot()
        bodyActions(crewId)
        expect(snapshot()).toEqual(before)
      }
    },
  )

  it('the engine input has no place for body data', () => {
    loadScenario('fever')
    useAppStore.getState().addSorenessReport({
      score: 7,
      areaId: null,
      locationText: 'Marker-place-7Q',
      activityNote: '',
      anchor: null,
    })
    const input = selectEvaluationInput(useAppStore.getState())
    expect(Object.keys(input).sort()).toEqual([
      'context',
      'crewId',
      'indicators',
      'link',
      'models',
      'nowMs',
      'readings',
      'rules',
      'spaceWeather',
      'symptoms',
    ])
    expect(JSON.stringify(input)).not.toContain('Marker-place-7Q')
  })
})

describe('the body model in use and the 2D or 3D choice cannot reach the engine', () => {
  function sourcesUnder(folder: string): string[] {
    return readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
  }

  it('neither the engine nor the selectors import body view code or data', () => {
    const health = [
      ...sourcesUnder(join(process.cwd(), 'src', 'engine')),
      readFileSync(join(process.cwd(), 'src', 'store', 'selectors.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src', 'store', 'alertSync.ts'), 'utf8'),
    ]
    for (const source of health) {
      expect(source).not.toMatch(
        /from '[^']*(bodyview|bodyView|features\/body|bodyModelStatus)[^']*'/,
      )
    }
  })
})
