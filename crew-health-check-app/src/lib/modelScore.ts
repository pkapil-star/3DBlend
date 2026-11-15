import { sepRiskModel } from '../data/index.ts'
import type { Alert, ModelEvidence } from '../engine/index.ts'

// Words about the sep-risk model score that several screens share. Every
// number here is read from the model file; none is typed (section 26.15).

/** The hash route of the model card screen (section 19.11). */
export const SEP_RISK_CARD_PATH = '/model/sep-risk'

/** "sep-risk v1" */
export function modelName(model: { modelId: string; version: string }): string {
  return `${model.modelId} ${model.version}`
}

/** The model evidence of an alert, when a model feed raised it. */
export function modelEvidenceOf(alert: Alert): ModelEvidence | null {
  return alert.evidence.find((item) => item.model)?.model ?? null
}

/**
 * What the experimental score is and is not, for the crew (section 26.10):
 * it is about recorded DONKI associations, false alarms are frequent, and it
 * is not a validated probability or a measure of anyone's exposure.
 */
export function scoreLimits(): string[] {
  const test = sepRiskModel.metrics.test.confusion
  const flagged = sepRiskModel.metrics.testFlaggedAtThreshold.flagged
  const years = sepRiskModel.data.splits.test.years
  return [
    "The score reflects how often flares like this one were linked to a recorded solar particle event in NASA's DONKI catalog.",
    `False alarms are frequent: in the held-out test years (${years}), ${test.fp} of the ${flagged} flares the model flagged had no such record.`,
    "It is not a validated probability of an event, and it does not measure anyone's radiation exposure.",
  ]
}
