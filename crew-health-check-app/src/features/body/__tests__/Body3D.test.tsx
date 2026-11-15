import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, useEffect } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { bodyModelFor, bodyModels } from '../../../data/bodyView.ts'
import { useBodyModelStatus } from '../../../lib/bodyModelStatus.ts'
import { useAppStore } from '../../../store/index.ts'
import { loadScenario, renderApp } from '../../../test/helpers.tsx'
import { BodyViewControls } from '../../demo/BodyViewControls.tsx'
import type { Viewer3DProps } from '../viewer/Viewer3D.tsx'
import { canUseWebGL } from '../viewer/webgl.ts'

// jsdom has no WebGL, so the viewer is replaced by a stand-in that shows what
// it was given and offers the taps a crew member would make on the body.
vi.mock('../viewer/webgl.ts', () => ({ canUseWebGL: vi.fn(() => true) }))
vi.mock('../viewer/Viewer3D.tsx', () => ({
  default: function StubViewer(props: Viewer3DProps) {
    const { onStatus } = props
    useEffect(() => {
      onStatus({ state: 'ready', contract: { outcome: 'accept', missing: [] } })
    }, [onStatus])
    return (
      <div>
        <p>
          Stub viewer: {props.model.version}, {props.pins.length} pins, report{' '}
          {props.selectedReportId ?? 'none'}, sensor{' '}
          {props.selectedSite ?? 'none'}, turn{' '}
          {props.turnRequest?.site ?? 'none'}
        </p>
        <button
          type="button"
          onClick={() =>
            props.onPick(
              {
                target: 'patch_shoulder_r_outer',
                point: [-0.2, 1.4, 0.01],
                normal: [-1, 0, 0],
              },
              props.model,
            )
          }
        >
          Tap shoulder
        </button>
        <button
          type="button"
          onClick={() =>
            props.onPick(
              { target: 'body', point: [0.1, 0.3, 0.05], normal: [0, 0, 1] },
              props.model,
            )
          }
        >
          Tap calf
        </button>
        <button
          type="button"
          onClick={() => props.onStatus({ state: 'failed', contract: null })}
        >
          Fail loading
        </button>
      </div>
    )
  },
}))
vi.mock('../viewer/Compare3D.tsx', () => ({
  default: () => <p>Stub compare view</p>,
}))

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

beforeEach(() => {
  vi.mocked(canUseWebGL).mockReturnValue(true)
  useBodyModelStatus.setState({ byModel: {} })
})

// Crew A's model may be the placeholder or a delivered model; the tests
// expect whatever the manifest says, so publishing one is a data change.
const crewA = bodyModelFor('c1')
if (!crewA) throw new Error('crew A has no body model')

const NO_3D =
  '3D view is not available here. The list and sensor cards show the same information.'

async function open3d() {
  const user = userEvent.setup()
  loadScenario('sleep-debt')
  renderApp('/body')
  await user.click(screen.getByRole('checkbox', { name: 'Show 3D body' }))
  await screen.findByText(/Stub viewer/)
  return user
}

describe('Body screen with the 3D body (B2)', () => {
  it('without WebGL shows one line instead of the toggle, and the form still works', async () => {
    vi.mocked(canUseWebGL).mockReturnValue(false)
    loadScenario('sleep-debt')
    renderApp('/body')
    expect(screen.getByText(NO_3D)).toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Show 3D body' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Where is it sore?')).toBeInTheDocument()
  })

  it('"Force 2D" hides the toggle the same way', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().setForce2d(true)
    renderApp('/body')
    expect(screen.getByText(NO_3D)).toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: 'Show 3D body' }),
    ).not.toBeInTheDocument()
  })

  it('crew member C has no 3D body', () => {
    loadScenario('sleep-debt')
    useAppStore.getState().switchCrew('c3')
    renderApp('/body')
    expect(
      screen.getByText('No 3D body for this crew member.'),
    ).toBeInTheDocument()
  })

  it('is off by default and shows its tags when turned on', async () => {
    loadScenario('sleep-debt')
    renderApp('/body')
    expect(
      screen.getByRole('checkbox', { name: 'Show 3D body' }),
    ).not.toBeChecked()
    expect(screen.queryByText(/Stub viewer/)).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('checkbox', { name: 'Show 3D body' }))
    expect(
      await screen.findByText(new RegExp(`Stub viewer: ${crewA.version}`)),
    ).toBeInTheDocument()
    const tags = {
      'Placeholder model': crewA.status === 'placeholder',
      'AI-assisted model': crewA.aiAssisted,
      'Anatomical atlas model': crewA.layers !== undefined,
    }
    for (const [tag, shown] of Object.entries(tags)) {
      expect(screen.queryByText(tag) !== null, tag).toBe(shown)
    }
    expect(screen.getByText(/not a copy of\s+your body/)).toBeInTheDocument()
    expect(useAppStore.getState().prefs.show3d).toBe(true)
  })

  it('a shoulder tap pre-fills the named area; the saved report keeps its pin', async () => {
    const user = await open3d()
    await user.click(screen.getByRole('button', { name: 'Tap shoulder' }))
    expect(screen.getByLabelText('Where is it sore?')).toHaveValue(
      'shoulder_r_outer',
    )
    expect(screen.getByLabelText('Describe the place')).toHaveValue(
      'Right outer shoulder',
    )
    expect(screen.getByText('Pin placed on the 3D body')).toBeInTheDocument()
    expect(screen.getByText('Placement not yet checked')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Score from 0 to 10'))
    await user.type(screen.getByLabelText('Score from 0 to 10'), '4')
    await user.type(
      screen.getByLabelText('Activity note (optional)'),
      'after overhead work{Enter}',
    )
    const [report] = useAppStore.getState().soreness
    expect(report?.anchor).toEqual({
      modelId: 'crew-a',
      modelVersion: crewA.version,
      target: 'patch_shoulder_r_outer',
      point: [-0.2, 1.4, 0.01],
      normal: [-1, 0, 0],
    })
    expect(screen.getByText(/1 pins/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Highlight pin' }))
    expect(
      screen.getByText(new RegExp(`report ${report?.id ?? 'x'}`)),
    ).toBeInTheDocument()
  })

  it('a calf tap gives a free pin with the cursor in the description; "Remove pin" keeps the form', async () => {
    const user = await open3d()
    await user.click(screen.getByRole('button', { name: 'Tap calf' }))
    expect(screen.getByLabelText('Where is it sore?')).toHaveValue('other')
    expect(screen.getByLabelText('Describe the place')).toHaveValue('')
    expect(screen.getByLabelText('Describe the place')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Remove pin' }))
    expect(
      screen.queryByText('Pin placed on the 3D body'),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tap calf' }))
    await user.type(
      screen.getByLabelText('Describe the place'),
      'Left calf{Enter}',
    )
    const [report] = useAppStore.getState().soreness
    expect(report).toMatchObject({
      areaId: null,
      locationText: 'Left calf',
      score: 0,
    })
    expect(report?.anchor?.target).toBe('body')
  })

  it('does not draw a pin made on another version, and keeps its text', async () => {
    loadScenario('sleep-debt')
    useAppStore.getState().addSorenessReport({
      score: 3,
      areaId: 'shoulder_r_outer',
      locationText: 'Right outer shoulder',
      activityNote: '',
      anchor: {
        modelId: 'crew-a',
        modelVersion: 'chirag-0',
        target: 'body',
        point: [0, 1, 0],
        normal: [0, 0, 1],
      },
    })
    renderApp('/body')
    await userEvent
      .setup()
      .click(screen.getByRole('checkbox', { name: 'Show 3D body' }))
    expect(await screen.findByText(/0 pins/)).toBeInTheDocument()
    expect(
      screen.getByText('Made on an earlier version of this body. Text kept.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Right outer shoulder · 3/10 · Crew-reported soreness'),
    ).toBeInTheDocument()
  })

  it('links sensor cards to markers and turns the view to a sensor', async () => {
    const user = await open3d()
    const back = await screen.findByRole('article', { name: 'Upper back' })
    await user.click(
      within(back).getByRole('button', { name: 'Highlight marker' }),
    )
    expect(screen.getByText(/sensor upper_back/)).toBeInTheDocument()
    await user.click(
      within(back).getByRole('button', { name: 'Turn to this sensor' }),
    )
    expect(screen.getByText(/turn upper_back/)).toBeInTheDocument()
  })

  it('shows the 2D path, not the placeholder, when a body fails to load', async () => {
    const user = await open3d()
    await user.click(screen.getByRole('button', { name: 'Fail loading' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The 3D body could not be loaded.',
    )
    expect(screen.queryByText(/Stub viewer/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Where is it sore?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Stub viewer/)).toBeInTheDocument()
  })
})

describe('Compare bodies (section 22.7)', () => {
  it('without WebGL shows the two profile tables, marked fictional, with the source', () => {
    vi.mocked(canUseWebGL).mockReturnValue(false)
    loadScenario('sleep-debt')
    renderApp('/body/compare')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Compare bodies' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '3D view is not available here. The tables below give the same measurements.',
      ),
    ).toBeInTheDocument()
    for (const model of bodyModels) {
      const region = screen.getByRole('region', { name: model.label })
      const label =
        model.profileSource === 'measured'
          ? 'Measured on the delivered model'
          : 'Fictional measurements'
      expect(within(region).getByText(label)).toBeInTheDocument()
      expect(
        within(region).getByRole('row', {
          name: `Shoulder breadth ${model.profile.shoulderBreadthCm} cm`,
        }),
      ).toBeInTheDocument()
    }
    expect(
      screen.getByRole('link', {
        name: /Anthropometric Measurement Procedures/,
      }),
    ).toBeInTheDocument()
  })

  it('with WebGL shows both bodies in one scene', async () => {
    loadScenario('sleep-debt')
    renderApp('/body/compare')
    expect(await screen.findByText('Stub compare view')).toBeInTheDocument()
  })
})

describe('Presenter tools: body view', () => {
  it('turns "Force 2D" on and shows each crew member’s model', async () => {
    render(<BodyViewControls />)
    expect(
      screen.getByText(
        `Crew member A: ${crewA.status === 'placeholder' ? 'Placeholder model' : 'Delivered model'} (${crewA.version}${crewA.file ? `, ${crewA.file}` : ''}). Not loaded in this session.`,
      ),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('checkbox', { name: /Force 2D/ }))
    expect(useAppStore.getState().prefs.force2d).toBe(true)
    act(() =>
      useBodyModelStatus.getState().report('crew-b', {
        version: bodyModelFor('c2')?.version ?? 'placeholder-1',
        state: 'ready',
        contract: { outcome: 'accept', missing: [] },
      }),
    )
    expect(
      screen.getByText(/Crew member B: .*Loaded: All required parts found\./),
    ).toBeInTheDocument()
  })
})
