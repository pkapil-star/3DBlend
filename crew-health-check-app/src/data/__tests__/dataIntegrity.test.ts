import { describe, expect, it } from 'vitest'
import {
  environmentsFileSchema,
  indicatorsFileSchema,
  protocolsFileSchema,
  regionsFileSchema,
  rulesFileSchema,
  sourcesFileSchema,
} from '../../engine/schemas.ts'
import { findDataProblems } from '../../engine/validateData.ts'
import { CONTEXT_FEED_REGION, DAILY_CONTEXT_FEEDS } from '../../engine/index.ts'
import environmentsJson from '../environments.json'
import { healthData } from '../index.ts'
import indicatorsJson from '../indicators.json'
import protocolsJson from '../protocols.json'
import regionsJson from '../regions.json'
import rulesJson from '../rules.json'
import sourcesJson from '../sources.json'

describe('every data file parses with its schema', () => {
  it.each([
    ['indicators.json', indicatorsFileSchema, indicatorsJson],
    ['regions.json', regionsFileSchema, regionsJson],
    ['sources.json', sourcesFileSchema, sourcesJson],
    ['environments.json', environmentsFileSchema, environmentsJson],
    ['rules.json', rulesFileSchema, rulesJson],
    ['protocols.json', protocolsFileSchema, protocolsJson],
  ] as const)('%s', (_name, schema, json) => {
    const result = schema.safeParse(json)
    expect(result.success ? [] : result.error.issues).toEqual([])
  })
})

describe('cross-references (section 11.6)', () => {
  it('all resolve', () => {
    expect(findDataProblems(healthData)).toEqual([])
  })
})

describe('content of the M1 data', () => {
  it('has all ten indicators and all seven regions', () => {
    expect(healthData.indicators).toHaveLength(10)
    expect(healthData.regions).toHaveLength(7)
  })

  it('has exactly the six P0 rules and the model outlook, each with a protocol', () => {
    expect(healthData.rules.map((rule) => rule.id)).toEqual([
      'R-SLEEP-01',
      'R-TEMP-01',
      'R-TEMP-02',
      'R-GLU-02',
      'R-CO2-01',
      'R-RAD-01',
      'R-RAD-03',
    ])
    expect(healthData.protocols.map((protocol) => protocol.id).sort()).toEqual([
      'P-CO2-AIR',
      'P-GLU-LOW',
      'P-RAD-PREPARE',
      'P-RAD-SHELTER',
      'P-SLEEP-HYGIENE',
      'P-TEMP-ACT',
      'P-TEMP-WATCH',
    ])
  })

  it('labels every threshold basis as in section 12', () => {
    const basis = Object.fromEntries(
      healthData.rules.map((rule) => [rule.id, rule.basis]),
    )
    // R-TEMP-02 is illustrative: its 2.0 °C branch is a draft value, and there
    // is no clinical source for 39.0 °C in the registry yet.
    expect(basis).toEqual({
      'R-SLEEP-01': 'illustrative',
      'R-TEMP-01': 'illustrative',
      'R-TEMP-02': 'illustrative',
      'R-GLU-02': 'clinical-general',
      'R-CO2-01': 'nasa-standard',
      'R-RAD-01': 'illustrative',
      'R-RAD-03': 'illustrative',
    })
  })

  it('sources the Moon delay and labels the station delay as an assumption', () => {
    const moon = healthData.environments.find(
      (env) => env.id === 'lunar_surface',
    )
    const station = healthData.environments.find(
      (env) => env.id === 'leo_station',
    )
    expect(moon?.sourceIds).toEqual(['gateway-medical-conops'])
    expect(moon?.notes).toContain('light-travel time')
    expect(station?.notes).toContain('Prototype assumption')
  })

  it('gives every protocol a draft note, and no protocol names a medication', () => {
    for (const protocol of healthData.protocols) {
      expect(protocol.note.length).toBeGreaterThan(0)
      expect(JSON.stringify(protocol).toLowerCase()).not.toMatch(
        /glucagon|insulin/,
      )
    }
    const glucose = healthData.protocols.find(
      (entry) => entry.id === 'P-GLU-LOW',
    )
    expect(glucose?.note).toContain('Not an approved spaceflight protocol')
  })

  it('cites a clinical source for the low-glucose cut-off and its protocol', () => {
    const rule = healthData.rules.find((entry) => entry.id === 'R-GLU-02')
    const protocol = healthData.protocols.find(
      (entry) => entry.id === 'P-GLU-LOW',
    )
    expect(rule?.sourceIds).toContain('hypoglycemia-ada-2025')
    expect(protocol?.sourceIds).toEqual(['hypoglycemia-ada-2025'])
  })

  it('lists every habitat feed under Environment, where the engine expects them', () => {
    const environment = healthData.regions.find(
      (region) => region.id === CONTEXT_FEED_REGION,
    )
    for (const feed of DAILY_CONTEXT_FEEDS) {
      expect(environment?.contextFeeds).toContain(feed)
    }
    const elsewhere = healthData.regions
      .filter((region) => region.id !== CONTEXT_FEED_REGION)
      .flatMap((region) => region.contextFeeds)
    expect(elsewhere).toEqual([])
  })

  it('only R-RAD-03 reads the model, and its condition holds no number of its own', () => {
    const readers = healthData.rules.filter((rule) =>
      JSON.stringify(rule.when).includes('sep_risk'),
    )
    expect(readers.map((rule) => rule.id)).toEqual(['R-RAD-03'])
    // The threshold comes from the model file through modelThreshold
    // (section 11.1): the only number here is the window in days.
    expect(readers[0]?.when).toEqual({
      type: 'context',
      feed: 'sep_risk',
      windowDays: 1,
      test: { kind: 'modelThreshold', op: 'gte', model: 'sep-risk' },
    })
    expect(JSON.stringify(rulesJson).match(/modelThreshold/g)).toHaveLength(1)
  })

  it('keeps the model outlook at watch level, without the ground, under the event alert', () => {
    const outlook = healthData.rules.find((rule) => rule.id === 'R-RAD-03')
    const event = healthData.rules.find((rule) => rule.id === 'R-RAD-01')
    expect(outlook?.severity).toBe('watch')
    expect(outlook?.needsGround).toBe(false)
    expect(outlook?.protocolId).toBe('P-RAD-PREPARE')
    expect(outlook?.sourceIds).toEqual([
      'donki',
      'radiation-nasa-ochmo',
      'sep-ml-inceoglu-2018',
    ])
    expect(event?.supersedes).toEqual(['R-RAD-03'])
    // Wording (CLAUDE.md): a score, never a chance, a percent or "will".
    const words = [
      outlook?.title,
      outlook?.explain.what,
      outlook?.explain.whySpace,
    ].join(' ')
    expect(words).not.toMatch(/%|chance|probab|\bwill\b|predicts/i)
    expect(words).toMatch(/possible/i)
  })

  it('keeps every source unverified and every protocol a draft until a person reviews them', () => {
    expect(healthData.sources).toHaveLength(37)
    expect(healthData.sources.filter((source) => source.verified)).toEqual([])
    expect(
      healthData.protocols.filter((protocol) => protocol.reviewed),
    ).toEqual([])
  })

  it('sets the environment delays from section 14', () => {
    const delays = Object.fromEntries(
      healthData.environments.map((env) => [
        env.id,
        [env.oneWayDelaySecMin, env.oneWayDelaySecMax],
      ]),
    )
    expect(delays).toEqual({
      leo_station: [0, 0],
      lunar_surface: [1.3, 1.3],
      mars_transit: [180, 1320],
      mars_surface: [180, 1320],
      mars_rover: [180, 1320],
    })
  })
})
