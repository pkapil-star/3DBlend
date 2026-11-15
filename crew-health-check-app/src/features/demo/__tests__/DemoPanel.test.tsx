import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// The app fetches scenario files from its own site; here they come from disk.
function serveSeedFiles() {
  vi.stubGlobal('fetch', async (url: string) => {
    const name = String(url).split('/seed/')[1] ?? ''
    const body = readFileSync(
      join(process.cwd(), 'public', 'seed', name),
      'utf8',
    )
    return { ok: true, status: 200, json: async () => JSON.parse(body) }
  })
}

beforeEach(() => serveSeedFiles())
afterEach(() => vi.unstubAllGlobals())

const panel = () => screen.queryByRole('dialog', { name: 'Presenter tools' })

describe('presenter tools', () => {
  it('opens with Shift+D, focuses its heading and closes with Escape', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/')

    await user.keyboard('{Shift>}D{/Shift}')
    expect(panel()).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Presenter tools' }),
    ).toHaveFocus()
    expect(
      await screen.findByText('A solar particle event starts today'),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(panel()).not.toBeInTheDocument()
  })

  it('opens from the footer and gives focus back to it when closed', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    const { container } = renderApp('/')

    const opener = screen.getByRole('button', { name: 'Presenter tools' })
    await user.click(opener)
    expect(panel()).toBeInTheDocument()
    // The page behind cannot be used while the drawer is open.
    expect(container.querySelector('[inert]')).not.toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Close presenter tools' }),
    )
    expect(panel()).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('does not open while someone types into a field', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/check-in')

    await user.click(screen.getByLabelText(/Sleep last night/))
    await user.keyboard('{Shift>}D{/Shift}')
    expect(panel()).not.toBeInTheDocument()
  })

  it('loads a scenario, closes and shows Home', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/check-in')

    await user.click(screen.getByRole('button', { name: 'Presenter tools' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Presenter tools',
    })
    // The scenario list arrives after a fetch, so wait for it.
    expect(
      await within(dialog).findByText(
        /Day 142 · Mars transit vehicle · Loaded now/,
      ),
    ).toBeInTheDocument()
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'Load scenario: A solar particle event starts today',
      }),
    )

    await waitFor(() => expect(panel()).not.toBeInTheDocument())
    expect(useAppStore.getState().mission.scenarioId).toBe('solar-storm')
    // Home renders after the navigation that follows the store update.
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'How you are doing today',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Solar particle event in progress' }),
    ).toBeInTheDocument()
  })

  it('marks the scenarios that replay real DONKI events, and only those', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/')

    await user.click(screen.getByRole('button', { name: 'Presenter tools' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Presenter tools',
    })
    await within(dialog).findByText('A solar particle event starts today')
    expect(dialog).toHaveTextContent(
      'The crew members and their health readings are simulated in every scenario.',
    )
    const items = within(dialog).getAllByRole('listitem')
    const marked = items
      .filter((item) => within(item).queryByText('Historical solar event'))
      .map((item) => item.querySelector('p')?.textContent)
    expect(marked).toEqual([
      'A solar particle event starts today',
      'A large solar flare this morning: the model outlook',
    ])
    const storm = items.find((item) =>
      item.textContent?.includes('A solar particle event starts today'),
    )
    expect(storm).toHaveTextContent(
      'Timing from NASA DONKI solar particle event 2023-08-08T01:00:00-SEP-001',
    )
    expect(storm).toHaveTextContent(
      'The crew and their health readings are simulated.',
    )
  })

  it('loads the model outlook scenario and shows its watch alert on Home', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/')

    await user.click(screen.getByRole('button', { name: 'Presenter tools' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Presenter tools',
    })
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'Load scenario: A large solar flare this morning: the model outlook',
      }),
    )

    await waitFor(() => expect(panel()).not.toBeInTheDocument())
    expect(useAppStore.getState().mission.scenarioId).toBe('solar-flare-watch')
    expect(
      screen.getByRole('link', {
        name: 'Solar flare outlook: possible particle event',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Historical solar event')).toBeInTheDocument()
  })
})
