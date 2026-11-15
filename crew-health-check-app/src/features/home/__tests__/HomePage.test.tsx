import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useAppStore } from '../../../store/index.ts'
import { selectEvaluation } from '../../../store/selectors.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// The region page is a lazy chunk with Recharts. Its first import in a test
// worker is transformed on the fly, which can take more than 10 s while
// every test file runs in parallel; the wait stays inside the 30 s limit.
const LAZY_PAGE_WAIT = { timeout: 25000 }

describe('Home with the sleep-debt scenario', () => {
  it('lists the sleep alert and shows Head as Watch', () => {
    loadScenario('sleep-debt')
    renderApp('/')

    const alerts = screen.getByRole('region', { name: 'Active alerts' })
    expect(
      within(alerts).getByText('Sleep has been low for several nights'),
    ).toBeInTheDocument()
    expect(alerts.querySelector('[data-rule-id="R-SLEEP-01"]')).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Head: Watch' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Chest: Good' }),
    ).toBeInTheDocument()
  })

  it("shows today's check-in as not started, with a way in", () => {
    loadScenario('sleep-debt')
    renderApp('/')

    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('Check-in: 0 of 8 done')).toBeInTheDocument()
    expect(
      within(today).getByRole('link', { name: 'Start check-in' }),
    ).toHaveAttribute('href', '/check-in')
  })

  it('names every body region as a button with its status word', () => {
    loadScenario('sleep-debt')
    renderApp('/')

    const map = screen.getByRole('group', { name: 'Body map' })
    const names = within(map)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'Eyes: Good',
      'Head: Watch',
      'Chest: Good',
      'Abdomen: Good',
      'Legs and arms: Good',
      'Skin: Good',
      'Environment: Good',
    ])
  })

  it('gives each status row a spoken name with clear breaks, linking to its area', () => {
    loadScenario('sleep-debt')
    renderApp('/')

    const list = screen.getByRole('region', { name: 'Status by area' })
    expect(
      within(list).getByRole('link', {
        name: 'Head: Watch. Sleep has been low for several nights',
      }),
    ).toHaveAttribute('href', '/region/head')
  })

  it(
    'opens the area chosen on the map, with its readings and normal (M5)',
    { timeout: 30000 },
    async () => {
      const user = userEvent.setup()
      loadScenario('sleep-debt')
      renderApp('/')

      await user.click(screen.getByRole('button', { name: 'Head: Watch' }))
      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: 'Head' },
          LAZY_PAGE_WAIT,
        ),
      ).toBeInTheDocument()
      expect(screen.getByText(/Your normal: 6\.\d h/)).toBeInTheDocument()
    },
  )

  it('shows the check-in streak in the Today card (M5)', () => {
    loadScenario('sleep-debt')
    renderApp('/')

    const today = screen.getByRole('region', { name: 'Today' })
    // Every seeded day up to yesterday has a complete check-in; today's is not done yet.
    expect(today).toHaveTextContent(
      'Check-in streak: 141 days (14-day check-in streak)',
    )
  })
})

describe('Home alert links (M4)', () => {
  it('links each alert to its detail screen', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/')

    const link = screen.getByRole('link', {
      name: 'Sleep has been low for several nights',
    })
    expect(link).toHaveAttribute('href', '/alert/R-SLEEP-01%3Ac1')
    await user.click(link)
    expect(screen.getByRole('region', { name: 'Who leads' })).toHaveTextContent(
      'You can handle this yourself.',
    )
  })

  it('shows the first step of an act alert without a click', () => {
    loadScenario('solar-storm')
    renderApp('/')

    const alerts = screen.getByRole('region', { name: 'Active alerts' })
    expect(alerts).toHaveTextContent(
      'Start now: Stop your current task and make it safe.',
    )
    expect(alerts).toHaveTextContent('Environment · Consult the ground')
  })

  it('marks an acknowledged alert', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().acknowledgeAlert('R-SLEEP-01:c1')
    renderApp('/')
    expect(
      screen.getByRole('region', { name: 'Active alerts' }),
    ).toHaveTextContent('Head · You can handle this yourself · Acknowledged')
  })
})

describe('Home with other scenarios', () => {
  it('turns Abdomen to Act after a temperature 2.5 °C above the baseline', () => {
    loadScenario('baseline-healthy')
    const baseline = selectEvaluation(useAppStore.getState()).baselines
      .body_temp
    if (!baseline?.ready)
      throw new Error('expected a ready temperature baseline')
    const high = Math.round((baseline.center + 2.5) * 10) / 10

    expect(useAppStore.getState().addReading('body_temp', high)).toEqual({
      ok: true,
    })
    renderApp('/')

    expect(
      screen.getByRole('button', { name: 'Abdomen: Act' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Active alerts' })).getByText(
        'Temperature is well above your normal',
      ),
    ).toBeInTheDocument()
  })

  it(
    'shows learning-your-normal text early in the mission',
    { timeout: 30000 },
    async () => {
      const user = userEvent.setup()
      loadScenario('early-mission')
      renderApp('/')

      await user.click(screen.getByRole('button', { name: 'Chest: Good' }))
      // Day 4: the 3 most recent days are left out of a baseline, so 1 day counts.
      expect(
        (
          await screen.findAllByText(
            /Learning your normal \(1 of 7\)/,
            {},
            LAZY_PAGE_WAIT,
          )
        ).length,
      ).toBeGreaterThan(0)
    },
  )

  it('shows missing data next to an alert, and Environment as No data without a sample', () => {
    loadScenario('low-glucose')
    const { context } = useAppStore.getState()
    // Drop today's habitat sample: the feeds are now missing, not normal.
    useAppStore.setState({ context: context.slice(0, -1) })
    renderApp('/')

    expect(
      screen.getByRole('button', { name: 'Abdomen: Act' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Environment: No data' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Missing: today's habitat sample"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Habitat feed:/)).toBeInTheDocument()
  })

  it('says Good for Skin means only "no active alert"', async () => {
    const user = userEvent.setup()
    loadScenario('baseline-healthy')
    renderApp('/')

    await user.click(screen.getByRole('button', { name: 'Skin: Good' }))
    expect(
      screen.getByText(/It does not show that your skin is healthy/),
    ).toBeInTheDocument()
  })
})
