import { create } from 'zustand'
import {
  contractSummary,
  type ContractResult,
} from '../bodyview/modelContract.ts'

// What happened when a body model was last loaded in this session, for the
// Body screen's fallback and the presenter tools' model line (section 22.10).
// Derived at load time and never persisted.

export interface BodyModelLoadStatus {
  version: string
  state: 'loading' | 'ready' | 'failed'
  contract: ContractResult | null
}

interface BodyModelStatusState {
  byModel: Record<string, BodyModelLoadStatus>
  report: (modelId: string, status: BodyModelLoadStatus) => void
  forget: (modelId: string) => void
}

function sameStatus(
  before: BodyModelLoadStatus | undefined,
  after: BodyModelLoadStatus,
): boolean {
  return (
    before !== undefined &&
    before.version === after.version &&
    before.state === after.state &&
    before.contract?.outcome === after.contract?.outcome &&
    before.contract?.missing.join() === after.contract?.missing.join()
  )
}

export const useBodyModelStatus = create<BodyModelStatusState>()((set) => ({
  byModel: {},
  report: (modelId, status) =>
    set((state) =>
      sameStatus(state.byModel[modelId], status)
        ? state
        : { byModel: { ...state.byModel, [modelId]: status } },
    ),
  forget: (modelId) =>
    set((state) => ({
      byModel: Object.fromEntries(
        Object.entries(state.byModel).filter(([id]) => id !== modelId),
      ),
    })),
}))

export function loadStatusText(
  status: BodyModelLoadStatus | undefined,
  version: string,
): string {
  if (!status || status.version !== version) return 'Not loaded in this session'
  if (status.state === 'loading') return 'Loading'
  if (status.state === 'ready') {
    return status.contract
      ? `Loaded: ${contractSummary(status.contract)}`
      : 'Loaded'
  }
  return status.contract
    ? `Could not be used. ${contractSummary(status.contract)}`
    : 'Could not be loaded'
}
