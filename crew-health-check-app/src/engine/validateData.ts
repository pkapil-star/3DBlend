import { usesBaseline } from './comparison.ts'
import { INDICATOR_IDS, REGION_IDS } from './schemas.ts'
import type {
  Comparison,
  Condition,
  Environment,
  IndicatorDef,
  Protocol,
  RegionDef,
  Rule,
  Source,
} from './types.ts'

/** The parsed health data files (each already passed its Zod schema). */
export interface HealthData {
  indicators: readonly IndicatorDef[]
  regions: readonly RegionDef[]
  sources: readonly Source[]
  environments: readonly Environment[]
  rules: readonly Rule[]
  protocols: readonly Protocol[]
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id)
    seen.add(id)
  }
  return [...repeated]
}

function conditionsOf(condition: Condition): Condition[] {
  if (condition.type === 'all' || condition.type === 'any') {
    return [condition, ...condition.of.flatMap(conditionsOf)]
  }
  return [condition]
}

/**
 * The evidence ladder (decision D19) as a data check: a rule that reads the
 * model feed may only raise a watch alert that does not need the ground, so a
 * model output can never raise an act alert or change a route. Its limit must
 * come from the model file, never from a number typed in rules.json.
 */
function modelFeedProblems(rule: Rule, test: Comparison): string[] {
  const problems: string[] = []
  if (test.kind !== 'modelThreshold') {
    problems.push(
      `${rule.id}: a condition on the sep_risk feed must use a modelThreshold comparison, so no model number is typed in rules.json`,
    )
  }
  if (rule.severity !== 'watch') {
    problems.push(
      `${rule.id}: a rule that reads the sep_risk model feed must be watch-level`,
    )
  }
  if (rule.needsGround) {
    problems.push(
      `${rule.id}: a rule that reads the sep_risk model feed must not need the ground, so the model never changes a route`,
    )
  }
  return problems
}

/** Problems in one rule's `when` tree (sections 11.2 and 11.6). */
function conditionProblems(
  rule: Rule,
  indicatorIds: ReadonlySet<string>,
): string[] {
  const problems: string[] = []
  for (const condition of conditionsOf(rule.when)) {
    if (
      condition.type === 'all' ||
      condition.type === 'any' ||
      condition.type === 'symptom'
    ) {
      continue
    }
    const test = condition.test
    if (test.kind === 'modelThreshold') {
      if (condition.type !== 'context' || condition.feed !== 'sep_risk') {
        problems.push(
          `${rule.id}: a modelThreshold comparison is only allowed in a context condition on the sep_risk feed`,
        )
      }
    }
    if (condition.type === 'context') {
      if (usesBaseline(test)) {
        problems.push(
          `${rule.id}: baseline comparisons are not valid for context feeds`,
        )
      }
      if (condition.feed === 'sep_risk') {
        problems.push(...modelFeedProblems(rule, test))
      }
      continue
    }
    if (!indicatorIds.has(condition.indicator)) {
      problems.push(
        `${rule.id}: indicator ${condition.indicator} is not in indicators.json`,
      )
    }
    if (
      condition.type === 'streak' &&
      condition.minCount > condition.windowDays
    ) {
      problems.push(`${rule.id}: streak minCount is larger than windowDays`)
    }
  }
  return problems
}

/** Finds a cycle in the `supersedes` graph, as a list of rule IDs, or null. */
function supersedeCycle(rules: readonly Rule[]): string[] | null {
  const edges = new Map(rules.map((rule) => [rule.id, rule.supersedes]))
  const visiting = new Set<string>()
  const done = new Set<string>()

  function visit(id: string, path: string[]): string[] | null {
    if (visiting.has(id)) return [...path, id]
    if (done.has(id)) return null
    visiting.add(id)
    for (const next of edges.get(id) ?? []) {
      const cycle = visit(next, [...path, id])
      if (cycle) return cycle
    }
    visiting.delete(id)
    done.add(id)
    return null
  }

  for (const rule of rules) {
    const cycle = visit(rule.id, [])
    if (cycle) return cycle
  }
  return null
}

/**
 * Cross-reference checks for the health data files (section 11.6). Returns
 * one plain-language line per problem; an empty list means the data is consistent.
 */
export function findDataProblems(data: HealthData): string[] {
  const problems: string[] = []
  const sourceIds = new Set(data.sources.map((source) => source.id))
  const protocolIds = new Set(data.protocols.map((protocol) => protocol.id))
  const ruleIds = new Set(data.rules.map((rule) => rule.id))
  const indicatorIds = new Set<string>(data.indicators.map((def) => def.id))

  const idLists: [string, readonly string[]][] = [
    ['indicators.json', data.indicators.map((item) => item.id)],
    ['regions.json', data.regions.map((item) => item.id)],
    ['sources.json', data.sources.map((item) => item.id)],
    ['environments.json', data.environments.map((item) => item.id)],
    ['rules.json', data.rules.map((item) => item.id)],
    ['protocols.json', data.protocols.map((item) => item.id)],
  ]
  for (const [file, ids] of idLists) {
    for (const id of duplicates(ids))
      problems.push(`${file}: duplicate ID ${id}`)
  }

  const checkSources = (owner: string, ids: readonly string[]) => {
    for (const id of ids) {
      if (!sourceIds.has(id)) problems.push(`${owner}: unknown source ${id}`)
    }
  }

  for (const id of INDICATOR_IDS) {
    if (!indicatorIds.has(id))
      problems.push(`indicators.json: indicator ${id} is missing`)
  }
  for (const def of data.indicators) checkSources(def.id, def.sourceIds)

  for (const id of REGION_IDS) {
    if (!data.regions.some((region) => region.id === id)) {
      problems.push(`regions.json: region ${id} is missing`)
    }
  }
  for (const def of data.indicators) {
    const listedIn = data.regions.filter((region) =>
      region.indicators.includes(def.id),
    )
    if (listedIn.length !== 1 || listedIn[0]?.id !== def.region) {
      problems.push(
        `regions.json: indicator ${def.id} must be listed once, under its region ${def.region}`,
      )
    }
  }

  for (const environment of data.environments) {
    checkSources(environment.id, environment.sourceIds)
  }
  for (const protocol of data.protocols)
    checkSources(protocol.id, protocol.sourceIds)

  for (const rule of data.rules) {
    if (!protocolIds.has(rule.protocolId)) {
      problems.push(`${rule.id}: unknown protocol ${rule.protocolId}`)
    }
    checkSources(rule.id, rule.sourceIds)
    if (rule.sourceIds.length === 0 && rule.basis !== 'illustrative') {
      problems.push(
        `${rule.id}: needs at least one source unless its basis is illustrative`,
      )
    }
    for (const target of rule.supersedes) {
      if (target === rule.id) problems.push(`${rule.id}: supersedes itself`)
      else if (!ruleIds.has(target))
        problems.push(`${rule.id}: supersedes unknown rule ${target}`)
    }
    problems.push(...conditionProblems(rule, indicatorIds))
  }

  const cycle = supersedeCycle(data.rules)
  if (cycle) problems.push(`rules.json: supersedes cycle ${cycle.join(' -> ')}`)

  return problems
}
