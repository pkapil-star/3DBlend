import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'
import { SuitReplayControls } from '../../demo/SuitReplayControls.tsx'

// The 3D view needs WebGL, which jsdom lacks; Body3D.test.tsx covers it.
vi.mock('../viewer/webgl.ts', () => ({ canUseWebGL: () => false }))

const ENTRY =
  'Right outer shoulder · 4/10 · after overhead work · Crew-reported soreness'

beforeAll(() => {
  const text = readFileSync(
    join(process.cwd(), 'public', 'seed', 'suit-replay.json'),
    'utf8',
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => JSON.parse(text),
    })),
  )
})

function card(name: string) {
  return screen.getByRole('article', { name })
}

describe('Body screen', () => {
  it('is in the main navigation', () => {
    loadScenario('sleep-debt')
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Body' })).toHaveAttribute(
      'href',
      '/body',
    )
  })

  it('saves a report by keyboard: Tab, arrow keys and Enter', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/body')
    const area = screen.getByLabelText('Where is it sore?')
    area.focus()
    // A real browser changes a closed select with the arrow keys; jsdom does
    // not, so the choice is made here and the browser check covers the keys.
    await user.selectOptions(area, 'shoulder_r_outer')
    await user.tab()
    expect(
      screen.getByRole('link', { name: 'Deltoid, Musculoskeletal Atlas' }),
    ).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Describe the place')).toHaveFocus()
    expect(screen.getByLabelText('Describe the place')).toHaveValue(
      'Right outer shoulder',
    )
    await user.tab()
    expect(screen.getByLabelText('Soreness score, slider')).toHaveFocus()
    await user.keyboard(
      '{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowLeft}',
    )
    await user.tab()
    expect(screen.getByLabelText('Score from 0 to 10')).toHaveValue(4)
    await user.tab()
    await user.keyboard('after overhead work{Enter}')

    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      `Saved: ${ENTRY}`,
    )
    const list = screen.getByRole('region', { name: 'Your soreness reports' })
    expect(within(list).getByText(ENTRY)).toBeInTheDocument()
    expect(useAppStore.getState().soreness).toHaveLength(1)
  })

  it('says what is missing instead of saving', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/body')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Describe where it is sore.')).toBeInTheDocument()
    expect(screen.getByLabelText('Describe the place')).toHaveFocus()
    expect(useAppStore.getState().soreness).toEqual([])
  })

  it('shows each crew member only their own reports', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    useAppStore.getState().addSorenessReport({
      score: 4,
      areaId: 'shoulder_r_outer',
      locationText: 'Right outer shoulder',
      activityNote: 'after overhead work',
      anchor: null,
    })
    renderApp('/body')
    expect(screen.getByText(ENTRY)).toBeInTheDocument()
    act(() => useAppStore.getState().switchCrew('c2'))
    expect(screen.queryByText(ENTRY)).not.toBeInTheDocument()
    expect(screen.getByText('No soreness reported yet.')).toBeInTheDocument()
    act(() => useAppStore.getState().switchCrew('c1'))
    expect(screen.getByText(ENTRY)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Remove: ${ENTRY}` }))
    expect(screen.getByText('No soreness reported yet.')).toBeInTheDocument()
  })

  it('shows the three simulated sensor cards with the readout rules', async () => {
    loadScenario('sleep-debt')
    renderApp('/body')
    const forearm = await screen.findByRole('article', { name: 'Left forearm' })
    expect(within(forearm).getByText('No current reading')).toBeInTheDocument()
    expect(
      within(forearm).getByText(
        /^Last valid reading: 3\d\.\d °C at day 142, 08:25 \(35 min ago\)$/,
      ),
    ).toBeInTheDocument()
    expect(within(forearm).getByText(/Contact lost/)).toBeInTheDocument()

    const back = card('Upper back')
    expect(within(back).getByText('34.0 °C')).toBeInTheDocument()
    expect(within(back).getByText('at day 142, 09:00')).toBeInTheDocument()
    expect(within(back).getByText('Sensor contact OK')).toBeInTheDocument()
    expect(
      within(back).getByText('Up 0.5 °C in the last hour'),
    ).toBeInTheDocument()

    expect(screen.getAllByText('Simulated skin temperature')).toHaveLength(3)
    expect(
      within(card('Chest')).getByText(/not used in health alerts/),
    ).toBeInTheDocument()
  })

  it('says when a crew member has no suit data', async () => {
    loadScenario('sleep-debt')
    useAppStore.getState().switchCrew('c3')
    renderApp('/body')
    expect(
      await screen.findByText('No suit data for this crew member.'),
    ).toBeInTheDocument()
  })

  it('a stale replay shows no current values', async () => {
    loadScenario('sleep-debt')
    useAppStore.getState().advanceTime(2 * 86_400_000)
    renderApp('/body')
    const chest = await screen.findByRole('article', { name: 'Chest' })
    expect(within(chest).getByText('No current reading')).toBeInTheDocument()
    expect(
      within(chest).getByText(/No new sample in the last 15 minutes/),
    ).toBeInTheDocument()
  })
})

describe('Restart suit replay (presenter tools)', () => {
  it('re-anchors the replay at the current mission time and says so', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    useAppStore.getState().advanceTime(30 * 60_000)
    render(<SuitReplayControls />)
    await user.click(
      screen.getByRole('button', { name: 'Restart suit replay' }),
    )
    expect(useAppStore.getState().suit.anchorMs).toBe(
      useAppStore.getState().mission.nowMs,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Suit replay restarted at day 142, 09:30.',
    )
  })
})
