import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { earthHospitalModel } from '../../../data/index.ts'
import { useAppStore } from '../../../store/index.ts'
import { selectEvaluation } from '../../../store/selectors.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// The Earth hospital second opinion on screen (ARCHITECTURE.md sections
// 26.17 and 26.19). Wording is read from the model file.

const FIVE = [
  'heart_rate',
  'body_temp',
  'systolic_bp',
  'diastolic_bp',
  'blood_glucose',
] as const

/** fever, with today's check-in repeating crew member A's last logged values (the fever's peak). */
function feverCheckIn() {
  const scenario = loadScenario('fever')
  const lastDay = scenario.missionDay - 1
  for (const indicator of FIVE) {
    const value = scenario.readings.find(
      (entry) =>
        entry.crewId === 'c1' &&
        entry.indicator === indicator &&
        entry.day === lastDay,
    )?.value
    if (value === undefined)
      throw new Error(`no ${indicator} on day ${lastDay}`)
    useAppStore.getState().addReading(indicator, value)
  }
  return scenario
}

const card = () => screen.getByRole('region', { name: 'Second opinions' })

describe('the Earth hospital insight', () => {
  it('is not shown before the check-in: the model needs today’s five readings', () => {
    loadScenario('fever')
    const evaluation = selectEvaluation(useAppStore.getState())
    expect(
      evaluation.insights.filter(
        (insight) => insight.modelId === 'earth-hospital',
      ),
    ).toEqual([])
  })

  it('appears after a check-in with fever values, says where it learned, and shows no number', () => {
    feverCheckIn()
    renderApp('/')

    const insight = selectEvaluation(useAppStore.getState()).insights.find(
      (entry) => entry.modelId === 'earth-hospital',
    )
    expect(insight).toBeDefined()
    const article = within(card()).getByRole('article', {
      name: earthHospitalModel.headline,
    })
    expect(within(article).getByText('Earth ICU data')).toBeInTheDocument()
    expect(within(article).getByText('Model estimate')).toBeInTheDocument()
    expect(
      within(article).getByText(earthHospitalModel.caveat),
    ).toBeInTheDocument()
    expect(article.textContent).not.toMatch(/%|sepsis/i)
    expect(article.textContent).not.toContain(insight?.score.toFixed(2) ?? '')
    expect(
      within(article).getByRole('link', { name: 'How this model works' }),
    ).toHaveAttribute('href', '/model/earth-hospital')
  })

  it('leaves the fever alert exactly as the rules set it', () => {
    feverCheckIn()
    const evaluation = selectEvaluation(useAppStore.getState())
    const alert = evaluation.alerts.find(
      (entry) => entry.ruleId === 'R-TEMP-02',
    )
    expect(alert?.severity).toBe('act')
    expect(
      useAppStore.getState().outbox.some((message) => message.insightKey),
    ).toBe(false)
  })
})

describe('the Earth hospital model card', () => {
  it('says first that it learned on Earth and was never tested on astronauts, with its results', () => {
    loadScenario('fever')
    renderApp('/model/earth-hospital')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Model card: Earth hospital second opinion',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText('Never tested on astronauts').length,
    ).toBeGreaterThan(0)
    const results = screen.getByRole('region', { name: 'How well it did' })
    expect(results).toHaveTextContent(
      `ROC AUC ${earthHospitalModel.metrics.test.rocAuc.toFixed(3)}`,
    )
    expect(results).toHaveTextContent('inconclusive')
    const data = screen.getByRole('region', { name: 'Data' })
    expect(data).toHaveTextContent(earthHospitalModel.data.licenseOnPage)
  })
})
