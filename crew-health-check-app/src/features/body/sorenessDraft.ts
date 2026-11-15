import type { SorenessInput } from '../../bodyview/pins.ts'
import { bodyAreaIdSchema } from '../../bodyview/schemas.ts'
import type { BodyAreaId, PinAnchor } from '../../bodyview/types.ts'
import { bodyAreas } from '../../data/bodyView.ts'

// What the soreness form holds while it is being filled in. It lives on the
// Body screen so that a tap on the 3D body can pre-fill it (section 22.5).

/** '' before a choice; 'other' for "Other, describe it". */
export type AreaChoice = BodyAreaId | 'other' | ''

export interface SorenessDraft {
  area: AreaChoice
  locationText: string
  /** The number field's text, so it can be empty while someone types. */
  score: string
  activityNote: string
  anchor: PinAnchor | null
}

export const EMPTY_DRAFT: SorenessDraft = {
  area: '',
  locationText: '',
  score: '0',
  activityNote: '',
  anchor: null,
}

export function areaLabel(id: BodyAreaId): string {
  const area = [...bodyAreas.named, ...bodyAreas.general].find(
    (entry) => entry.id === id,
  )
  return area?.label ?? id
}

/** Reads the area select's value; anything unexpected counts as no choice. */
export function toAreaChoice(value: string): AreaChoice {
  if (value === 'other') return 'other'
  const parsed = bodyAreaIdSchema.safeParse(value)
  return parsed.success ? parsed.data : ''
}

/** Choosing an area pre-fills the location words; "Other" leaves them for the crew member. */
export function withArea(
  draft: SorenessDraft,
  area: AreaChoice,
): SorenessDraft {
  if (area === '' || area === 'other')
    return { ...draft, area, locationText: '' }
  return { ...draft, area, locationText: areaLabel(area) }
}

export function draftToInput(draft: SorenessDraft): SorenessInput {
  const scoreText = draft.score.trim()
  return {
    score: scoreText === '' ? Number.NaN : Number(scoreText),
    areaId: draft.area === '' || draft.area === 'other' ? null : draft.area,
    locationText: draft.locationText,
    activityNote: draft.activityNote,
    anchor: draft.anchor,
  }
}
