import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'

const todaysReadings = () => {
  const { readings, mission } = useAppStore.getState()
  return readings.filter(
    (reading) =>
      reading.origin === 'manual' && reading.crewId === mission.activeCrewId,
  )
}

describe('daily check-in', () => {
  it('accepts a sleep value and moves to the next step', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/check-in')

    expect(
      screen.getByRole('heading', { name: 'Step 1 of 9: Sleep' }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Sleep last night/), '6.5')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(todaysReadings()).toEqual([
      expect.objectContaining({
        indicator: 'sleep_hours',
        value: 6.5,
        day: 142,
      }),
    ])
    expect(
      screen.getByRole('heading', { name: 'Step 2 of 9: Mood' }),
    ).toHaveFocus()
  })

  it('rejects an out-of-range value with an inline message and saves nothing', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/check-in')

    const input = screen.getByLabelText(/Sleep last night/)
    await user.type(input, '99')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a value between 0 and 14 h.',
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveValue(99)
    expect(todaysReadings()).toEqual([])
    expect(
      screen.getByRole('heading', { name: 'Step 1 of 9: Sleep' }),
    ).toBeInTheDocument()
  })

  it('asks for a value when the field is empty', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/check-in')

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a value, or choose Skip for now.',
    )
  })

  it("shows yesterday's value as a hint and never pre-fills the field", () => {
    loadScenario('sleep-debt')
    renderApp('/check-in')

    expect(screen.getByLabelText(/Sleep last night/)).toHaveValue(null)
    expect(screen.getByText(/^Yesterday: \d\.\d\d h\./)).toBeInTheDocument()
  })

  it('explains how to measure and why it matters, with a source link', () => {
    loadScenario('sleep-debt')
    renderApp('/check-in')

    expect(screen.getByText('How to measure')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Crews are scheduled 8.5 hours of sleep but average about 6.',
      ),
    ).toBeInTheDocument()
    const source = screen.getByRole('link', {
      name: /Prevalence of sleep deficiency/,
    })
    expect(source).toHaveAttribute(
      'href',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/',
    )
    expect(screen.getAllByText('Unverified source').length).toBeGreaterThan(0)
  })

  it('works by keyboard only: type, Enter to save, skip a step, and it stays due', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    renderApp('/check-in')

    await user.click(screen.getByLabelText(/Sleep last night/))
    await user.keyboard('7{Enter}')
    expect(
      screen.getByRole('heading', { name: 'Step 2 of 9: Mood' }),
    ).toBeInTheDocument()

    // Mood: move to the "Skip for now" button with Tab and press Enter.
    const skip = screen.getByRole('button', { name: 'Skip for now' })
    while (document.activeElement !== skip) {
      await user.tab()
    }
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('heading', { name: 'Step 3 of 9: Symptoms' }),
    ).toBeInTheDocument()
    expect(todaysReadings().map((reading) => reading.indicator)).toEqual([
      'sleep_hours',
    ])
  })

  it('saves blood pressure only when both numbers are valid', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    useAppStore.getState().addReading('sleep_hours', 7)
    useAppStore.getState().addReading('mood', 4)
    useAppStore.getState().reportSymptoms([])
    renderApp('/check-in')

    expect(
      screen.getByRole('heading', { name: 'Step 4 of 9: Blood pressure' }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Blood pressure, upper/), '118')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a value')
    expect(
      todaysReadings().some((reading) => reading.indicator === 'systolic_bp'),
    ).toBe(false)

    await user.type(screen.getByLabelText(/Blood pressure, lower/), '74')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(
      todaysReadings()
        .filter((reading) => reading.indicator.endsWith('_bp'))
        .map((reading) => reading.value),
    ).toEqual([118, 74])
  })

  it('records "None today" for symptoms and a mood choice', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    useAppStore.getState().addReading('sleep_hours', 7)
    renderApp('/check-in')

    await user.click(screen.getByRole('radio', { name: /^4/ }))
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(todaysReadings().at(-1)).toMatchObject({
      indicator: 'mood',
      value: 4,
    })

    await user.click(screen.getByRole('checkbox', { name: 'None today' }))
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(useAppStore.getState().noSymptomDays).toEqual({ c1: [142] })
  })

  it('ends with a summary, and skipped items stay due on Home', async () => {
    const user = userEvent.setup()
    loadScenario('sleep-debt')
    useAppStore.getState().addReading('sleep_hours', 7)
    renderApp('/check-in')

    for (let step = 2; step <= 8; step++) {
      await user.click(screen.getByRole('button', { name: 'Skip for now' }))
    }
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(
      screen.getByRole('heading', { name: 'Summary of today' }),
    ).toBeInTheDocument()
    expect(screen.getByText('7.00 h')).toBeInTheDocument()
    expect(screen.getAllByText('Not entered').length).toBe(7)

    await user.click(screen.getByRole('link', { name: 'Done' }))
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('Check-in: 1 of 8 done')).toBeInTheDocument()
    // Skipped steps are named as still due, in check-in order.
    expect(today).toHaveTextContent(
      'Still to do today: Mood, Symptoms, Blood pressure, Heart rate, Temperature, Blood sugar, Exercise',
    )
  })
})
