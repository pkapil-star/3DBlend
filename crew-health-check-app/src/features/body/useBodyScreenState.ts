import { useState } from 'react'
import type { SensorSiteId } from '../../bodyview/types.ts'
import { EMPTY_DRAFT, type SorenessDraft } from './sorenessDraft.ts'

interface ScreenState {
  crewId: string
  draft: SorenessDraft
  selectedReportId: string | null
  selectedSite: SensorSiteId | null
  turnRequest: { site: SensorSiteId; nonce: number } | null
}

function fresh(crewId: string): ScreenState {
  return {
    crewId,
    draft: EMPTY_DRAFT,
    selectedReportId: null,
    selectedSite: null,
    turnRequest: null,
  }
}

/**
 * The Body screen's own state: the half-filled form and what is selected.
 * It belongs to one crew member; switching crew member starts afresh.
 */
export function useBodyScreenState(crewId: string) {
  const [stored, setStored] = useState(() => fresh(crewId))
  const state = stored.crewId === crewId ? stored : fresh(crewId)
  const update = (change: Partial<ScreenState>) =>
    setStored({ ...state, ...change, crewId })

  return {
    draft: state.draft,
    setDraft: (draft: SorenessDraft) => update({ draft }),
    selectedReportId: state.selectedReportId,
    selectReport: (selectedReportId: string | null) =>
      update({ selectedReportId }),
    selectedSite: state.selectedSite,
    selectSite: (selectedSite: SensorSiteId | null) => update({ selectedSite }),
    turnRequest: state.turnRequest,
    requestTurn: (site: SensorSiteId) =>
      update({
        turnRequest: { site, nonce: (state.turnRequest?.nonce ?? 0) + 1 },
      }),
  }
}
