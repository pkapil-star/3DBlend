import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MS_PER_DAY, evaluate } from '../../engine/index.ts'
import type {
  EarthHospitalModel,
  PersonalPatternModel,
  ScenarioFile,
  SepRiskModel,
} from '../../engine/index.ts'
import {
  scenarioFileSchema,
  scenarioIndexSchema,
  spaceWeatherFileSchema,
} from '../../engine/schemas.ts'
import {
  earthHospitalModel,
  healthData,
  personalPatternModel,
  sepRiskModel,
} from '../index.ts'

// Golden scenario tests (ARCHITECTURE.md section 27): every generated file in
// public/seed must trigger exactly its expectedAlerts, and give exactly its
// expectedInsights, at 09:00 on its mission day, the moment loadScenario sets.
// These back every "the app detects X" claim.

const SEED_DIR = join(process.cwd(), 'public', 'seed')
const NINE_AM_MS = 9 * 3_600_000

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const scenarioFiles = readdirSync(SEED_DIR)
  .filter(
    (name) =>
      name.endsWith('.json') &&
      name !== 'index.json' &&
      name !== 'suit-replay.json',
  )
  .sort()

function load(name: string): ScenarioFile {
  return scenarioFileSchema.parse(readJson(join(SEED_DIR, name)))
}

interface Models {
  sepRisk: SepRiskModel | null
  personalPattern: PersonalPatternModel | null
  earthHospital: EarthHospitalModel | null
}

const LOADED: Models = {
  sepRisk: sepRiskModel,
  personalPattern: personalPatternModel,
  earthHospital: earthHospitalModel,
}

/** One crew member at 09:00 on the scenario's mission day, as the app evaluates it. */
function evaluateAt(
  scenario: ScenarioFile,
  crewId: string,
  models: Models = LOADED,
) {
  const environment = healthData.environments.find(
    (env) => env.id === scenario.environmentId,
  )
  if (!environment)
    throw new Error(`unknown environment ${scenario.environmentId}`)
  return evaluate({
    nowMs: (scenario.missionDay - 1) * MS_PER_DAY + NINE_AM_MS,
    crewId,
    readings: scenario.readings,
    symptoms: scenario.symptoms,
    context: scenario.context,
    link: {
      oneWayDelaySec: environment.oneWayDelaySecMin,
      linkUp: true,
      groundHandlingMin: 5,
    },
    indicators: healthData.indicators,
    rules: healthData.rules,
    spaceWeather: scenario.spaceWeather,
    models,
  })
}

/** Non-superseded alerts for every crew member, as "crew:rule", sorted. */
function activeAlerts(
  scenario: ScenarioFile,
  models: Models = LOADED,
): string[] {
  return scenario.crew
    .flatMap((member) =>
      evaluateAt(scenario, member.id, models)
        .alerts.filter((alert) => alert.supersededBy === null)
        .map((alert) => `${alert.crewId}:${alert.ruleId}`),
    )
    .sort()
}

describe('generated scenario files', () => {
  it('include the three P0 scenarios', () => {
    expect(scenarioFiles).toEqual(
      expect.arrayContaining([
        'baseline-healthy.json',
        'sleep-debt.json',
        'solar-storm.json',
      ]),
    )
  })

  it.each(scenarioFiles)(
    '%s parses, is marked simulated and uses fictional names',
    (name) => {
      const scenario = load(name)
      expect(scenario.simulated).toBe(true)
      expect(`${scenario.scenarioId}.json`).toBe(name)
      for (const member of scenario.crew) {
        expect(member.name).toMatch(/^Crew member [A-Z]$/)
      }
    },
  )

  it.each(scenarioFiles)('%s gives exactly its expected alerts', (name) => {
    const scenario = load(name)
    const expected = scenario.expectedAlerts
      .map((alert) => `${alert.crewId}:${alert.ruleId}`)
      .sort()
    expect(activeAlerts(scenario)).toEqual(expected)
  })

  it.each(scenarioFiles)('%s gives exactly its expected insights', (name) => {
    const scenario = load(name)
    const insights = scenario.crew
      .flatMap((member) => evaluateAt(scenario, member.id).insights)
      .map((insight) => `${insight.crewId}:${insight.modelId}`)
      .sort()
    // Both second-opinion models are loaded: the file lists every insight they give.
    const expected = scenario.expectedInsights
      .map((insight) => `${insight.crewId}:${insight.modelId}`)
      .sort()
    expect(insights).toEqual(expected)
  })

  it('pattern-shift gives no alert and exactly the personal-pattern insight for c1', () => {
    const scenario = load('pattern-shift.json')
    expect(activeAlerts(scenario)).toEqual([])
    const evaluation = evaluateAt(scenario, 'c1')
    expect(evaluation.insights).toHaveLength(1)
    const [insight] = evaluation.insights
    expect(insight?.key).toBe(`personal-pattern:c1:${scenario.missionDay}`)
    expect(insight?.score).toBeGreaterThan(1)
    expect(insight?.factors).toHaveLength(3)
    expect(evaluation.overall).toBe('good')
  })

  it('solar-flare-watch gives exactly the model outlook R-RAD-03, as a watch alert', () => {
    const scenario = load('solar-flare-watch.json')
    expect(activeAlerts(scenario)).toEqual([
      'c1:R-RAD-03',
      'c2:R-RAD-03',
      'c3:R-RAD-03',
    ])
    const [alert] = evaluateAt(scenario, 'c1').alerts
    expect(alert?.severity).toBe('watch')
    expect(alert?.route).toBe('self_care')
    expect(alert?.evidence[0]?.model?.flare.donkiId).toBe(
      scenario.spaceWeather[0]?.donkiId,
    )
  })

  it('solar-storm gives R-RAD-01, with the model outlook R-RAD-03 superseded', () => {
    const alerts = evaluateAt(load('solar-storm.json'), 'c1').alerts
    expect(
      alerts.map((alert) => [alert.ruleId, alert.supersededBy]).sort(),
    ).toEqual([
      ['R-RAD-01', null],
      ['R-RAD-03', 'R-RAD-01'],
    ])
  })

  it('without the model file no scenario shows R-RAD-03, and nothing else changes', () => {
    for (const name of scenarioFiles) {
      const scenario = load(name)
      const withModel = activeAlerts(scenario)
      const without = activeAlerts(scenario, { ...LOADED, sepRisk: null })
      expect(without).toEqual(
        withModel.filter((alert) => !alert.endsWith(':R-RAD-03')),
      )
    }
    expect(
      activeAlerts(load('solar-flare-watch.json'), {
        ...LOADED,
        sepRisk: null,
      }),
    ).toEqual([])
  })

  it('scenario flares are real DONKI records, each named in the scenario note', () => {
    for (const name of scenarioFiles) {
      const scenario = load(name)
      for (const flare of scenario.spaceWeather) {
        expect(flare.donkiId).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-FLR-\d{3}$/,
        )
        expect(flare.link).toMatch(/^https:\/\/ccmc\.gsfc\.nasa\.gov\/DONKI\//)
        expect(scenario.basedOn).toContain(flare.donkiId)
        expect(flare.peakMs).toBeLessThanOrEqual(
          (scenario.missionDay - 1) * MS_PER_DAY + NINE_AM_MS,
        )
      }
      if (scenario.basedOn !== null) {
        expect(scenario.basedOn).toContain(
          'The crew and their health readings are simulated.',
        )
      }
    }
  })

  it('every reading is within its indicator input range', () => {
    const ranges = new Map(
      healthData.indicators.map((def) => [
        def.id,
        [def.inputMin, def.inputMax],
      ]),
    )
    for (const name of scenarioFiles) {
      for (const reading of load(name).readings) {
        const [min, max] = ranges.get(reading.indicator) ?? [0, 0]
        expect(reading.value).toBeGreaterThanOrEqual(min ?? 0)
        expect(reading.value).toBeLessThanOrEqual(max ?? 0)
      }
    }
  })

  it('leave today free for the check-in, except where the story needs a reading', () => {
    const sleepDebt = load('sleep-debt.json')
    const today = sleepDebt.readings.filter(
      (reading) => reading.day === sleepDebt.missionDay,
    )
    expect(today).toEqual([])
    expect(sleepDebt.context.at(-1)?.day).toBe(sleepDebt.missionDay)
  })
})

describe('scenario index and space weather file', () => {
  it('index.json lists every scenario file and the default scenario', () => {
    const index = scenarioIndexSchema.parse(
      readJson(join(SEED_DIR, 'index.json')),
    )
    expect(
      index.scenarios.map((entry) => `${entry.scenarioId}.json`).sort(),
    ).toEqual(scenarioFiles)
    expect(index.defaultScenarioId).toBe('sleep-debt')
    for (const entry of index.scenarios) {
      const scenario = load(`${entry.scenarioId}.json`)
      expect(entry).toEqual({
        scenarioId: scenario.scenarioId,
        title: scenario.title,
        environmentId: scenario.environmentId,
        missionDay: scenario.missionDay,
        basedOn: scenario.basedOn,
      })
    }
  })

  it('solar-storm starts at the station', () => {
    expect(load('solar-storm.json').environmentId).toBe('leo_station')
  })

  it('space-weather.json lists only real events, and says so when there are none', () => {
    const file = spaceWeatherFileSchema.parse(
      readJson(join(process.cwd(), 'public', 'data', 'space-weather.json')),
    )
    const withRealEvent = scenarioFiles
      .map(load)
      .filter((scenario) => scenario.basedOn !== null)
      .map((scenario) => scenario.scenarioId)
      .sort()
    expect(
      [...new Set(file.events.flatMap((event) => event.usedIn))].sort(),
    ).toEqual(withRealEvent)
    // Every flare a scenario replays is listed, with the scenario that uses it.
    for (const scenario of scenarioFiles.map(load)) {
      for (const flare of scenario.spaceWeather) {
        const listed = file.events.find(
          (event) => event.donkiId === flare.donkiId,
        )
        expect(listed?.type).toBe('FLR')
        expect(listed?.link).toBe(flare.link)
        expect(listed?.usedIn).toContain(scenario.scenarioId)
      }
    }
    expect(new Set(file.events.map((event) => event.donkiId)).size).toBe(
      file.events.length,
    )
    if (file.events.length === 0) {
      expect(file.note).toContain('No real DONKI event')
    } else {
      expect(file.retrievedAt).not.toBeNull()
      expect(file.note).toContain('simulated')
    }
  })
})
