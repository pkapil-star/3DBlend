import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MS_PER_DAY,
  evaluate,
  type Evaluation,
  type EvaluationInput,
  type Reading,
  type ScenarioFile,
} from '../../engine/index.ts'
import { scenarioFileSchema } from '../../engine/schemas.ts'
import {
  earthHospitalModel,
  healthData,
  personalPatternModel,
  sepRiskModel,
} from '../index.ts'

// Second-opinion invariance (ARCHITECTURE.md sections 26.17 and 27): with
// the second-opinion models loaded or set to null, evaluate() gives identical
// alerts, region statuses, overall status and routes. Insights never touch them.

const SEED_DIR = join(process.cwd(), 'public', 'seed')
const NINE_AM_MS = 9 * 3_600_000

const scenarios: ScenarioFile[] = readdirSync(SEED_DIR)
  .filter(
    (name) =>
      name.endsWith('.json') &&
      name !== 'index.json' &&
      name !== 'suit-replay.json',
  )
  .sort()
  .map((name) =>
    scenarioFileSchema.parse(
      JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8')),
    ),
  )

function inputFor(
  scenario: ScenarioFile,
  crewId: string,
  readings: readonly Reading[],
  delaySec: number,
): Omit<EvaluationInput, 'models'> {
  return {
    nowMs: (scenario.missionDay - 1) * MS_PER_DAY + NINE_AM_MS,
    crewId,
    readings,
    symptoms: scenario.symptoms,
    context: scenario.context,
    link: { oneWayDelaySec: delaySec, linkUp: true, groundHandlingMin: 5 },
    indicators: healthData.indicators,
    rules: healthData.rules,
    spaceWeather: scenario.spaceWeather,
  }
}

/** Everything a second opinion must never change: all of the evaluation but the insights. */
function decisions(evaluation: Evaluation) {
  return Object.fromEntries(
    Object.entries(evaluation).filter(
      ([key]) => key !== 'insights' && key !== 'patternReadiness',
    ),
  )
}

/** Today's morning check-in, pushed far from normal so the model has something to say. */
function unusualCheckIn(scenario: ScenarioFile, crewId: string): Reading[] {
  const atMs = (scenario.missionDay - 1) * MS_PER_DAY + 8 * 3_600_000
  const values: Partial<Record<Reading['indicator'], number>> = {
    sleep_hours: 4,
    mood: 2,
    heart_rate: 80,
    reaction_time: 380,
    systolic_bp: 108,
    diastolic_bp: 64,
    body_temp: 37.2,
    blood_glucose: 84,
  }
  return Object.entries(values).map(([indicator, value]) => ({
    crewId,
    indicator: indicator as Reading['indicator'],
    value: value ?? 0,
    day: scenario.missionDay,
    atMs,
    origin: 'manual' as const,
  }))
}

describe('second opinions never change alerts, statuses or routes', () => {
  const cases = scenarios.flatMap((scenario) =>
    scenario.crew.flatMap((member) =>
      [false, true].map(
        (checkIn) =>
          [
            `${scenario.scenarioId} ${member.id}${checkIn ? ' after an unusual check-in' : ''}`,
            scenario,
            member.id,
            checkIn,
          ] as const,
      ),
    ),
  )

  it.each(cases)('%s', (_, scenario, crewId, checkIn) => {
    const readings = checkIn
      ? [...scenario.readings, ...unusualCheckIn(scenario, crewId)]
      : scenario.readings
    for (const delaySec of [0, 180, 1320]) {
      for (const sepRisk of [sepRiskModel, null]) {
        const base = inputFor(scenario, crewId, readings, delaySec)
        const loaded = evaluate({
          ...base,
          models: {
            sepRisk,
            personalPattern: personalPatternModel,
            earthHospital: earthHospitalModel,
          },
        })
        const off = evaluate({
          ...base,
          models: { sepRisk, personalPattern: null, earthHospital: null },
        })
        expect(decisions(loaded)).toEqual(decisions(off))
        expect(off.insights).toEqual([])
      }
    }
  })

  it('the unusual check-in really gives insights, so the comparison is not empty', () => {
    const withInsight = scenarios.filter((scenario) => {
      const [member] = scenario.crew
      if (!member) return false
      const readings = [
        ...scenario.readings,
        ...unusualCheckIn(scenario, member.id),
      ]
      return (
        evaluate({
          ...inputFor(scenario, member.id, readings, 0),
          models: {
            sepRisk: sepRiskModel,
            personalPattern: personalPatternModel,
            earthHospital: earthHospitalModel,
          },
        }).insights.length > 0
      )
    })
    expect(withInsight.length).toBeGreaterThan(scenarios.length / 2)
  })
})
