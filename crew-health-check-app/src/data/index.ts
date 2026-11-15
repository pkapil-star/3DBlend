import {
  earthHospitalModelFileSchema,
  environmentsFileSchema,
  indicatorsFileSchema,
  personalPatternModelFileSchema,
  protocolsFileSchema,
  regionsFileSchema,
  rulesFileSchema,
  sepRiskModelFileSchema,
  sourcesFileSchema,
} from '../engine/schemas.ts'
import { findDataProblems, type HealthData } from '../engine/validateData.ts'
import environmentsJson from './environments.json'
import earthHospitalModelJson from './models/earth-hospital-v1.json'
import indicatorsJson from './indicators.json'
import personalPatternModelJson from './models/personal-pattern-v1.json'
import sepRiskModelJson from './models/sep-risk-v1.json'
import protocolsJson from './protocols.json'
import regionsJson from './regions.json'
import rulesJson from './rules.json'
import sourcesJson from './sources.json'

// Every data file is validated when the app loads (CLAUDE.md code rules):
// a schema error or a broken cross-reference stops the app with a clear
// message instead of producing wrong alerts.
const environmentsFile = environmentsFileSchema.parse(environmentsJson)

/** Link defaults; the ground handling time is a prototype assumption (section 13.2). */
export const linkDefaults = {
  groundHandlingMin: environmentsFile.groundHandlingMin,
  groundHandlingNote: environmentsFile.groundHandlingNote,
}

export const healthData: HealthData = {
  indicators: indicatorsFileSchema.parse(indicatorsJson).indicators,
  regions: regionsFileSchema.parse(regionsJson).regions,
  sources: sourcesFileSchema.parse(sourcesJson).sources,
  environments: environmentsFile.environments,
  rules: rulesFileSchema.parse(rulesJson).rules,
  protocols: protocolsFileSchema.parse(protocolsJson).protocols,
}

const problems = findDataProblems(healthData)
if (problems.length > 0) {
  throw new Error(`Health data files are inconsistent:\n${problems.join('\n')}`)
}

/**
 * The trained sep-risk model (section 26.9), written by ml/train_sep_risk.py
 * and never edited by hand. A file that does not match its schema stops the
 * app, like the other data files: a model must not half-load.
 */
export const sepRiskModel = sepRiskModelFileSchema.parse(sepRiskModelJson)

/**
 * The personal pattern model (section 26.18), written by
 * ml/eval_personal_pattern.py. Its evaluation is simulated; it can only ever
 * produce an insight (decision D19).
 */
export const personalPatternModel = personalPatternModelFileSchema.parse(
  personalPatternModelJson,
)

/**
 * The Earth hospital model (section 26.19), written by
 * ml/train_earth_hospital.py from PhysioNet ICU data. Learned on Earth,
 * never tested on astronauts; it can only ever produce an insight.
 */
export const earthHospitalModel = earthHospitalModelFileSchema.parse(
  earthHospitalModelJson,
)

function modelFileProblems(): string[] {
  const knownSource = (id: string) =>
    healthData.sources.some((source) => source.id === id)
  const problems = [
    ...sepRiskModel.sourceIds
      .filter((id) => !knownSource(id))
      .map((id) => `the sep-risk model file names an unknown source: ${id}`),
    ...personalPatternModel.sourceIds
      .filter((id) => !knownSource(id))
      .map(
        (id) =>
          `the personal-pattern model file names an unknown source: ${id}`,
      ),
  ]
  problems.push(
    ...earthHospitalModel.sourceIds
      .filter((id) => !knownSource(id))
      .map(
        (id) => `the earth-hospital model file names an unknown source: ${id}`,
      ),
  )
  // The models score today's readings, so each must be a daily indicator.
  for (const id of [
    ...personalPatternModel.indicators,
    ...earthHospitalModel.features.map((feature) => feature.indicator),
  ]) {
    const def = healthData.indicators.find((entry) => entry.id === id)
    if (def?.cadenceDays !== 1) {
      problems.push(`a second-opinion model needs a daily indicator, not ${id}`)
    }
  }
  return problems
}

const modelProblems = modelFileProblems()
if (modelProblems.length > 0) {
  throw new Error(`Model files are inconsistent:\n${modelProblems.join('\n')}`)
}
