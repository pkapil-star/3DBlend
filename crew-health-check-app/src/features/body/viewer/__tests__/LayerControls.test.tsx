import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayerControls } from '../LayerControls.tsx'

const skin = { id: 'skin', label: 'Skin', surface: true, visible: true }
const skeleton = {
  id: 'skeleton',
  label: 'Skeleton',
  surface: false,
  visible: false,
}
const layers = [skin, skeleton]

describe('LayerControls (section 23.12)', () => {
  it('lists the layers as checkboxes and reports a change', async () => {
    const onChange = vi.fn()
    render(<LayerControls layers={layers} onChange={onChange} />)
    expect(
      screen.getByRole('group', { name: 'Anatomical layers' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Skin' })).toBeChecked()
    await userEvent
      .setup()
      .click(screen.getByRole('checkbox', { name: 'Skeleton' }))
    expect(onChange).toHaveBeenCalledWith('skeleton', true)
    expect(
      screen.getByText(/not your own body and not a finding about you/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Turn the skin layer on/)).not.toBeInTheDocument()
  })

  it('says pins need the skin when the skin layer is hidden', () => {
    render(
      <LayerControls
        layers={[{ ...skin, visible: false }, skeleton]}
        onChange={() => undefined}
      />,
    )
    expect(
      screen.getByText(
        'Pins go on the skin only. Turn the skin layer on to place a pin.',
      ),
    ).toBeInTheDocument()
  })
})
