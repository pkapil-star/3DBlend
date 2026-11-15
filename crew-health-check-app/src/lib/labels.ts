import { healthData } from '../data/index.ts'
import type {
  Baseline,
  CrewMember,
  Environment,
  EnvironmentId,
  IndicatorDef,
  IndicatorId,
  Protocol,
  RegionId,
  Route,
  Rule,
  SymptomId,
  ThresholdBasis,
} from '../engine/index.ts'

// Small look-ups and display words shared by the screens.

export function indicatorDef(id: IndicatorId): IndicatorDef {
  const def = healthData.indicators.find((entry) => entry.id === id)
  if (!def) throw new Error(`indicators.json has no ${id}`)
  return def
}

export function regionLabel(id: RegionId): string {
  return healthData.regions.find((region) => region.id === id)?.label ?? id
}

export function ruleById(ruleId: string): Rule | null {
  return healthData.rules.find((rule) => rule.id === ruleId) ?? null
}

export function protocolById(protocolId: string): Protocol | null {
  return (
    healthData.protocols.find((protocol) => protocol.id === protocolId) ?? null
  )
}

export function environmentDef(id: EnvironmentId): Environment {
  const environment = healthData.environments.find((entry) => entry.id === id)
  if (!environment) throw new Error(`environments.json has no ${id}`)
  return environment
}

/** "Crew member A, Commander" */
export function crewLabel(member: CrewMember): string {
  return `${member.name}, ${member.role}`
}

/** A protocol's re-check time in words: 0.25 -> "15 minutes", 4 -> "4 hours". */
export function recheckWords(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return minutes === 1 ? '1 minute' : `${minutes} minutes`
  }
  return hours === 1 ? '1 hour' : `${hours} hours`
}

/** "blurred_vision" -> "Blurred vision" */
export function symptomLabel(id: SymptomId): string {
  const words = id.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A value with its unit, at the precision it is entered in: "6.75 h", "62 mg/dL". */
export function formatValue(value: number, def: IndicatorDef): string {
  const text = String(def.step)
  const decimals = text.includes('.') ? text.length - text.indexOf('.') - 1 : 0
  const number = value.toFixed(decimals)
  return def.unit === '' ? number : `${number} ${def.unit}`
}

/** A derived value such as a normal: one decimal for fractional indicators. */
export function formatNormal(value: number, def: IndicatorDef): string {
  const number = value.toFixed(def.step < 1 ? 1 : 0)
  return def.unit === '' ? number : `${number} ${def.unit}`
}

/** "Your normal: 6.5 h", or "Learning your normal (3 of 7)" while the baseline is not ready. */
export function normalText(
  baseline: Baseline | undefined,
  def: IndicatorDef,
): string | null {
  if (!baseline) return null
  if (baseline.ready) {
    return `Your normal: ${formatNormal(baseline.center, def)}`
  }
  return `Learning your normal (${baseline.n} of ${baseline.needed})`
}

export const ROUTE_WORDS: Record<Route, string> = {
  act_on_board: 'Act now on board',
  consult_ground: 'Consult the ground',
  self_care: 'You can handle this yourself',
}

export const BASIS_WORDS: Record<ThresholdBasis, string> = {
  'nasa-standard': 'NASA standard',
  'peer-reviewed': 'Peer-reviewed research',
  'clinical-general': 'Common clinical cut-off',
  illustrative: 'Illustrative threshold',
}

/** What each basis tag says about where a check's limit comes from (section 12). */
export const BASIS_EXPLAIN: Record<ThresholdBasis, string> = {
  'nasa-standard': 'The limit in this check comes from a NASA standard.',
  'peer-reviewed': 'The limit in this check comes from published research.',
  'clinical-general':
    'The limit in this check is a common clinical cut-off used on Earth, not one made for spaceflight.',
  illustrative:
    'The limit in this check is a draft value for this prototype, not an established one.',
}
