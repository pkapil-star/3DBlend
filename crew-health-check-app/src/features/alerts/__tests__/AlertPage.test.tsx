import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { selectEvaluation } from '../../../store/selectors.ts'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

const path = (key: string) => `/alert/${encodeURIComponent(key)}`
const sectionHeadings = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
const banner = () => screen.getByRole('region', { name: 'Who leads' })

describe('alert detail', () => {
  it('keeps its sections in the fixed order, with "Also contributing" last', () => {
    loadScenario('fever')
    renderApp(path('R-TEMP-02:c1'))

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Temperature is well above your normal',
      }),
    ).toBeInTheDocument()
    expect(sectionHeadings()).toEqual([
      'Who leads',
      'What changed',
      'Why it matters',
      'What to do',
      'Evidence',
      'Also contributing',
    ])
    expect(
      within(
        screen.getByRole('region', { name: 'Also contributing' }),
      ).getByText('Temperature is higher than your normal'),
    ).toBeInTheDocument()
  })

  it('solar-storm at the station: consult the ground, and the first steps start now', () => {
    loadScenario('solar-storm')
    renderApp(path('R-RAD-01:c1'))

    expect(banner()).toHaveTextContent(
      'Consult the ground. Reply expected in about 5 min.',
    )
    expect(banner()).toHaveTextContent(
      'Start the first steps now. The reply estimate is not a reason to wait.',
    )
    expect(
      within(banner()).getByText('Stop your current task and make it safe.'),
    ).toBeInTheDocument()
    expect(banner()).toHaveTextContent('This is an estimate, not a promise')
    expect(banner()).toHaveTextContent(
      'Prototype assumption: no communication delay (0 s).',
    )
    // At the station the delay is 0 s, so the consult arrives the moment it leaves (M6).
    expect(banner()).toHaveTextContent('Delivered to Earth: a consult request')
    expect(within(banner()).getByText('Simulated')).toBeInTheDocument()
  })

  it('flips to act on board when the slider moves to Mars at its farthest (exit test)', async () => {
    const user = userEvent.setup()
    loadScenario('solar-storm')
    renderApp(path('R-RAD-01:c1'))

    await user.selectOptions(
      screen.getByLabelText('Environment'),
      'Mars transit vehicle',
    )
    expect(banner()).toHaveTextContent(
      'Consult the ground. Reply expected in about 11 min.',
    )
    const slider = screen.getByLabelText('Earth link delay, one way')
    expect(slider).toHaveAttribute('min', '180')
    expect(slider).toHaveAttribute('max', '1320')

    fireEvent.change(slider, { target: { value: '1320' } })
    expect(banner()).toHaveTextContent(
      'Act now on board. A reply from Earth would take about 49 min.',
    )
    expect(banner()).not.toHaveTextContent('Start the first steps now')
    // The steps stay at the top, in the banner.
    expect(
      within(banner()).getByText('Stop your current task and make it safe.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Link up, 22 min each way (Mars far)'),
    ).toBeVisible()
    // 22 minutes each way, and the clock is paused: the report is on its way (M6).
    expect(banner()).toHaveTextContent('On its way to Earth: a report')
  })

  it('shows the draft protocol with its note, and the ticks persist', async () => {
    const user = userEvent.setup()
    loadScenario('solar-storm')
    const { unmount } = renderApp(path('R-RAD-01:c1'))

    const todo = screen.getByRole('region', { name: 'What to do' })
    expect(within(todo).getByText('Draft guidance')).toBeInTheDocument()
    expect(todo).toHaveTextContent(
      'Draft guidance, not reviewed. The one-hour re-check is illustrative',
    )
    const second = within(todo).getByRole('checkbox', {
      name: 'Step 2. Move to the designated shelter area.',
    })
    await user.click(second)
    expect(second).toBeChecked()
    expect(todo).toHaveTextContent('Steps done: 1 of 4')
    expect(todo).toHaveTextContent('Re-check: after about 1 hour.')

    unmount()
    renderApp(path('R-RAD-01:c1'))
    expect(
      screen.getByRole('checkbox', {
        name: 'Step 2. Move to the designated shelter area.',
      }),
    ).toBeChecked()
  })

  it('shows sources, the basis tag and unverified tags', () => {
    loadScenario('low-glucose')
    renderApp(path('R-GLU-02:c1'))

    const evidence = screen.getByRole('region', { name: 'Evidence' })
    expect(
      within(evidence).getByText('Common clinical cut-off'),
    ).toBeInTheDocument()
    expect(evidence).toHaveTextContent(
      'a common clinical cut-off used on Earth, not one made for spaceflight',
    )
    expect(within(evidence).getAllByRole('link').length).toBeGreaterThanOrEqual(
      2,
    )
    expect(
      within(evidence).getAllByText('Unverified source').length,
    ).toBeGreaterThan(0)
  })

  it('keeps missing data next to the alert', () => {
    loadScenario('low-glucose')
    const { readings } = useAppStore.getState()
    // No temperature for four days: the core region is missing it.
    useAppStore.setState({
      readings: readings.filter(
        (reading) => !(reading.indicator === 'body_temp' && reading.day >= 72),
      ),
    })
    renderApp(path('R-GLU-02:c1'))

    const changed = screen.getByRole('region', { name: 'What changed' })
    expect(changed).toHaveTextContent('Missing: Body temperature.')
    expect(changed).toHaveTextContent(
      'Missing readings are not counted as normal.',
    )
  })

  it('acknowledges by keyboard and moves focus to the result', async () => {
    const user = userEvent.setup()
    loadScenario('solar-storm')
    renderApp(path('R-RAD-01:c1'))

    screen.getByRole('button', { name: 'Acknowledge' }).focus()
    await user.keyboard('{Enter}')
    const result = screen.getByText('Acknowledged at 09:00 mission time.')
    expect(result).toHaveFocus()
    expect(
      useAppStore.getState().alertState['R-RAD-01:c1']?.acknowledgedAtMs,
    ).toBe(useAppStore.getState().mission.nowMs)
  })

  it('offers "Send to ground" only on a self-care alert', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp(path('R-SLEEP-01:c1'))

    expect(banner()).toHaveTextContent('You can handle this yourself.')
    await user.click(screen.getByRole('button', { name: 'Send to ground' }))
    expect(
      screen.getByText(/Sent to ground at 09:00 mission time\./),
    ).toHaveFocus()

    loadScenario('solar-storm')
    expect(
      screen.queryByRole('button', { name: 'Send to ground' }),
    ).not.toBeInTheDocument()
  })

  it('says when an alert is no longer active', () => {
    loadScenario('baseline-healthy')
    renderApp(path('R-RAD-01:c1'))
    expect(screen.getByRole('status')).toHaveTextContent(
      'This alert is not active now',
    )
    expect(
      screen.getByRole('link', { name: 'Back to Home' }),
    ).toBeInTheDocument()
  })
})

describe('urgent re-check entry on the low blood sugar alert', () => {
  it('is labeled as not fasting and refuses an out-of-range value', async () => {
    const user = userEvent.setup()
    loadScenario('low-glucose')
    renderApp(path('R-GLU-02:c1'))

    const input = screen.getByLabelText(
      'Blood sugar re-check (not fasting), in mg/dL',
    )
    await user.type(input, '900')
    await user.click(screen.getByRole('button', { name: 'Save re-check' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a value between 30 and 500 mg/dL.',
    )
    expect(
      useAppStore.getState().readings.filter((reading) => reading.purpose),
    ).toEqual([])
  })

  it('a still-low re-check keeps the alert and shows as a re-check', async () => {
    const user = userEvent.setup()
    loadScenario('low-glucose')
    renderApp(path('R-GLU-02:c1'))

    await user.type(
      screen.getByLabelText('Blood sugar re-check (not fasting), in mg/dL'),
      '64',
    )
    await user.click(screen.getByRole('button', { name: 'Save re-check' }))

    const changed = screen.getByRole('region', { name: 'What changed' })
    expect(changed).toHaveTextContent(
      'Blood sugar re-check (not fasting), latest: 64 mg/dL on day 75',
    )
    expect(
      screen.getByText('Re-checks today: 64 mg/dL at 09:00'),
    ).toBeInTheDocument()
  })

  it('a normal re-check clears the alert; the fasting baseline is unchanged', async () => {
    const user = userEvent.setup()
    loadScenario('low-glucose')
    const before = selectEvaluation(useAppStore.getState()).baselines
      .blood_glucose
    renderApp(path('R-GLU-02:c1'))

    await user.type(
      screen.getByLabelText('Blood sugar re-check (not fasting), in mg/dL'),
      '88',
    )
    await user.click(screen.getByRole('button', { name: 'Save re-check' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      'This alert is not active now',
    )
    expect(
      screen.getByText(/Latest Blood sugar re-check \(not fasting\):/),
    ).toBeInTheDocument()
    expect(
      selectEvaluation(useAppStore.getState()).baselines.blood_glucose,
    ).toEqual(before)
  })

  it('is not offered where a re-check cannot change the alert', () => {
    loadScenario('solar-storm')
    renderApp(path('R-RAD-01:c1'))
    expect(
      screen.queryByRole('button', { name: 'Save re-check' }),
    ).not.toBeInTheDocument()
  })
})
