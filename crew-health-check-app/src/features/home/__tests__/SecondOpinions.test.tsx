import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { personalPatternModel } from '../../../data/index.ts'
import { useAppStore } from '../../../store/index.ts'
import { selectEvaluation } from '../../../store/selectors.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

// The Home "Second opinions" card (ARCHITECTURE.md section 26.17). Wording is
// read from the model file, so the tests follow the file, not typed copies.

const card = () => screen.getByRole('region', { name: 'Second opinions' })

// The region page is a lazy chunk with Recharts. Its first import in a test
// worker is transformed on the fly, which can take more than 10 s while
// every test file runs in parallel; the wait stays inside the 30 s limit.
const LAZY_PAGE_WAIT = { timeout: 25000 }

describe('Second opinions on Home', () => {
  it('shows the pattern-shift insight with three factors, its caveat and its tag, and no number', () => {
    loadScenario('pattern-shift')
    renderApp('/')

    const region = card()
    const insight = within(region).getByRole('article', {
      name: personalPatternModel.headline,
    })
    expect(within(insight).getByText('Insight')).toBeInTheDocument()
    expect(within(insight).getByText('Model estimate')).toBeInTheDocument()
    expect(
      within(insight).getByText(
        `${personalPatternModel.modelId} ${personalPatternModel.version}`,
      ),
    ).toBeInTheDocument()
    expect(
      within(insight).getByText(personalPatternModel.caveat),
    ).toBeInTheDocument()
    const factors = within(insight).getAllByRole('listitem')
    expect(factors).toHaveLength(3)
    for (const factor of factors) {
      expect(factor.textContent).toMatch(/: (higher|lower) than your normal/)
    }
    expect(region.textContent).not.toMatch(/%/)
    // The raw score belongs on the model card, never on the crew card.
    const [shown] = selectEvaluation(useAppStore.getState()).insights
    expect(region.textContent).not.toContain(shown?.score.toFixed(2) ?? '')
    expect(region.textContent).not.toContain(shown?.score.toFixed(1) ?? '')
    expect(
      within(insight).getByRole('link', { name: 'How this model works' }),
    ).toHaveAttribute('href', '/model/personal-pattern')
  })

  it('says each factor in the direction the scenario shifted it', () => {
    loadScenario('pattern-shift')
    renderApp('/')

    // pattern-shift lowers sleep and mood and raises heart rate and reaction time.
    const expected: Record<string, string> = {
      'Sleep last night': 'lower',
      Mood: 'lower',
      'Resting heart rate': 'higher',
      'Reaction time': 'higher',
    }
    const insight = within(card()).getByRole('article')
    const items = within(insight).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    for (const item of items) {
      const [label, rest] = (item.textContent ?? '').split(': ')
      expect(Object.keys(expected)).toContain(label)
      expect(
        rest?.startsWith(`${expected[label ?? '']} than your normal`),
      ).toBe(true)
    }
  })

  it('changes no status: pattern-shift has no alert and Home stays Good', () => {
    loadScenario('pattern-shift')
    renderApp('/')

    const evaluation = selectEvaluation(useAppStore.getState())
    expect(evaluation.alerts).toEqual([])
    expect(evaluation.overall).toBe('good')
    expect(
      screen.getByRole('button', { name: 'Head: Good' }),
    ).toBeInTheDocument()
  })

  it('says it is still learning early in the mission', () => {
    loadScenario('early-mission')
    renderApp('/')

    const readiness = selectEvaluation(useAppStore.getState()).patternReadiness
    expect(readiness?.ready).toBe(false)
    expect(
      within(card()).getByText(
        `Learning your pattern (${readiness?.daysAvailable} of ${personalPatternModel.minDays} days)`,
      ),
    ).toBeInTheDocument()
  })

  it("waits for today's check-in", () => {
    loadScenario('sleep-debt')
    renderApp('/')

    expect(
      within(card()).getByText("Second opinions run after today's check-in"),
    ).toBeInTheDocument()
  })

  it('says when today is not unusual', () => {
    loadScenario('baseline-healthy')
    const state = useAppStore.getState()
    const { baselines } = selectEvaluation(state)
    // Today's check-in at each reading's own normal: nothing unusual.
    for (const id of personalPatternModel.indicators) {
      const baseline = baselines[id]
      if (baseline?.ready) state.addReading(id, baseline.center)
    }
    renderApp('/')

    expect(
      within(card()).getByText('No unusual patterns today'),
    ).toBeInTheDocument()
  })

  it('never sends anything by itself', () => {
    loadScenario('pattern-shift')
    renderApp('/')

    expect(useAppStore.getState().outbox).toEqual([])
  })

  it('sends one consult when the crew chooses, by keyboard, and never a second', async () => {
    const user = userEvent.setup()
    loadScenario('pattern-shift')
    renderApp('/')

    const button = within(card()).getByRole('button', {
      name: 'Send to ground',
    })
    button.focus()
    await user.keyboard('{Enter}')

    const { outbox } = useAppStore.getState()
    const [insight] = selectEvaluation(useAppStore.getState()).insights
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({
      kind: 'consult',
      title: 'Second opinion sent by crew',
      insightKey: insight?.key,
      alertKey: null,
      // The clock is paused and Mars is minutes away: the consult is on its way (M6).
      status: 'in_transit',
    })
    const { link, nowMs } = useAppStore.getState().mission
    expect(outbox[0]?.arrivesAtMs).toBe(nowMs + link.oneWayDelaySec * 1000)
    expect(outbox[0]?.body).toContain('Private medical.')
    expect(outbox[0]?.body).toContain(personalPatternModel.caveat)

    const sent = within(card()).getByText(
      /Second opinion sent by crew at \d\d:\d\d mission time\./,
    )
    expect(sent).toHaveFocus()
    expect(
      within(card()).queryByRole('button', { name: 'Send to ground' }),
    ).toBeNull()

    // The store refuses a second consult for the same insight and day.
    expect(
      useAppStore.getState().sendInsightToGround(insight?.key ?? ''),
    ).toEqual({ ok: true })
    expect(useAppStore.getState().outbox).toHaveLength(1)
  })

  it('refuses to send an insight that is not shown', () => {
    loadScenario('sleep-debt')
    expect(
      useAppStore.getState().sendInsightToGround('personal-pattern:c1:142'),
    ).toEqual({ ok: false, message: 'This insight is no longer shown.' })
    expect(useAppStore.getState().outbox).toEqual([])
  })

  it(
    'lists the insight on the page of the area of its readings, which keeps its status',
    { timeout: 30000 },
    async () => {
      const user = userEvent.setup()
      loadScenario('pattern-shift')
      renderApp('/')

      const list = screen.getByRole('region', { name: 'Status by area' })
      await user.click(within(list).getByRole('link', { name: /^Head: Good/ }))
      const card = await screen.findByRole(
        'region',
        { name: 'Second opinions about this area' },
        LAZY_PAGE_WAIT,
      )
      const item = within(card).getByText(
        new RegExp(`^${personalPatternModel.headline}:`),
      )
      expect(item.textContent).toMatch(/than your normal/)
      expect(screen.getByText('Good')).toBeInTheDocument()
    },
  )
})

describe('the personal pattern model card', () => {
  it('opens at #/model/personal-pattern and says first that its evaluation is simulated', () => {
    loadScenario('pattern-shift')
    renderApp('/model/personal-pattern')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Model card: personal pattern (second opinion)',
      }),
    ).toBeInTheDocument()
    // Once as a tag next to the title, once as the results section.
    expect(screen.getAllByText('Simulated evaluation')).toHaveLength(2)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Simulated evaluation' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/It was evaluated on simulated data only/),
    ).toBeInTheDocument()
  })

  it('shows the simulated results from the model file', () => {
    loadScenario('pattern-shift')
    renderApp('/model/personal-pattern')

    const results = screen.getByRole('region', { name: 'Simulated evaluation' })
    const notice = personalPatternModel.evaluation.falseNotice.model
    expect(results).toHaveTextContent(
      `This model: ${(notice.rate * 100).toFixed(1)}% (${notice.flagged} of ${notice.of};`,
    )
    expect(within(results).getAllByRole('table')).toHaveLength(
      personalPatternModel.evaluation.patterns.length,
    )
  })

  it("shows today's raw score with its meaning, never as a percent", () => {
    loadScenario('pattern-shift')
    renderApp('/model/personal-pattern')

    const [insight] = selectEvaluation(useAppStore.getState()).insights
    const purpose = screen.getByRole('region', { name: 'What it does' })
    expect(purpose).toHaveTextContent(
      `score ${insight?.score.toFixed(2)}. A score above 1 means`,
    )
    expect(purpose).toHaveTextContent('It is not a percentage or a chance.')
  })

  it('keeps the sep-risk card at #/model/sep-risk', () => {
    loadScenario('pattern-shift')
    renderApp('/model/sep-risk')
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Model card: solar flare outlook',
      }),
    ).toBeInTheDocument()
  })
})
