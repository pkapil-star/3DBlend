import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { sepRiskModel } from '../../../data/index.ts'
import { sepRiskProbability, sepRiskScore } from '../../../engine/index.ts'
import { useAppStore } from '../../../store/index.ts'
import { selectEvaluation } from '../../../store/selectors.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// The model outlook R-RAD-03 on the screens (sections 19.4 and 26.10): an
// experimental score with its limits, always a watch alert on the
// "handle this yourself" route.

const path = (key: string) => `/alert/${encodeURIComponent(key)}`
const banner = () => screen.getByRole('region', { name: 'Who leads' })
const changed = () => screen.getByRole('region', { name: 'What changed' })

/** The score the app must show for a scenario's flare, worked out from the model file. */
function expectedScore(scenarioId: string): number {
  const [flare] = loadScenario(scenarioId).spaceWeather
  if (!flare) throw new Error(`${scenarioId} has no flare`)
  const output = sepRiskProbability(sepRiskModel, flare)
  if (output === null) throw new Error('the flare cannot be scored')
  return sepRiskScore(output)
}

describe('the solar flare outlook alert (solar-flare-watch)', () => {
  it('is a watch alert in the fixed section order', () => {
    loadScenario('solar-flare-watch')
    renderApp(path('R-RAD-03:c1'))

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Solar flare outlook: possible particle event',
      }),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Who leads',
      'What changed',
      'Why it matters',
      'What to do',
      'Evidence',
    ])
    const [alert] = selectEvaluation(useAppStore.getState()).alerts
    expect(alert?.severity).toBe('watch')
    expect(screen.getAllByText('Watch').length).toBeGreaterThan(0)
    expect(screen.queryByText('Act')).not.toBeInTheDocument()
  })

  it('shows an experimental score out of 100 with the model tag, never a percent chance', () => {
    const score = expectedScore('solar-flare-watch')
    renderApp(path('R-RAD-03:c1'))

    const section = changed()
    expect(section).toHaveTextContent(
      `Experimental model score: ${score} out of 100`,
    )
    expect(within(section).getByText('Model estimate')).toBeInTheDocument()
    expect(section).toHaveTextContent(
      `Alert level: at or above ${sepRiskScore(sepRiskModel.threshold)} out of 100`,
    )
    expect(section).toHaveTextContent(
      `Model estimate from sep-risk ${sepRiskModel.version}`,
    )
    expect(section).not.toHaveTextContent(/\d\s?%\s*(estimated )?chance/i)
    expect(section).not.toHaveTextContent(/estimated chance/i)
    expect(section).not.toHaveTextContent(`${score}%`)
  })

  it('explains the score: factors, the real flare, false alarms and what it is not', () => {
    const scenario = loadScenario('solar-flare-watch')
    const [flare] = scenario.spaceWeather
    renderApp(path('R-RAD-03:c1'))

    const section = changed()
    const factors = within(section)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
      .filter((text) => /(raises|lowers|does not move) the score$/.test(text))
    expect(factors).toHaveLength(3)

    expect(within(section).getByText('Historical flare')).toBeInTheDocument()
    expect(
      within(section).getByRole('link', { name: flare?.donkiId }),
    ).toHaveAttribute('href', flare?.link)
    expect(section).toHaveTextContent(
      'The crew and their health readings are simulated.',
    )

    const test = sepRiskModel.metrics.test.confusion
    const flagged = sepRiskModel.metrics.testFlaggedAtThreshold.flagged
    expect(section).toHaveTextContent(
      "linked to a recorded solar particle event in NASA's DONKI catalog",
    )
    expect(section).toHaveTextContent(
      `False alarms are frequent: in the held-out test years (${sepRiskModel.data.splits.test.years}), ${test.fp} of the ${flagged} flares the model flagged had no such record.`,
    )
    expect(section).toHaveTextContent(
      "It is not a validated probability of an event, and it does not measure anyone's radiation exposure.",
    )
  })

  it('links to the model card from the score and from the evidence', async () => {
    const user = userEvent.setup()
    loadScenario('solar-flare-watch')
    renderApp(path('R-RAD-03:c1'))

    const evidence = screen.getByRole('region', { name: 'Evidence' })
    expect(within(evidence).getByText('Model estimate')).toBeInTheDocument()
    expect(
      within(evidence).getByText('Illustrative threshold'),
    ).toBeInTheDocument()
    expect(evidence).toHaveTextContent('not from a measurement of the crew')
    expect(
      within(evidence).getByRole('link', { name: 'How this model was made' }),
    ).toHaveAttribute('href', '/model/sep-risk')

    await user.click(
      within(changed()).getByRole('link', { name: 'How this model was made' }),
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Model card: solar flare outlook',
      }),
    ).toBeInTheDocument()
  })

  it('keeps "You can handle this yourself" at every delay and in every environment', async () => {
    const user = userEvent.setup()
    loadScenario('solar-flare-watch')
    renderApp(path('R-RAD-03:c1'))

    expect(banner()).toHaveTextContent('You can handle this yourself.')
    const slider = screen.getByLabelText('Earth link delay, one way')
    for (const delay of ['1320', '720', '180']) {
      fireEvent.change(slider, { target: { value: delay } })
      expect(banner()).toHaveTextContent('You can handle this yourself.')
      expect(banner()).not.toHaveTextContent(/Act now|Consult the ground/)
    }
    for (const environment of [
      'Mars rover',
      'Mars surface habitat',
      'Lunar surface habitat',
      'Space station (low Earth orbit)',
    ]) {
      const select = screen.getByLabelText('Environment')
      if (within(select).queryByRole('option', { name: environment })) {
        await user.selectOptions(select, environment)
        expect(banner()).toHaveTextContent('You can handle this yourself.')
      }
    }
    // A model outlook never sends anything to Earth by itself.
    expect(useAppStore.getState().outbox).toEqual([])
    expect(
      selectEvaluation(useAppStore.getState()).alerts.map((alert) => [
        alert.ruleId,
        alert.severity,
        alert.route,
      ]),
    ).toEqual([['R-RAD-03', 'watch', 'self_care']])
  })

  it('goes to the ground only when the crew chooses to, and the message says it is a model estimate', async () => {
    const user = userEvent.setup()
    const score = expectedScore('solar-flare-watch')
    renderApp(path('R-RAD-03:c1'))

    expect(useAppStore.getState().outbox).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Send to ground' }))
    const { outbox } = useAppStore.getState()
    expect(outbox.map((message) => message.id)).toEqual(['consult:R-RAD-03:c1'])
    expect(outbox[0]?.body).toContain(
      `Experimental model score: ${score} out of 100`,
    )
    expect(outbox[0]?.body).toContain(
      `Model estimate from sep-risk ${sepRiskModel.version}`,
    )
    expect(outbox[0]?.body).not.toMatch(/%|chance/i)
  })

  it('shows the draft "get ready" steps, not the shelter steps', () => {
    loadScenario('solar-flare-watch')
    renderApp(path('R-RAD-03:c1'))

    const todo = screen.getByRole('region', { name: 'What to do' })
    expect(todo).toHaveTextContent(
      'Solar flare: get ready for a possible particle event',
    )
    expect(within(todo).getByText('Draft guidance')).toBeInTheDocument()
    expect(todo).toHaveTextContent('they do not mean an event has started')
    expect(todo).not.toHaveTextContent('Move to the designated shelter area')
  })

  it('on Home: listed with the model tag, Environment is Watch, and the flare is marked historical', () => {
    const scenario = loadScenario('solar-flare-watch')
    renderApp('/')

    const alerts = screen.getByRole('region', { name: 'Active alerts' })
    const item = alerts.querySelector('[data-rule-id="R-RAD-03"]')
    expect(item).not.toBeNull()
    expect(item).toHaveTextContent('Watch')
    expect(item).toHaveTextContent('Model estimate')
    expect(item).toHaveTextContent('You can handle this yourself')
    expect(item).not.toHaveTextContent('Start now')
    expect(
      screen.getByRole('button', { name: 'Environment: Watch' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Historical solar event')).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(scenario.spaceWeather[0]?.donkiId ?? '!')),
    ).toBeInTheDocument()
  })
})

describe('the outlook under an event in progress (solar-storm)', () => {
  it('is replaced by the act alert on Home', () => {
    loadScenario('solar-storm')
    renderApp('/')

    const alerts = screen.getByRole('region', { name: 'Active alerts' })
    expect(alerts.querySelector('[data-rule-id="R-RAD-01"]')).not.toBeNull()
    expect(alerts.querySelector('[data-rule-id="R-RAD-03"]')).toBeNull()
    expect(screen.getByText('Historical solar event')).toBeInTheDocument()
  })

  it('is listed under "Also contributing" with its tag and its limits', () => {
    const score = expectedScore('solar-storm')
    renderApp(path('R-RAD-01:c1'))

    const also = screen.getByRole('region', { name: 'Also contributing' })
    expect(also).toHaveTextContent(
      'Solar flare outlook: possible particle event',
    )
    expect(also).toHaveTextContent(
      `Experimental model score: ${score} out of 100`,
    )
    expect(within(also).getByText('Model estimate')).toBeInTheDocument()
    expect(also).toHaveTextContent(
      'An experimental score with frequent false alarms, not a validated probability.',
    )
    // The act alert itself is not a model output.
    expect(
      within(changed()).queryByText('Model estimate'),
    ).not.toBeInTheDocument()
    expect(banner()).toHaveTextContent('Consult the ground.')
  })

  it('opened directly, the outlook points to the stronger alert', () => {
    loadScenario('solar-storm')
    renderApp(path('R-RAD-03:c1'))

    expect(screen.getByText(/A stronger alert covers this one/)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Solar particle event in progress' }),
    ).toBeInTheDocument()
  })

  it('the route of the act alert is the same with and without the model outlook', () => {
    loadScenario('solar-storm')
    const withOutlook = selectEvaluation(useAppStore.getState()).alerts.find(
      (alert) => alert.ruleId === 'R-RAD-01',
    )
    // Without flares there is no outlook; the act alert must not change.
    useAppStore.setState({ spaceWeather: [] })
    const alerts = selectEvaluation(useAppStore.getState()).alerts
    expect(alerts.map((alert) => alert.ruleId)).toEqual(['R-RAD-01'])
    expect(alerts[0]).toEqual(withOutlook)
  })
})

describe('scenarios without a flare', () => {
  it('show no historical note and no model alert', () => {
    loadScenario('sleep-debt')
    renderApp('/')

    expect(screen.queryByText('Historical solar event')).not.toBeInTheDocument()
    expect(screen.queryByText('Model estimate')).not.toBeInTheDocument()
  })
})
