import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { sepRiskModel } from '../../../data/index.ts'
import type { SepRiskModelFile } from '../../../engine/index.ts'
import { sepRiskScore } from '../../../engine/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'
import { CalibrationSection } from '../CalibrationSection.tsx'
import {
  dateOf,
  findingOf,
  interval,
  percent,
  score,
  signed,
} from '../format.ts'
import { ResultsSection } from '../ResultsSection.tsx'

// The model card screen (section 19.11). Every expected number below is built
// from the model file, so the test follows the file and never a typed value.

const model = sepRiskModel
const test = model.metrics.test
const region = (name: string) => screen.getByRole('region', { name })

describe('formatting', () => {
  it('shows scores, differences, shares and intervals', () => {
    expect(score(0.90012)).toBe('0.900')
    expect(score(null)).toBe('not available')
    expect(signed(0.0729)).toBe('+0.073')
    expect(signed(-0.0192)).toBe('−0.019')
    expect(percent(0.8086)).toBe('80.9%')
    expect(percent(null)).toBe('not available')
    expect(interval([0.84, 0.954])).toBe('0.840 to 0.954')
    expect(dateOf('2026-11-14T19:57:49Z')).toBe('2026-11-14')
  })

  it('calls a difference inconclusive only when its interval includes zero', () => {
    expect(findingOf([0.016, 0.134])).toBe('higher')
    expect(findingOf([-0.2, -0.01])).toBe('lower')
    expect(findingOf([-0.019, 0.051])).toBe('inconclusive')
    expect(findingOf([0, 0.1])).toBe('inconclusive')
  })
})

describe('the sep-risk model card screen', () => {
  // The app shell shows its screens once a scenario is loaded.
  beforeEach(() => {
    loadScenario('solar-flare-watch')
  })

  it('opens at #/model/sep-risk with the model version and its tags', () => {
    renderApp('/model/sep-risk')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Model card: solar flare outlook',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        `Model sep-risk ${model.version}, made on ${dateOf(model.createdAt)}`,
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Model estimate').length).toBeGreaterThan(0)
    expect(screen.getByText('Experimental')).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'What it does',
      'The data',
      'How it works',
      'How well it did on the held-out years',
      'Why it is a score, not a percent chance',
      'Limits',
      'Sources',
    ])
  })

  it('says what the score is, what it is not, and what the model may do', () => {
    renderApp('/model/sep-risk')

    const purpose = region('What it does')
    expect(purpose).toHaveTextContent('Experimental model score')
    expect(purpose).toHaveTextContent(
      "linked to a recorded solar particle event in NASA's DONKI catalog",
    )
    expect(purpose).toHaveTextContent(
      `${test.confusion.fp} of the ${model.metrics.testFlaggedAtThreshold.flagged} flares the model flagged had no such record`,
    )
    expect(purpose).toHaveTextContent(
      "It is not a validated probability of an event, and it does not measure anyone's radiation exposure.",
    )
    expect(purpose).toHaveTextContent(
      'It never raises an act-level alert and never decides who leads the response.',
    )
    expect(purpose).toHaveTextContent(
      'The alert “Solar particle event in progress” replaces the outlook.',
    )
    expect(purpose).toHaveTextContent(model.label)
  })

  it('shows the data, the label policy and the split counts from the file', () => {
    renderApp('/model/sep-risk')

    const data = region('The data')
    const { splits, sepRecordClasses } = model.data
    expect(data).toHaveTextContent(
      `Real records from ${model.data.source}, retrieved on ${dateOf(model.data.retrievedAt)}`,
    )
    expect(data).toHaveTextContent(
      `${sepRecordClasses.observedOnly} observed by an instrument, ${sepRecordClasses.modelOnly} model output`,
    )
    expect(data).toHaveTextContent(
      'no qualifying recorded particle event association',
    )
    expect(data).toHaveTextContent(
      'The crew and their health readings in every scenario are simulated.',
    )
    const rows = within(data).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual(
      (['train', 'validation', 'test'] as const).map((name, index) => {
        const split = splits[name]
        const label = ['Training', 'Validation', 'Test (held out)'][index]
        return `${label}${split.years}${split.n}${split.positives}${percent(split.positives / split.n)}${split.excludedAmbiguous}`
      }),
    )
  })

  it('shows the alert level at full precision in the file and as a score on the page', () => {
    renderApp('/model/sep-risk')

    const how = region('How it works')
    expect(how).toHaveTextContent(
      `Value: ${score(model.threshold, 4)} on the model’s 0 to 1 scale, shown as ${sepRiskScore(model.threshold)} out of 100.`,
    )
    expect(how).toHaveTextContent(`Alert level rule: ${model.thresholdRule}.`)
    expect(within(how).getAllByRole('row')).toHaveLength(
      model.features.length + 1,
    )
    for (const feature of model.features) {
      expect(how).toHaveTextContent(signed(feature.coef, 4))
    }
    expect(how).toHaveTextContent('Nothing was chosen from them.')
  })

  it('shows the test results with their intervals and the false alarms', () => {
    renderApp('/model/sep-risk')

    const results = region('How well it did on the held-out years')
    const counts = test.confusion
    const flagged = model.metrics.testFlaggedAtThreshold
    expect(results).toHaveTextContent(
      `Flagged ${flagged.flagged} of the ${flagged.of} test flares.`,
    )
    expect(results).toHaveTextContent(
      `Caught ${counts.tp} of the ${counts.tp + counts.fn} positive flares (${percent(test.recall)}); missed ${counts.fn}.`,
    )
    expect(results).toHaveTextContent(
      `${counts.fp} of the ${flagged.flagged} flagged flares were false alarms (${percent(test.falseAlarmRatio)}).`,
    )
    expect(results).toHaveTextContent(
      `ROC AUC ${score(test.rocAuc)} (95% interval ${interval(test.rocAucCi95)})`,
    )
    expect(results).toHaveTextContent(
      `TSS ${score(test.tss)} (95% interval ${interval(test.tssCi95)})`,
    )
    expect(results).toHaveTextContent(
      `only ${model.data.splits.validation.positives} positive flares`,
    )
  })

  it('reports the comparison with flare class alone as the file found it', () => {
    renderApp('/model/sep-risk')

    const results = region('How well it did on the held-out years')
    const { shippedMinusThis } = model.comparisons.classOnly
    // The frozen A1 result: both difference intervals lie above zero.
    expect(findingOf(shippedMinusThis.rocAucCi95)).toBe('higher')
    expect(results).toHaveTextContent(
      `ROC AUC: the shipped model was higher by ${signed(shippedMinusThis.rocAuc)} (95% interval ${interval(shippedMinusThis.rocAucCi95)}). The whole interval is above zero.`,
    )
  })

  it('calls the gradient boosting comparison inconclusive, never equal', () => {
    renderApp('/model/sep-risk')

    const results = region('How well it did on the held-out years')
    const { shippedMinusThis } = model.comparisons.gradientBoosting
    expect(findingOf(shippedMinusThis.rocAucCi95)).toBe('inconclusive')
    expect(findingOf(shippedMinusThis.tssCi95)).toBe('inconclusive')
    expect(results).toHaveTextContent(
      `ROC AUC: inconclusive. The difference is ${signed(shippedMinusThis.rocAuc)} (95% interval ${interval(shippedMinusThis.rocAucCi95)}), and the interval includes zero, so these test years cannot tell the two models apart. This is not evidence that they perform equally.`,
    )
    expect(results).toHaveTextContent(
      `TSS: inconclusive. The difference is ${signed(shippedMinusThis.tss)} (95% interval ${interval(shippedMinusThis.tssCi95)})`,
    )
    expect(results).not.toHaveTextContent(
      /as good as|equivalent|same performance|no difference/i,
    )
  })

  it('shows the calibration limits: outputs too high, and both Brier skill scores', () => {
    renderApp('/model/sep-risk')

    const calibration = region('Why it is a score, not a percent chance')
    const [lowest] = model.metrics.reliability
    if (!lowest) throw new Error('the model file has no reliability bins')
    expect(calibration).toHaveTextContent(
      `Outputs from ${lowest.binFrom.toFixed(1)} to ${lowest.binTo.toFixed(1)} were too high: mean output ${percent(lowest.meanPredicted)}, ${percent(lowest.observed)} of those flares were positive (${lowest.n} flares).`,
    )
    expect(within(calibration).getAllByRole('row')).toHaveLength(
      model.metrics.reliability.length + 1,
    )
    expect(calibration).toHaveTextContent(
      `Against always forecasting the training share (${percent(model.comparisons.climatology.trainingBaseRate)}): ${score(test.brierSkill)}.`,
    )
    expect(calibration).toHaveTextContent(
      `which nobody could know in advance: ${score(test.brierSkillVsOwnBaseRate)}.`,
    )
  })

  it('lists every limitation of the model file and its sources', () => {
    renderApp('/model/sep-risk')

    const limits = region('Limits')
    expect(within(limits).getAllByRole('listitem')).toHaveLength(
      model.limitations.length,
    )
    for (const line of model.limitations) {
      expect(limits).toHaveTextContent(line)
    }
    const sources = region('Sources')
    expect(within(sources).getAllByRole('link')).toHaveLength(
      model.sourceIds.length,
    )
    expect(
      within(sources).getAllByText('Unverified source').length,
    ).toBeGreaterThan(0)
  })

  it('has no card for an unknown model', () => {
    renderApp('/model/other')
    expect(
      screen.getByRole('heading', { name: 'No model card for this model' }),
    ).toBeInTheDocument()
  })
})

describe('the numbers follow the model file, not typed text', () => {
  function changed(edit: (copy: SepRiskModelFile) => void): SepRiskModelFile {
    const copy = structuredClone(model)
    edit(copy)
    return copy
  }

  it('a different file gives different results and a different finding', () => {
    const other = changed((copy) => {
      copy.metrics.test.confusion = { tp: 3, fp: 4, tn: 90, fn: 2 }
      copy.metrics.testFlaggedAtThreshold = { flagged: 7, of: 99 }
      copy.metrics.test.falseAlarmRatio = 4 / 7
      copy.comparisons.gradientBoosting.shippedMinusThis.rocAucCi95 = [
        0.02, 0.09,
      ]
      copy.comparisons.classOnly.shippedMinusThis.tssCi95 = [-0.3, -0.1]
    })
    render(<ResultsSection model={other} />)

    const results = region('How well it did on the held-out years')
    expect(results).toHaveTextContent('Flagged 7 of the 99 test flares.')
    expect(results).toHaveTextContent(
      '4 of the 7 flagged flares were false alarms (57.1%).',
    )
    expect(results).toHaveTextContent('The whole interval is above zero.')
    expect(results).toHaveTextContent('The whole interval is below zero.')
  })

  it('a file with outputs that were too low says so', () => {
    const other = changed((copy) => {
      copy.metrics.reliability = [
        { binFrom: 0, binTo: 0.5, n: 10, meanPredicted: 0.1, observed: 0.4 },
        { binFrom: 0.5, binTo: 1, n: 0, meanPredicted: null, observed: null },
      ]
    })
    render(<CalibrationSection model={other} />)

    const calibration = region('Why it is a score, not a percent chance')
    expect(calibration).toHaveTextContent(
      'Outputs from 0.0 to 0.5 were too low: mean output 10.0%, 40.0% of those flares were positive (10 flares).',
    )
    expect(calibration).not.toHaveTextContent('too high')
    expect(within(calibration).getAllByText('no flares')).toHaveLength(2)
  })
})
