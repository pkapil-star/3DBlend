import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// The completed presenter tools (ARCHITECTURE.md sections 16 and 31.12).

beforeEach(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const name = String(url).split('/seed/')[1] ?? ''
    const body = readFileSync(
      join(process.cwd(), 'public', 'seed', name),
      'utf8',
    )
    return { ok: true, status: 200, json: async () => JSON.parse(body) }
  })
})
afterEach(() => vi.unstubAllGlobals())

const store = () => useAppStore.getState()

async function openPanel() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Presenter tools' }))
  const dialog = await screen.findByRole('dialog', { name: 'Presenter tools' })
  return { user, dialog }
}

describe('presenter controls', () => {
  it('sets the clock speed, shown as pressed', async () => {
    loadScenario('sleep-debt')
    renderApp('/')
    const { user, dialog } = await openPanel()

    const speeds = within(dialog).getByRole('group', { name: 'Clock speed' })
    expect(
      within(speeds).getByRole('button', { name: 'Paused' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await user.click(
      within(speeds).getByRole('button', { name: '600× (10 min a second)' }),
    )
    expect(store().mission.speed).toBe(600)
    expect(
      within(speeds).getByRole('button', { name: '600× (10 min a second)' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('"+1 day" moves the mission day in the header, and "+10 min" the time', async () => {
    loadScenario('sleep-debt')
    renderApp('/')
    const { user, dialog } = await openPanel()

    await user.click(within(dialog).getByRole('button', { name: '+10 min' }))
    expect(within(dialog).getByText(/Day 142, 09:10/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '+1 day' }))
    expect(within(dialog).getByText(/Day 143, 09:10/)).toBeInTheDocument()
    expect(screen.getByText('Day 143')).toBeInTheDocument()
  })

  it('takes the link down and brings it back', async () => {
    loadScenario('sleep-debt')
    renderApp('/')
    const { user, dialog } = await openPanel()

    await user.click(
      within(dialog).getByRole('button', { name: 'Take the link down' }),
    )
    expect(store().mission.link.linkUp).toBe(false)
    await user.click(
      within(dialog).getByRole('button', { name: 'Bring the link back up' }),
    )
    expect(store().mission.link.linkUp).toBe(true)
    expect(store().mission.link.upSinceMs).toBe(store().mission.nowMs)
  })

  it('switches the crew member', async () => {
    loadScenario('sleep-debt')
    renderApp('/')
    const { user, dialog } = await openPanel()

    await user.selectOptions(within(dialog).getByLabelText('Crew member'), 'c2')
    expect(store().mission.activeCrewId).toBe('c2')
    expect(
      screen.getAllByText('Crew member B, Flight engineer').length,
    ).toBeGreaterThan(0)
  })

  it('resets to seed only after a second, explicit press', async () => {
    loadScenario('sleep-debt')
    store().advanceTime(60 * 60_000)
    renderApp('/')
    const { user, dialog } = await openPanel()

    await user.click(
      within(dialog).getByRole('button', { name: 'Reset to seed' }),
    )
    expect(store().mission.nowMs % 86_400_000).toBe(10 * 3_600_000)
    await user.click(
      within(dialog).getByRole('button', { name: 'Yes, reset to seed' }),
    )
    await vi.waitFor(() =>
      expect(store().mission.nowMs % 86_400_000).toBe(9 * 3_600_000),
    )
  })
})
