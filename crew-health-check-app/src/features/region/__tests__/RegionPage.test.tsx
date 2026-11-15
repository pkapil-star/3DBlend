import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { healthData } from '../../../data/index.ts'
import {
  computeBaseline,
  lastReadingPerDay,
  missionDayOf,
} from '../../../engine/index.ts'
import { indicatorDef } from '../../../lib/labels.ts'
import { trendSummary, trendWindow } from '../../../lib/trendSummary.ts'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// Region detail (ARCHITECTURE.md sections 19.3 and 31.11). The page loads on
// first visit (it carries the chart library), so the tests wait for it.

const WAIT = { timeout: 10000 }

async function openRegion(path: string) {
  renderApp(path)
  return screen.findByRole('heading', { level: 1 }, WAIT)
}

// The screen loads lazily with its chart library; a busy machine can take seconds.
describe('the region page', { timeout: 30000 }, () => {
  it('shows Head in sleep-debt: status, the sleep alert, the normal and the dip against the band', async () => {
    loadScenario('sleep-debt')
    const heading = await openRegion('/region/head')
    expect(heading).toHaveTextContent('Head')
    expect(screen.getAllByText('Watch').length).toBeGreaterThan(0)

    const alerts = screen.getByRole('region', {
      name: 'Active alerts in this area',
    })
    expect(
      within(alerts).getByRole('link', {
        name: 'Sleep has been low for several nights',
      }),
    ).toBeInTheDocument()

    const sleep = screen.getByRole('region', { name: 'Sleep last night' })
    expect(
      within(sleep).getByText(/^Your normal: 6\.\d h$/),
    ).toBeInTheDocument()
    // The summary under the chart, computed from the same readings the page shows.
    const state = useAppStore.getState()
    const def = indicatorDef('sleep_hours')
    const today = missionDayOf(state.mission.nowMs)
    const values = lastReadingPerDay(
      state.readings.filter((reading) => reading.crewId === 'c1'),
      'sleep_hours',
    )
    const expected = trendSummary(
      trendWindow(values, today),
      computeBaseline(values, def, today),
      def,
    )
    expect(expected).toMatch(
      /^Down \d\.\d h from your normal over the last 5 readings; [45] of 5 outside your usual range\.$/,
    )
    expect(within(sleep).getByText(expected)).toBeInTheDocument()
  })

  it('explains why each reading matters in space, with sources', async () => {
    loadScenario('sleep-debt')
    await openRegion('/region/head')

    const why = screen.getByRole('region', {
      name: 'Why this matters in space',
    })
    for (const def of healthData.indicators.filter(
      (entry) => entry.region === 'head',
    )) {
      expect(within(why).getByText(def.whyInSpace)).toBeInTheDocument()
    }
    expect(within(why).getAllByRole('link').length).toBeGreaterThan(0)
  })

  it('shows the simulated habitat feeds for Environment, and its rules as the reasons', async () => {
    loadScenario('sleep-debt')
    await openRegion('/region/whole_body')

    expect(screen.getByText('Simulated habitat feed')).toBeInTheDocument()
    const why = screen.getByRole('region', {
      name: 'Why this matters in space',
    })
    expect(
      within(why).getByText('Cabin CO2 is above the limit'),
    ).toBeInTheDocument()
  })

  it('says the baseline is still learning early in the mission', async () => {
    loadScenario('early-mission')
    await openRegion('/region/heart')

    expect(
      screen.getAllByText(/Learning your normal \(1 of 7\)/).length,
    ).toBeGreaterThan(0)
  })

  it('lists second opinions about the area without changing its status', async () => {
    loadScenario('pattern-shift')
    await openRegion('/region/head')

    expect(
      screen.getByRole('region', { name: 'Second opinions about this area' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Good').length).toBeGreaterThan(0)
  })

  it('says so for an area that does not exist', async () => {
    loadScenario('sleep-debt')
    const heading = await openRegion('/region/elbow')
    expect(heading).toHaveTextContent('No such body area')
  })
})
