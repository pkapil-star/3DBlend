import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { selectEvaluation } from '../../../store/selectors.ts'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// The Earth link screen (ARCHITECTURE.md sections 15, 19.5 and 31.12).

const store = () => useAppStore.getState()
const outbox = () => screen.getByRole('region', { name: 'Outbox' })

describe('the Earth link screen', () => {
  it('shows the link, and a consult that arrived with its expected reply time', () => {
    loadScenario('solar-storm')
    renderApp('/earth-link')

    const link = screen.getByRole('region', { name: 'Link' })
    expect(within(link).getByText('Link up')).toBeInTheDocument()
    expect(link).toHaveTextContent('One-way delay: 0 s.')
    const item = within(outbox())
      .getByText('Solar particle event in progress')
      .closest('li')
    expect(item).toHaveTextContent('Solar particle event in progress')
    expect(item).toHaveTextContent('Delivered to Earth: a consult request')
    expect(item).toHaveTextContent(/Expected reply around 09:05 on day 120/)
    expect(item).toHaveTextContent(
      'Replies are not simulated in this prototype.',
    )
  })

  it('shows a message on its way with its progress, and the steps it went through', () => {
    loadScenario('sleep-debt')
    store().setDelay(1320)
    store().sendToGround('R-SLEEP-01:c1')
    store().advanceTime(660_000)
    renderApp('/earth-link')

    expect(
      within(outbox()).getByText(
        '50% of the way. Arrives at 09:22 on day 142.',
      ),
    ).toBeInTheDocument()
    expect(
      within(outbox()).getByRole('progressbar', { name: 'Way to Earth' }),
    ).toBeInTheDocument()
    const current = outbox().querySelector('[aria-current="step"]')
    expect(current).toHaveTextContent('2. On its way')
  })

  it('says a message waits while the link is down', () => {
    loadScenario('sleep-debt')
    store().setLinkUp(false)
    store().sendToGround('R-SLEEP-01:c1')
    renderApp('/earth-link')

    expect(
      within(screen.getByRole('region', { name: 'Link' })).getByText(
        'Link down',
      ),
    ).toBeInTheDocument()
    expect(
      within(outbox()).getByText(
        'Waiting for the link: it leaves when the link is back up.',
      ),
    ).toBeInTheDocument()
  })

  it('never shows the text of a private message', () => {
    loadScenario('pattern-shift')
    const [insight] = selectEvaluation(store()).insights
    store().sendInsightToGround(insight?.key ?? '')
    renderApp('/earth-link')

    expect(
      within(outbox()).getByText('Second opinion sent by crew'),
    ).toBeInTheDocument()
    expect(
      within(outbox()).getByText(
        'Private medical message: its text is not shown in this list.',
      ),
    ).toBeInTheDocument()
    expect(within(outbox()).queryByText('Message text')).toBeNull()
  })

  it('says when nothing has been sent', () => {
    loadScenario('baseline-healthy')
    renderApp('/earth-link')
    expect(
      within(outbox()).getByText('Nothing has been sent to Earth yet.'),
    ).toBeInTheDocument()
  })
})
