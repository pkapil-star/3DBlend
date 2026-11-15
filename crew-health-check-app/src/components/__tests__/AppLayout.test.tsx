import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadScenario, renderApp } from '../../test/helpers.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app shell', () => {
  it('shows the not-a-medical-device notice and the simulated data tag', () => {
    loadScenario('sleep-debt')
    renderApp('/')

    expect(
      screen.getByText(
        'Prototype for the NASA Space Apps Challenge. Not a medical device.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Simulated data')).toBeInTheDocument()
  })

  it('marks the current screen in the main navigation', () => {
    loadScenario('sleep-debt')
    renderApp('/check-in')

    const nav = screen.getByRole('navigation', { name: 'Main' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Check-in',
      'Body',
      'Earth link',
    ])
    expect(within(nav).getByRole('link', { name: 'Check-in' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Daily check-in' }),
    ).toBeInTheDocument()
  })

  it('shows the crew member, mission day, environment and link from the store', () => {
    loadScenario('sleep-debt')
    renderApp('/')

    const header = screen.getByRole('banner')
    expect(
      within(header).getByText('Crew member A, Commander'),
    ).toBeInTheDocument()
    expect(within(header).getByText('Day 142')).toBeInTheDocument()
    expect(within(header).getByLabelText('Environment')).toHaveValue(
      'mars_transit',
    )
    expect(
      within(header).getByText('Link up, 3 min each way (Mars near)'),
    ).toBeInTheDocument()
  })

  it('keeps the notice visible while no scenario is loaded', () => {
    // The default scenario is being fetched; this request never finishes.
    vi.stubGlobal('fetch', () => new Promise(() => undefined))
    renderApp('/')

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading the simulated scenario',
    )
    expect(screen.getByText(/Not a medical device/)).toBeInTheDocument()
    expect(screen.getByText('Simulated data')).toBeInTheDocument()
  })
})
