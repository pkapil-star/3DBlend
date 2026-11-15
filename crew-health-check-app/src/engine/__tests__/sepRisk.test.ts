import { describe, expect, it } from 'vitest'
import {
  flareFeatures,
  highestSepRisk,
  log10PeakFlux,
  longitudeWestDeg,
  sepRiskProbability,
  sepRiskScore,
  topFactors,
  type FlareInput,
} from '../models/sepRisk.ts'
import { SEP_RISK_FEATURE_NAMES } from '../schemas.ts'
import type { SepRiskModel } from '../types.ts'
import { FIXTURE_MODEL, flare, nineAm } from './fixtures.ts'

// The sep-risk model in the app (section 26.10). The numbers here are made up
// so that results can be checked by hand; the trained model is checked
// against Python in src/data/__tests__/sepRiskModel.test.ts.

const OBSERVATION: FlareInput = {
  classType: 'X2.2',
  sourceLocation: 'S17W33',
  riseMin: 28,
  durationMin: 61,
  cme: { speedKms: 1200, halfAngleDeg: 45 },
}

/** All eight features, each with coefficient 0, so only the feature values matter. */
const EIGHT_FEATURES: SepRiskModel = {
  modelId: 'sep-risk',
  version: 'fixture',
  features: SEP_RISK_FEATURE_NAMES.map((name) => ({
    name,
    group: 'Fixture',
    mean: 0,
    scale: 1,
    coef: 0,
    impute: name === 'log1p_duration_min' ? 3.25 : null,
  })),
  intercept: 0,
  threshold: 0.5,
}

describe('reading a flare class', () => {
  it('turns a letter and a number into the logarithm of the peak flux', () => {
    expect(log10PeakFlux('M1.0')).toBeCloseTo(-5, 12)
    expect(log10PeakFlux('M1')).toBeCloseTo(-5, 12)
    expect(log10PeakFlux('C1.0')).toBeCloseTo(-6, 12)
    expect(log10PeakFlux('X2.2')).toBeCloseTo(Math.log10(2.2e-4), 12)
    expect(log10PeakFlux(' B4.5 ')).toBeCloseTo(Math.log10(4.5e-7), 12)
  })

  it.each(['', 'Z1.0', 'M', 'X1.2.3', 'M-1', 'M0', 'm1.0', '1.0M', 'X 2.2'])(
    'gives null for %j',
    (text) => {
      expect(log10PeakFlux(text)).toBeNull()
    },
  )
})

describe('reading a source location', () => {
  it('gives the longitude with west positive', () => {
    expect(longitudeWestDeg('S17W33')).toBe(33)
    expect(longitudeWestDeg('N05E80')).toBe(-80)
    expect(longitudeWestDeg('N9W99')).toBe(99)
    expect(longitudeWestDeg('S20W100')).toBe(100)
  })

  it.each([
    '',
    'S17',
    'W33S17',
    'S91W10',
    'S10W181',
    'S17W',
    'X17W33',
    's17w33',
  ])('gives null for %j', (text) => {
    expect(longitudeWestDeg(text)).toBeNull()
  })
})

describe('flareFeatures', () => {
  it('gives the eight features in the order of the model file', () => {
    const values = flareFeatures(EIGHT_FEATURES, OBSERVATION)
    const longitude = (33 * Math.PI) / 180
    const expected = [
      Math.log10(2.2e-4),
      Math.sin(longitude),
      Math.cos(longitude),
      Math.log1p(28),
      Math.log1p(61),
      1,
      Math.log1p(1200),
      45,
    ]
    expect(values).toHaveLength(8)
    values?.forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index] ?? NaN, 12)
    })
  })

  it('follows the order of the model file, not a fixed order', () => {
    const reversed = {
      ...EIGHT_FEATURES,
      features: [...EIGHT_FEATURES.features].reverse(),
    }
    expect(flareFeatures(reversed, OBSERVATION)).toEqual(
      [...(flareFeatures(EIGHT_FEATURES, OBSERVATION) ?? [])].reverse(),
    )
  })

  it('an eastern flare has a negative sine', () => {
    const values = flareFeatures(EIGHT_FEATURES, {
      ...OBSERVATION,
      sourceLocation: 'N05E80',
    })
    expect(values?.[1]).toBeCloseTo(-Math.sin((80 * Math.PI) / 180), 12)
    expect(values?.[2]).toBeCloseTo(Math.cos((80 * Math.PI) / 180), 12)
  })

  it('a flare without a CME has three zeros', () => {
    const values = flareFeatures(EIGHT_FEATURES, { ...OBSERVATION, cme: null })
    expect(values?.slice(5)).toEqual([0, 0, 0])
  })

  it("a flare without an end time takes the model file's value", () => {
    const values = flareFeatures(EIGHT_FEATURES, {
      ...OBSERVATION,
      durationMin: null,
    })
    expect(values?.[4]).toBe(3.25)
  })

  it('cannot score a flare without an end time when the model has no value for it', () => {
    const noImpute = {
      ...EIGHT_FEATURES,
      features: EIGHT_FEATURES.features.map((feature) => ({
        ...feature,
        impute: null,
      })),
    }
    expect(
      flareFeatures(noImpute, { ...OBSERVATION, durationMin: null }),
    ).toBeNull()
  })

  it.each([
    { classType: 'bad' },
    { sourceLocation: 'bad' },
    { riseMin: -1 },
    { riseMin: Number.NaN },
    { durationMin: -5 },
  ])('gives null, never a score, for %j', (change) => {
    const broken = { ...OBSERVATION, ...change }
    expect(flareFeatures(EIGHT_FEATURES, broken)).toBeNull()
    expect(sepRiskProbability(EIGHT_FEATURES, broken)).toBeNull()
    expect(topFactors(EIGHT_FEATURES, broken, 3)).toEqual([])
  })

  it('gives null when the model names a feature the app does not compute', () => {
    const unknown = {
      ...FIXTURE_MODEL,
      features: [
        { ...EIGHT_FEATURES.features[0]!, name: 'sunspot_count' }, // safe: the fixture has eight features
      ],
    }
    expect(flareFeatures(unknown, OBSERVATION)).toBeNull()
  })
})

describe('sepRiskProbability', () => {
  // FIXTURE_MODEL: logit = -1 + 2 × (log10 flux + 5) + 1 × has_cme.
  const plain = { ...OBSERVATION, cme: null }

  it('is 1 / (1 + e^-logit)', () => {
    // M1.0 without a CME: logit -1.
    expect(
      sepRiskProbability(FIXTURE_MODEL, { ...plain, classType: 'M1.0' }),
    ).toBeCloseTo(1 / (1 + Math.E), 12)
    // X1.0 without a CME: logit +1.
    expect(
      sepRiskProbability(FIXTURE_MODEL, { ...plain, classType: 'X1.0' }),
    ).toBeCloseTo(Math.E / (1 + Math.E), 12)
    // M1.0 with a CME: logit 0.
    expect(
      sepRiskProbability(FIXTURE_MODEL, { ...OBSERVATION, classType: 'M1.0' }),
    ).toBeCloseTo(0.5, 12)
  })

  it('uses the mean and scale of each feature', () => {
    const scaled = {
      ...FIXTURE_MODEL,
      features: [{ ...FIXTURE_MODEL.features[0]!, mean: -4, scale: 2 }], // safe: the fixture has two features
    }
    // X1.0: (−4 − (−4)) ÷ 2 = 0, so the logit is the intercept alone.
    expect(
      sepRiskProbability(scaled, { ...plain, classType: 'X1.0' }),
    ).toBeCloseTo(1 / (1 + Math.E), 12)
  })
})

describe('sepRiskScore', () => {
  it('is the output on a 0 to 100 scale, as a whole number', () => {
    expect(sepRiskScore(0.3745)).toBe(37)
    expect(sepRiskScore(0.5)).toBe(50)
    expect(sepRiskScore(0.1787)).toBe(18)
  })

  it('stays between 1 and 99, so it never reads as a certainty', () => {
    expect(sepRiskScore(0)).toBe(1)
    expect(sepRiskScore(0.004)).toBe(1)
    expect(sepRiskScore(0.999)).toBe(99)
    expect(sepRiskScore(1)).toBe(99)
  })
})

describe('topFactors', () => {
  const model: SepRiskModel = {
    ...FIXTURE_MODEL,
    features: [
      FIXTURE_MODEL.features[0]!, // safe: the fixture has two features
      { ...FIXTURE_MODEL.features[1]!, mean: 0.25 },
      {
        name: 'log1p_cme_speed',
        group: 'CME',
        mean: 0,
        scale: 1,
        coef: 0.5,
        impute: null,
      },
      {
        name: 'log1p_rise_min',
        group: 'Rise time',
        mean: Math.log1p(28),
        scale: 1,
        coef: 3,
        impute: null,
      },
    ],
  }
  const noCme = { ...OBSERVATION, classType: 'X1.0', cme: null }

  it('sorts the display groups by the size of their contribution', () => {
    const factors = topFactors(model, noCme, 10)
    expect(factors.map((factor) => factor.group)).toEqual([
      'Flare class',
      'CME',
      'Rise time',
    ])
    // Flare class: 2 × (−4 + 5) = 2. CME: 1 × (0 − 0.25) + 0.5 × 0 = −0.25. Rise time: 0.
    expect(factors[0]?.contribution).toBeCloseTo(2, 12)
    expect(factors[1]?.contribution).toBeCloseTo(-0.25, 12)
    expect(factors[2]?.contribution).toBeCloseTo(0, 12)
  })

  it('the intercept plus all contributions is the logit', () => {
    const total = topFactors(model, OBSERVATION, 10).reduce(
      (sum, factor) => sum + factor.contribution,
      model.intercept,
    )
    const output = sepRiskProbability(model, OBSERVATION) ?? NaN
    expect(total).toBeCloseTo(Math.log(output / (1 - output)), 12)
  })

  it('says in words what raises and what lowers the score', () => {
    expect(topFactors(model, noCme, 10).map((factor) => factor.text)).toEqual([
      'Flare class X1.0 raises the score',
      'No linked CME lowers the score',
      'Rise time of 28 min does not move the score',
    ])
    expect(
      topFactors(model, OBSERVATION, 10).map((factor) => factor.text),
    ).toContain('Linked CME at 1200 km/s, half-angle 45° raises the score')
  })

  it('returns at most n factors', () => {
    expect(topFactors(model, noCme, 2)).toHaveLength(2)
  })

  it('names a missing end time', () => {
    const withDuration: SepRiskModel = {
      ...FIXTURE_MODEL,
      features: [
        {
          name: 'log1p_duration_min',
          group: 'Duration',
          mean: 0,
          scale: 1,
          coef: 1,
          impute: 3,
        },
      ],
    }
    expect(
      topFactors(withDuration, { ...OBSERVATION, durationMin: null }, 1)[0]
        ?.text,
    ).toBe('No recorded end time (a typical duration is used) raises the score')
    expect(topFactors(withDuration, OBSERVATION, 1)[0]?.text).toBe(
      'Duration of 61 min raises the score',
    )
  })
})

describe('highestSepRisk: the 24-hour window', () => {
  const now = nineAm(40)
  const strong = { classType: 'X1.0' }

  it('counts a flare 23 hours before now, not one 25 hours before', () => {
    expect(
      highestSepRisk(FIXTURE_MODEL, [flare(now, 23, strong)], now, 1)?.flare
        .donkiId,
    ).toBe('fixture-flare-23')
    expect(
      highestSepRisk(FIXTURE_MODEL, [flare(now, 25, strong)], now, 1),
    ).toBeNull()
  })

  it('does not count a flare after now: it has not happened yet', () => {
    expect(
      highestSepRisk(FIXTURE_MODEL, [flare(now, -1, strong)], now, 1),
    ).toBeNull()
  })

  it('counts a flare at this very moment, and not one exactly 24 hours old', () => {
    expect(
      highestSepRisk(FIXTURE_MODEL, [flare(now, 0, strong)], now, 1),
    ).not.toBeNull()
    expect(
      highestSepRisk(FIXTURE_MODEL, [flare(now, 24, strong)], now, 1),
    ).toBeNull()
  })

  it('a longer window reaches further back', () => {
    expect(
      highestSepRisk(FIXTURE_MODEL, [flare(now, 25, strong)], now, 2),
    ).not.toBeNull()
  })

  it('takes the flare with the highest output', () => {
    const top = highestSepRisk(
      FIXTURE_MODEL,
      [flare(now, 2), flare(now, 5, strong), flare(now, 8)],
      now,
      1,
    )
    expect(top?.flare.donkiId).toBe('fixture-flare-5')
    expect(top?.output).toBeCloseTo(Math.E / (1 + Math.E), 12)
  })

  it('skips a flare it cannot score and gives null when nothing is left', () => {
    const unreadable = flare(now, 2, { classType: 'unknown' })
    expect(highestSepRisk(FIXTURE_MODEL, [unreadable], now, 1)).toBeNull()
    expect(
      highestSepRisk(FIXTURE_MODEL, [unreadable, flare(now, 3)], now, 1)?.flare
        .donkiId,
    ).toBe('fixture-flare-3')
    expect(highestSepRisk(FIXTURE_MODEL, [], now, 1)).toBeNull()
  })
})
