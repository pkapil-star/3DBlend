import {
  earthHospitalModel,
  healthData,
  personalPatternModel,
  sepRiskModel,
} from '../data/index.ts'
import {
  evaluate,
  missionDayOf,
  type CrewMember,
  type Environment,
  type Evaluation,
  type EvaluationInput,
} from '../engine/index.ts'
import type { AppState } from './index.ts'

// Everything derived is computed here, never stored (section 21).

/**
 * The engine's input, built from the health slices only. Body observations
 * have no place in it (decision D11).
 */
export function selectEvaluationInput(state: AppState): EvaluationInput {
  return {
    nowMs: state.mission.nowMs,
    crewId: state.mission.activeCrewId,
    readings: state.readings,
    symptoms: state.symptoms,
    context: state.context,
    link: state.mission.link,
    indicators: healthData.indicators,
    rules: healthData.rules,
    spaceWeather: state.spaceWeather,
    models: {
      sepRisk: sepRiskModel,
      personalPattern: personalPatternModel,
      earthHospital: earthHospitalModel,
    },
  }
}

let cached: { inputs: readonly unknown[]; evaluation: Evaluation } | null = null

/** Memoized: the same slices give the same Evaluation object, so screens do not re-render for nothing. */
export function selectEvaluation(state: AppState): Evaluation {
  const inputs = [
    state.readings,
    state.symptoms,
    state.context,
    state.spaceWeather,
    state.mission.nowMs,
    state.mission.link,
    state.mission.activeCrewId,
  ]
  if (
    cached &&
    inputs.every((value, index) => Object.is(value, cached?.inputs[index]))
  ) {
    return cached.evaluation
  }
  const evaluation = evaluate(selectEvaluationInput(state))
  cached = { inputs, evaluation }
  return evaluation
}

export function selectToday(state: AppState): number {
  return missionDayOf(state.mission.nowMs)
}

export function selectActiveCrew(state: AppState): CrewMember | null {
  return (
    state.crew.find((member) => member.id === state.mission.activeCrewId) ??
    null
  )
}

export function selectEnvironment(state: AppState): Environment | null {
  return (
    healthData.environments.find(
      (entry) => entry.id === state.mission.environmentId,
    ) ?? null
  )
}
